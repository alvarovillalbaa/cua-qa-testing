import playwright, { Browser, BrowserContext } from "playwright";
import logger from "../utils/logger";
import { computerUseLoop } from "../lib/computer-use-loop";
import { Socket } from "socket.io";
import TestScriptReviewAgent from "../agents/test-script-review-agent";
import { setupCUAModel } from "../services/openai-cua-client";
import { LoginService } from "../services/login-service";
import RunRecorder from "../lib/run-recorder";
import { WorkspaceDocument } from "../lib/workspace-types";
import { getTracePath } from "../lib/workspace-paths";
import { loadLearningContext, runLearningLoop } from "../learning/learning-loop";
import { runEvaluators } from "../evaluators/evaluator-runner";
import { runFinalOutputPipeline } from "../pipelines/final-output-runner";
import { prepareOpenAIFileInputs } from "../lib/openai-file-utils";

const displayWidth: number = parseInt(process.env.DISPLAY_WIDTH || "1024", 10);
const displayHeight: number = parseInt(process.env.DISPLAY_HEIGHT || "768", 10);

function buildExtraHeaders(workspace: WorkspaceDocument) {
  const headers = workspace.runDefaults.headers
    .filter((header) => header.name && header.value)
    .reduce<Record<string, string>>((acc, header) => {
      acc[header.name] = header.value;
      return acc;
    }, {});

  if (workspace.secrets.extraHeaderName && workspace.secrets.extraHeaderValue) {
    headers[workspace.secrets.extraHeaderName] =
      workspace.secrets.extraHeaderValue;
  }

  return headers;
}

function buildContextOptions(workspace: WorkspaceDocument) {
  const options: Parameters<Browser["newContext"]>[0] = {};
  const siteAccessMode = workspace.secrets.siteAccessMode || "none";

  if (siteAccessMode === "headers") {
    const extraHTTPHeaders = buildExtraHeaders(workspace);
    if (Object.keys(extraHTTPHeaders).length > 0) {
      options.extraHTTPHeaders = extraHTTPHeaders;
    }
  }

  if (siteAccessMode === "http_basic") {
    const username = workspace.secrets.siteAccessHttpUsername;
    const password = workspace.secrets.siteAccessHttpPassword;

    if (username && password) {
      options.httpCredentials = {
        username,
        password,
        origin: workspace.secrets.siteAccessOrigin || workspace.runDefaults.website,
      };
    }
  }

  return options;
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
    logger.error(`Failed to emit review state: ${error}`);
  }
}

