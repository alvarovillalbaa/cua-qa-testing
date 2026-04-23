import { Page } from "playwright";
import {
  sendFunctionCallOutput,
  sendInputToModel,
} from "../services/openai-cua-client";
import { handleModelAction } from "../handlers/action-handler";
import logger from "../utils/logger";
import { Socket } from "socket.io";
import TestScriptReviewAgent from "../agents/test-script-review-agent";
import RunRecorder from "./run-recorder";

const defaultWidth = parseInt(process.env.DISPLAY_WIDTH || "1024", 10);
const defaultHeight = parseInt(process.env.DISPLAY_HEIGHT || "768", 10);
const TERMINAL_STATUSES = new Set(["pass", "fail"]);

function transitionRunStatus(
  socket: Socket,
  nextStatus: "running" | "pass" | "fail"
): boolean {
  const currentStatus = (socket.data.testCaseStatus || "pending").toLowerCase();

  if (TERMINAL_STATUSES.has(currentStatus)) return false;

  if (nextStatus === "running" && currentStatus === "pending") {
    socket.data.testCaseStatus = "running";
    return true;
  }

  if (
    (nextStatus === "pass" || nextStatus === "fail") &&
    currentStatus === "running"
  ) {
    socket.data.testCaseStatus = nextStatus;
    return true;
  }

  return false;
}

function emitReviewState(
  socket: Socket,
  runRecorder: RunRecorder,
  payload: string | object
) {
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    socket.emit("testscriptupdate", parsed);
    runRecorder.updateFromReviewState(parsed as any);
    runRecorder.emitSnapshot(socket);
  } catch (error) {
    logger.error(`Failed to parse review state: ${error}`);
  }
}

