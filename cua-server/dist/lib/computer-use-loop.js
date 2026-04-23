"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computerUseLoop = computerUseLoop;
const openai_cua_client_1 = require("../services/openai-cua-client");
const action_handler_1 = require("../handlers/action-handler");
const logger_1 = __importDefault(require("../utils/logger"));
const defaultWidth = parseInt(process.env.DISPLAY_WIDTH || "1024", 10);
const defaultHeight = parseInt(process.env.DISPLAY_HEIGHT || "768", 10);
const TERMINAL_STATUSES = new Set(["pass", "fail"]);
function transitionRunStatus(socket, nextStatus) {
    const currentStatus = (socket.data.testCaseStatus || "pending").toLowerCase();
    if (TERMINAL_STATUSES.has(currentStatus))
        return false;
    if (nextStatus === "running" && currentStatus === "pending") {
        socket.data.testCaseStatus = "running";
        return true;
    }
    if ((nextStatus === "pass" || nextStatus === "fail") &&
        currentStatus === "running") {
        socket.data.testCaseStatus = nextStatus;
        return true;
    }
    return false;
}
function emitReviewState(socket, runRecorder, payload) {
    try {
        const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
        socket.emit("testscriptupdate", parsed);
        runRecorder.updateFromReviewState(parsed);
        runRecorder.emitSnapshot(socket);
    }
    catch (error) {
        logger_1.default.error(`Failed to parse review state: ${error}`);
    }
}
async function computerUseLoop(page, response, testCaseReviewAgent, runRecorder, socket, switchedToNewTab = false) {
    transitionRunStatus(socket, "running");
    while (true) {
        testCaseReviewAgent.startNewTurn({ phase: "loop_iteration" });
        await runRecorder.captureEvidence(page, "loop-iteration");
        if (socket.data.testCaseStatus === "fail") {
            logger_1.default.debug("Test case failed. Exiting the computer use loop.");
            testCaseReviewAgent.finalizeRun("fail");
            runRecorder.setRunStatus("fail");
            runRecorder.emitSnapshot(socket);
            return response;
        }
        if (socket.data.testCaseStatus === "pass") {
            logger_1.default.debug("Test case passed. Exiting the computer use loop.");
            testCaseReviewAgent.finalizeRun("pass");
            runRecorder.setRunStatus("pass");
            runRecorder.emitSnapshot(socket);
            return response;
        }
        const computerCalls = response.output.filter((item) => item.type === "computer_call");
        const functionCalls = response.output.filter((item) => item.type === "function_call");
        if (functionCalls.length > 0) {
            let advancedFunctionResponse = false;
            for (const funcCall of functionCalls) {
                if (funcCall.name === "capture_data") {
                    let parsedArguments = {};
                    try {
                        parsedArguments = JSON.parse(funcCall.arguments || "{}");
                    }
                    catch {
                        parsedArguments = {};
                    }
                    const schemaName = String(parsedArguments.schema_name || "custom_capture");
                    let payload = {};
                    const payloadJson = parsedArguments.payload_json;
                    if (typeof payloadJson === "string" && payloadJson.trim()) {
                        try {
                            const parsedPayload = JSON.parse(payloadJson);
                            if (parsedPayload &&
                                typeof parsedPayload === "object" &&
                                !Array.isArray(parsedPayload)) {
                                payload = parsedPayload;
                            }
                        }
                        catch {
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
                    response = await (0, openai_cua_client_1.sendFunctionCallOutput)(funcCall.call_id, response.id, {
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
                    response = await (0, openai_cua_client_1.sendFunctionCallOutput)(funcCall.call_id, response.id, {
                        status: "done",
                    });
                    const verdict = testCaseReviewAgent.getCurrentVerdict();
                    const finalStatus = verdict === "pass" ? "pass" : "fail";
                    socket.emit("message", finalStatus === "pass"
                        ? "Test case passed."
                        : "Test case failed. Please review the failed or pending steps.");
                    transitionRunStatus(socket, finalStatus);
                    testCaseReviewAgent.finalizeRun(finalStatus, finalStatus === "fail"
                        ? "CUA marked the run done before all test steps passed."
                        : undefined);
                    runRecorder.setRunStatus(finalStatus, finalStatus === "fail"
                        ? "CUA marked the run done before all test steps passed."
                        : undefined);
                    if (finalStatus === "fail") {
                        runRecorder.finalizeReviewStateOnFailure("CUA marked the run done before all test steps passed.");
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
            logger_1.default.debug("No computer call found. Final output from model:");
            const messageResponse = response.output.filter((item) => item.type === "message");
            if (messageResponse.length > 0) {
                const message = messageResponse[0].content[0].text;
                response = await (0, openai_cua_client_1.sendInputToModel)({
                    screenshotBase64: "",
                    previousResponseId: response.id,
                    lastCallId: message.call_id,
                }, "continue");
            }
            else {
                return response;
            }
            continue;
        }
        const reasoningOutputs = response.output.filter((item) => item.type === "reasoning");
        if (reasoningOutputs.length > 0) {
            reasoningOutputs.forEach((reason) => {
                const summaryText = Array.isArray(reason.summary)
                    ? reason.summary.map((s) => s.text).join(" ")
                    : "No reasoning provided";
                socket.emit("message", summaryText);
            });
        }
        const computerCall = computerCalls[0];
        if (computerCall.pending_safety_checks &&
            computerCall.pending_safety_checks.length > 0) {
            const safetyCheck = computerCall.pending_safety_checks[0];
            socket.emit("message", `Safety check detected: ${safetyCheck.message}`);
            transitionRunStatus(socket, "fail");
            runRecorder.setRunStatus("fail", safetyCheck.message);
            runRecorder.finalizeReviewStateOnFailure(safetyCheck.message);
            runRecorder.emitSnapshot(socket);
            return response;
        }
        const lastCallId = computerCall.call_id;
        socket.data.lastCallId = lastCallId;
        const actions = Array.isArray(computerCall.actions)
            ? computerCall.actions
            : computerCall.action
                ? [computerCall.action]
                : [];
        if (actions.length === 0) {
            logger_1.default.warn("Computer call did not include actions; sending fresh screenshot back to model.");
        }
        for (const action of actions) {
            const { label, target } = await runRecorder.recordActionSelection(page, action);
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
                    logger_1.default.error(`Error during test script review: ${error}`);
                });
            }
            try {
                await (0, action_handler_1.handleModelAction)(page, action);
                runRecorder.recordActionResult(action, label, target);
            }
            catch (error) {
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
            if (!viewport ||
                viewport.width !== defaultWidth ||
                viewport.height !== defaultHeight) {
                await newPage.setViewportSize({
                    width: defaultWidth,
                    height: defaultHeight,
                });
            }
            const screenshotBuffer = await newPage.screenshot();
            const screenshotBase64 = screenshotBuffer.toString("base64");
            response = (await (0, openai_cua_client_1.sendInputToModel)({
                screenshotBase64,
                previousResponseId: response.id,
                lastCallId,
            }));
            response = await computerUseLoop(newPage, response, testCaseReviewAgent, runRecorder, socket, true);
            return response;
        }
        const screenshotBuffer = await getScreenshotWithRetry(page);
        const screenshotBase64 = screenshotBuffer.toString("base64");
        response = (await (0, openai_cua_client_1.sendInputToModel)({
            screenshotBase64,
            previousResponseId: response.id,
            lastCallId,
        }));
    }
}
async function getScreenshotWithRetry(page, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await page.screenshot();
        }
        catch (error) {
            logger_1.default.error(`Attempt ${attempt} - Error capturing screenshot: ${error}`);
            if (attempt === retries) {
                throw error;
            }
            await page.waitForTimeout(2000);
        }
    }
    throw new Error("Failed to capture screenshot after retries");
}