export async function cuaLoopHandler(
  systemPrompt: string,
  url: string,
  socket: Socket,
  testCaseReviewAgent: TestScriptReviewAgent,
  runRecorder: RunRecorder,
  username: string,
  password: string,
  loginRequired: boolean,
  userInfo?: string,
  workspace?: WorkspaceDocument
) {
  socket.data.testCaseStatus = "running";
  runRecorder.setRunStatus("running");
  testCaseReviewAgent.setRunStatus("running");
  socket.emit("message", "Starting test script execution...");
  runRecorder.emitSnapshot(socket);

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  const resolvedWorkspace = workspace || runRecorder.getWorkspace();
  const learningContext = loadLearningContext(resolvedWorkspace.project.id);

  try {
    browser = await playwright.chromium.launch({
      headless: false,
      env: {},
      args: ["--disable-file-system"],
    });

    const contextOptions = buildContextOptions(resolvedWorkspace);
    logger.info(
      {
        siteAccessMode: resolvedWorkspace.secrets.siteAccessMode || "none",
        siteAccessOrigin:
          resolvedWorkspace.secrets.siteAccessOrigin ||
          resolvedWorkspace.runDefaults.website,
        headerNames: Object.keys(contextOptions.extraHTTPHeaders || {}),
        hasHttpCredentials: Boolean(contextOptions.httpCredentials?.username),
        loginRequired,
      },
      "Creating browser context"
    );

    context = await browser.newContext(contextOptions);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

    const page = await context.newPage();
    socket.data.page = page;
    await runRecorder.attachPageListeners(page);

    logger.debug("Creating new browser instance...");
    socket.emit("message", "Launching browser...");

    await page.setViewportSize({ width: displayWidth, height: displayHeight });
    await page.goto(url);
    await page.waitForTimeout(2000);
    await runRecorder.captureEvidence(page, "initial");

    const screenshotBeforeLogin = await page.screenshot();
    const screenshotBeforeLoginBase64 = screenshotBeforeLogin.toString("base64");
    testCaseReviewAgent
      .checkTestScriptStatus(screenshotBeforeLoginBase64)
      .then((testScriptReviewResponse) => {
        emitReviewState(socket, runRecorder, testScriptReviewResponse);
      })
      .catch((error) => {
        logger.error(`Initial review failed: ${error}`);
      });

    await page.waitForTimeout(2000);

    if (loginRequired) {
      logger.debug("Login required... proceeding with login.");
      socket.emit("message", "Login required... proceeding with login.");

      const loginService = new LoginService();
      await loginService.fillin_login_credentials(username, password, page);
      await page.waitForTimeout(5000);
      await loginService.click_login_button(page);
      await runRecorder.captureEvidence(page, "post-login");

      const screenshotAfterLogin = await page.screenshot();
      const screenshotAfterLoginBase64 = screenshotAfterLogin.toString("base64");
      testCaseReviewAgent
        .checkTestScriptStatus(screenshotAfterLoginBase64)
        .then((testScriptReviewResponse) => {
          emitReviewState(socket, runRecorder, testScriptReviewResponse);
        })
        .catch((error) => {
          logger.error(`Post-login review failed: ${error}`);
        });

      socket.emit(
        "message",
        "Login step executed... proceeding with test script execution."
      );
    }

    const userInfoStr = userInfo ?? "";
    const { refs, inputFiles } = await prepareOpenAIFileInputs(resolvedWorkspace);
    if (refs.length > 0) {
      runRecorder.recordOpenAIFileRefs("cua_setup", refs);
    }
    const initialResponse = await setupCUAModel(
      systemPrompt,
      userInfoStr,
      inputFiles
    );

    const response = await computerUseLoop(
      page,
      initialResponse,
      testCaseReviewAgent,
      runRecorder,
      socket
    );

    const messageResponse = response.output.filter(
      (item: any) => item.type === "message"
    );

    if (messageResponse.length > 0) {
      messageResponse.forEach((message: any) => {
        if (Array.isArray(message.content)) {
          message.content.forEach((contentBlock: any) => {
            if (contentBlock.type === "output_text" && contentBlock.text) {
              socket.emit("message", contentBlock.text);
            }
          });
        }
      });
    }
  } catch (error: any) {
    socket.data.testCaseStatus = "fail";
    logger.error(
      {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        type: error?.type,
        param: error?.param,
        request_id: error?.request_id,
        error: error?.error,
        response: error?.response?.data,
      },
      "Error during playwright loop"
    );
    socket.emit(
      "message",
      `Run failed: ${error?.message || "unknown OpenAI error"}`
    );
    testCaseReviewAgent.appendTraceEvent("cua_loop_error", {
      error: String(error),
    });
    testCaseReviewAgent.finalizeRun("fail", String(error));
    runRecorder.setRunStatus("fail", String(error));
    runRecorder.finalizeReviewStateOnFailure(String(error));
    runRecorder.emitSnapshot(socket);
  } finally {
    if (context) {
      try {
        await context.tracing.stop({
          path: getTracePath(resolvedWorkspace.project.id, runRecorder.getRunId()),
        });
      } catch (error) {
        logger.warn(`Unable to stop tracing cleanly: ${error}`);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch {
        // no-op
      }
    }

    if (runRecorder.getStatus() === "running") {
      runRecorder.setRunStatus("incomplete", "Run ended without a terminal verdict.");
      runRecorder.emitSnapshot(socket);
    }

    const evaluatorResults = await runEvaluators(
      resolvedWorkspace,
      runRecorder,
      learningContext
    );
    runRecorder.setEvaluatorResults(evaluatorResults);
    const learningSummary = await runLearningLoop(
      resolvedWorkspace,
      runRecorder,
      evaluatorResults
    );
    const finalOutput = await runFinalOutputPipeline(
      resolvedWorkspace,
      runRecorder,
      evaluatorResults,
      learningSummary
    );
    runRecorder.setFinalOutput(finalOutput.finalOutput);
    socket.emit(
      "message",
      `Post-processing completed. Evaluators: ${evaluatorResults.length}. Final output generated.`
    );
  }
}