export async function computerUseLoop(
  page: Page,
  response: any,
  testCaseReviewAgent: TestScriptReviewAgent,
  runRecorder: RunRecorder,
  socket: Socket,
  switchedToNewTab: boolean = false
) {
  transitionRunStatus(socket, "running");

  while (true) {
    testCaseReviewAgent.startNewTurn({ phase: "loop_iteration" });
    await runRecorder.captureEvidence(page, "loop-iteration");

    if (socket.data.testCaseStatus === "fail") {
      logger.debug("Test case failed. Exiting the computer use loop.");
      testCaseReviewAgent.finalizeRun("fail");
      runRecorder.setRunStatus("fail");
      runRecorder.emitSnapshot(socket);
      return response;
    }

    if (socket.data.testCaseStatus === "pass") {
      logger.debug("Test case passed. Exiting the computer use loop.");
      testCaseReviewAgent.finalizeRun("pass");
      runRecorder.setRunStatus("pass");
      runRecorder.emitSnapshot(socket);
      return response;
    }

    const computerCalls = response.output.filter(
      (item: any) => item.type === "computer_call"
    );
    const functionCalls = response.output.filter(
      (item: any) => item.type === "function_call"
    );

    if (functionCalls.length > 0) {
      let advancedFunctionResponse = false;
      for (const funcCall of functionCalls) {
        if (funcCall.name === "capture_data") {
          let parsedArguments: Record<string, unknown> = {};
          try {
            parsedArguments = JSON.parse(funcCall.arguments || "{}");
          } catch {
            parsedArguments = {};
          }
          const schemaName = String(parsedArguments.schema_name || "custom_capture");
          let payload: Record<string, unknown> = {};
          const payloadJson = parsedArguments.payload_json;

          if (typeof payloadJson === "string" && payloadJson.trim()) {
            try {
              const parsedPayload = JSON.parse(payloadJson);
              if (
                parsedPayload &&
                typeof parsedPayload === "object" &&
                !Array.isArray(parsedPayload)
              ) {
                payload = parsedPayload as Record<string, unknown>;
              }
            } catch {
              payload = {
                raw_payload_json: payloadJson,
              };
            }
          }

          const capture = runRecorder.recordCapturedData(schemaName, payload, {
            notes: parsedArguments.notes || "",
            response_id: response.id,
            call_id: funcCall.call_id,
          });
          testCaseReviewAgent.appendTraceEvent("capture_data_function_call", {
            response_id: response.id,
            function_name: funcCall.name,
            call_id: funcCall.call_id,
            schema_name: schemaName,
          });
          response = await sendFunctionCallOutput(funcCall.call_id, response.id, {
            status: "stored",
            capture_id: capture.id,
          });
          advancedFunctionResponse = true;
          break;
        }

        if (funcCall.name === "mark_done") {
          testCaseReviewAgent.appendTraceEvent("model_function_call", {
            response_id: response.id,
            function_name: funcCall.name,
            call_id: funcCall.call_id,
          });
          response = await sendFunctionCallOutput(funcCall.call_id, response.id, {
            status: "done",
          });
          const verdict = testCaseReviewAgent.getCurrentVerdict();
          const finalStatus = verdict === "pass" ? "pass" : "fail";
          socket.emit(
            "message",
            finalStatus === "pass"
              ? "Test case passed."
              : "Test case failed. Please review the failed or pending steps."
          );
          transitionRunStatus(socket, finalStatus);
          testCaseReviewAgent.finalizeRun(
            finalStatus,
            finalStatus === "fail"
              ? "CUA marked the run done before all test steps passed."
              : undefined
          );
          runRecorder.setRunStatus(
            finalStatus,
            finalStatus === "fail"
              ? "CUA marked the run done before all test steps passed."
              : undefined
          );
          if (finalStatus === "fail") {
            runRecorder.finalizeReviewStateOnFailure(
              "CUA marked the run done before all test steps passed."
            );
          }
          runRecorder.emitSnapshot(socket);
          return response;
        }
      }
      if (advancedFunctionResponse) {
        continue;
      }
    }

    socket.data.previousResponseId = response.id;

    if (computerCalls.length === 0) {
      logger.debug("No computer call found. Final output from model:");
      const messageResponse = response.output.filter(
        (item: any) => item.type === "message"
      );

      if (messageResponse.length > 0) {
        const message = messageResponse[0].content[0].text;
        response = await sendInputToModel(
          {
            screenshotBase64: "",
            previousResponseId: response.id,
            lastCallId: message.call_id,
          },
          "continue"
        );
      } else {
        return response;
      }
      continue;
    }

    const reasoningOutputs = response.output.filter(
      (item: any) => item.type === "reasoning"
    );
    if (reasoningOutputs.length > 0) {
      reasoningOutputs.forEach((reason: any) => {
        const summaryText = Array.isArray(reason.summary)
          ? reason.summary.map((s: any) => s.text).join(" ")
          : "No reasoning provided";
        socket.emit("message", summaryText);
      });
    }

    const computerCall = computerCalls[0];
    if (
      computerCall.pending_safety_checks &&
      computerCall.pending_safety_checks.length > 0
    ) {
      const safetyCheck = computerCall.pending_safety_checks[0];
      socket.emit("message", `Safety check detected: ${safetyCheck.message}`);
      transitionRunStatus(socket, "fail");
      runRecorder.setRunStatus("fail", safetyCheck.message);
      runRecorder.finalizeReviewStateOnFailure(safetyCheck.message);
      runRecorder.emitSnapshot(socket);
      return response;
    }

    const lastCallId = (computerCall as any).call_id;
    socket.data.lastCallId = lastCallId;

    const actions: any[] = Array.isArray((computerCall as any).actions)
      ? (computerCall as any).actions
      : (computerCall as any).action
        ? [(computerCall as any).action]
        : [];

    if (actions.length === 0) {
      logger.warn(
        "Computer call did not include actions; sending fresh screenshot back to model."
      );
    }

    for (const action of actions) {
      const { label, target } = await runRecorder.recordActionSelection(
        page,
        action
      );
      socket.emit("message", label);
      testCaseReviewAgent.appendTraceEvent("model_action_selected", {
        response_id: response.id,
        call_id: lastCallId,
        action,
        label,
      });

      if (["click", "double_click"].includes(action?.type)) {
        const screenshotBuffer = await page.screenshot();
        const screenshotBase64 = screenshotBuffer.toString("base64");
        testCaseReviewAgent
          .checkTestScriptStatus(screenshotBase64)
          .then((testScriptReviewResponse) => {
            emitReviewState(socket, runRecorder, testScriptReviewResponse);
          })
          .catch((error) => {
            logger.error(`Error during test script review: ${error}`);
          });
      }

      try {
        await handleModelAction(page, action);
        runRecorder.recordActionResult(action, label, target);
      } catch (error) {
        runRecorder.recordActionFailure(action, error);
        socket.data.testCaseStatus = "fail";
        runRecorder.setRunStatus("fail", String(error));
        runRecorder.finalizeReviewStateOnFailure(String(error));
        runRecorder.emitSnapshot(socket);
        throw error;
      }
    }

    await page.waitForTimeout(1000);
    await runRecorder.captureEvidence(page, "post-action");

    const pages = page.context().pages();
    if (pages.length > 1 && !switchedToNewTab) {
      const newPage = pages[pages.length - 1];
      const viewport = newPage.viewportSize();

      if (
        !viewport ||
        viewport.width !== defaultWidth ||
        viewport.height !== defaultHeight
      ) {
        await newPage.setViewportSize({
          width: defaultWidth,
          height: defaultHeight,
        });
      }

      const screenshotBuffer = await newPage.screenshot();
      const screenshotBase64 = screenshotBuffer.toString("base64");
      response = (await sendInputToModel({
        screenshotBase64,
        previousResponseId: response.id,
        lastCallId,
      })) as any;

      response = await computerUseLoop(
        newPage,
        response,
        testCaseReviewAgent,
        runRecorder,
        socket,
        true
      );
      return response;
    }

    const screenshotBuffer = await getScreenshotWithRetry(page);
    const screenshotBase64 = screenshotBuffer.toString("base64");
    response = (await sendInputToModel({
      screenshotBase64,
      previousResponseId: response.id,
      lastCallId,
    })) as any;
  }
}

async function getScreenshotWithRetry(
  page: Page,
  retries = 3
): Promise<Buffer> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await page.screenshot();
    } catch (error) {
      logger.error(`Attempt ${attempt} - Error capturing screenshot: ${error}`);
      if (attempt === retries) {
        throw error;
      }
      await page.waitForTimeout(2000);
    }
  }
  throw new Error("Failed to capture screenshot after retries");
}
