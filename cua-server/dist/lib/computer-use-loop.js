"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computerUseLoop = computerUseLoop;
const openai_cua_client_1 = require("../services/openai-cua-client");
const action_handler_1 = require("../handlers/action-handler");
const logger_1 = __importDefault(require("../utils/logger"));
// Check the dimensions of the viewport and reset them to the default values if they are not the default values.
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
    if ((nextStatus === "pass" || nextStatus === "fail") && currentStatus === "running") {
        socket.data.testCaseStatus = nextStatus;
        return true;
    }
    return false;
}
async function computerUseLoop(page, response, testCaseReviewAgent, socket, switchedToNewTab = false // <-- Flag to ensure recursion happens only once for a new tab.
) {
    transitionRunStatus(socket, "running");
    await page.screenshot({ path: "screenshot.png" });
    while (true) {
        testCaseReviewAgent.startNewTurn({ phase: "loop_iteration" });
        const iterationScreenshot = await getScreenshotWithRetry(page);
        const iterationScreenshotBase64 = iterationScreenshot.toString("base64");
        const iterationScreenshotPath = testCaseReviewAgent.saveTraceScreenshot(iterationScreenshotBase64, "loop-iteration");
        testCaseReviewAgent.appendTraceEvent("model_response_received", {
            response_id: response?.id ?? null,
            output_items: Array.isArray(response?.output) ? response.output.length : 0,
            snapshot_path: iterationScreenshotPath,
        });
        // Check if the test case status is 'fail'.
        if (socket.data.testCaseStatus === "fail") {
            logger_1.default.debug("Test case failed. Exiting the computer use loop.");
            testCaseReviewAgent.finalizeRun("fail");
            return response;
        }
        if (socket.data.testCaseStatus === "pass") {
            logger_1.default.debug("Test case passed. Exiting the computer use loop.");
            testCaseReviewAgent.finalizeRun("pass");
            return response;
        }
        // Look for computer_call and function_call items in the model response.
        const computerCalls = response.output.filter((item) => item.type === "computer_call");
        const functionCalls = response.output.filter((item) => item.type === "function_call");
        // Handle function calls first (e.g., mark_done)
        if (functionCalls.length > 0) {
            for (const funcCall of functionCalls) {
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
                    const finalMessage = finalStatus === "pass"
                        ? "\u2705 Test case passed."
                        : "Test case failed. Please review the failed or pending steps.";
                    socket.emit("message", finalMessage);
                    transitionRunStatus(socket, finalStatus);
                    testCaseReviewAgent.appendTraceEvent("model_response_received", {
                        response_id: response?.id ?? null,
                        source: "sendFunctionCallOutput",
                    });
                    testCaseReviewAgent.finalizeRun(finalStatus, finalStatus === "fail"
                        ? "CUA marked the run done before all test steps passed."
                        : undefined);
                    await page.context().browser()?.close();
                    return response;
                }
            }
        }
        // Add the previous response id to the socket.data.
        socket.data.previousResponseId = response.id;
        if (computerCalls.length === 0) {
            logger_1.default.debug("No computer call found. Final output from model:");
            response.output.forEach((item) => {
                logger_1.default.debug(`Output from the model - ${JSON.stringify(item, null, 2)}`);
            });
            const messageResponse = response.output.filter((item) => item.type === "message");
            if (messageResponse.length > 0) {
                // Check if the response is a message.
                // NOTE: This is unused in this demo as we force the model to call tools with tool_choice = required
                // Update this logic to handle messages from the model if needed for your use case      if (messageResponse.length > 0) {
                logger_1.default.debug("Response is a message. Trying to get answer from CUA Control Agent.");
                const message = messageResponse[0].content[0].text;
                logger_1.default.debug(`Message from the CUA model: ${message}`);
                if (!message.call_id) {
                    logger_1.default.debug(`No call id found in the message. Exiting the computer use loop.`);
                }
                response = await (0, openai_cua_client_1.sendInputToModel)({
                    screenshotBase64: "",
                    previousResponseId: response.id,
                    lastCallId: message.call_id,
                }, "continue");
            }
            else {
                // If its not a computer_call, we just return the response.
                logger_1.default.debug(`Response for the model is neither a computer_call nor a message. Returning the response.`);
                return response;
            }
        }
        else {
            // We expect at most one computer_call per response.
            // Get reason from the response.
            const reasoningOutputs = response.output.filter((item) => item.type === "reasoning");
            if (reasoningOutputs.length > 0) {
                reasoningOutputs.forEach((reason) => {
                    const summaryText = Array.isArray(reason.summary)
                        ? reason.summary.map((s) => s.text).join(" ")
                        : "No reasoning provided";
                    socket.emit("message", `${summaryText}`);
                    logger_1.default.debug(`Model reasoning: ${summaryText}`);
                });
            }
            // Get the first computer_call from the response.
            const computerCall = computerCalls[0];
            // Check for pending safety checks.
            if (computerCall.pending_safety_checks &&
                computerCall.pending_safety_checks.length > 0) {
                const safetyCheck = computerCall.pending_safety_checks[0];
                logger_1.default.error(`Safety check detected: ${safetyCheck.message}`);
                socket.emit("message", `Safety check detected: ${safetyCheck.message}`);
                socket.emit("message", "Test case failed. Exiting the computer use loop.");
                transitionRunStatus(socket, "fail");
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
                testCaseReviewAgent.appendTraceEvent("model_action_selected", {
                    response_id: response.id,
                    call_id: lastCallId,
                    action,
                });
                // Take a screenshot of the page before the action is executed.
                if (["click"].includes(action?.type)) {
                    const screenshotBuffer = await page.screenshot();
                    const screenshotBase64 = screenshotBuffer.toString("base64");
                    const preActionPath = testCaseReviewAgent.saveTraceScreenshot(screenshotBase64, "pre-action", { action_type: action?.type });
                    testCaseReviewAgent.appendTraceEvent("pre_action_snapshot_captured", {
                        action_type: action?.type,
                        screenshot_path: preActionPath,
                    });
                    const testScriptReviewResponsePromise = testCaseReviewAgent.checkTestScriptStatus(screenshotBase64);
                    // Asynchronously emit the test script review response to the socket.
                    testScriptReviewResponsePromise
                        .then((testScriptReviewResponse) => {
                        socket.emit("testscriptupdate", testScriptReviewResponse);
                    })
                        .catch((error) => {
                        logger_1.default.error("Error during test script review: {error: " + error + "}");
                        socket.emit("testscriptupdate", {
                            error: "Review processing failed.",
                        });
                    });
                }
                // Execute the action in the Playwright page.
                await (0, action_handler_1.handleModelAction)(page, action);
            }
            // Allow some time for UI changes to take effect.
            await page.waitForTimeout(1000);
            // Did this action open a new tab? If so, we need to start a new computer-use-loop with the new page context.
            // Retrieve all open pages in the current browser context.
            const pages = page.context().pages();
            if (pages.length > 1 && !switchedToNewTab) {
                // Assume the new tab is the last page.
                const newPage = pages[pages.length - 1];
                logger_1.default.debug("New tab detected. Switching context to the new tab (recursion will happen only once).");
                // Continue with your logic using newPage...
                const viewport = newPage.viewportSize();
                logger_1.default.trace(`Viewport dimensions of new page: ${viewport?.width}, ${viewport?.height}`);
                if (!viewport ||
                    viewport.width !== defaultWidth ||
                    viewport.height !== defaultHeight) {
                    logger_1.default.debug(`Resetting viewport size from (${viewport?.width || "undefined"}, ${viewport?.height || "undefined"}) to default (${defaultWidth}, ${defaultHeight}).`);
                    await newPage.setViewportSize({
                        width: defaultWidth,
                        height: defaultHeight,
                    });
                }
                // Take a new screenshot of the new page.
                const screenshotBuffer = await newPage.screenshot();
                const screenshotBase64 = screenshotBuffer.toString("base64");
                const newTabSnapshotPath = testCaseReviewAgent.saveTraceScreenshot(screenshotBase64, "new-tab-context");
                // Send the screenshot back as a computer_call_output.
                testCaseReviewAgent.appendTraceEvent("model_request_sent", {
                    request_type: "computer_call_output",
                    previous_response_id: response.id,
                    last_call_id: lastCallId,
                    screenshot_path: newTabSnapshotPath,
                });
                response = (await (0, openai_cua_client_1.sendInputToModel)({
                    screenshotBase64,
                    previousResponseId: response.id,
                    lastCallId,
                }));
                testCaseReviewAgent.appendTraceEvent("model_response_received", {
                    response_id: response?.id ?? null,
                    source: "sendInputToModel_new_tab",
                });
                logger_1.default.info("Recursively calling computerUseLoop with new page context.");
                logger_1.default.trace(`Response: ${JSON.stringify(response, null, 2)}`);
                // Recursively call the computerUseLoop with the new page.
                response = await computerUseLoop(newPage, response, testCaseReviewAgent, socket, true);
                return response;
            }
            let screenshotBuffer, screenshotBase64;
            logger_1.default.trace("Capturing updated screenshot...");
            screenshotBuffer = await getScreenshotWithRetry(page);
            screenshotBase64 = screenshotBuffer.toString("base64");
            const postActionPath = testCaseReviewAgent.saveTraceScreenshot(screenshotBase64, "post-action", { action_type: actions[0]?.type ?? "unknown" });
            // Send the screenshot back as a computer_call_output.
            testCaseReviewAgent.appendTraceEvent("model_request_sent", {
                request_type: "computer_call_output",
                previous_response_id: response.id,
                last_call_id: lastCallId,
                screenshot_path: postActionPath,
            });
            response = (await (0, openai_cua_client_1.sendInputToModel)({
                screenshotBase64,
                previousResponseId: response.id,
                lastCallId,
            }));
            testCaseReviewAgent.appendTraceEvent("model_response_received", {
                response_id: response?.id ?? null,
                source: "sendInputToModel",
            });
        }
    }
}
async function getScreenshotWithRetry(page, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const screenshot = await page.screenshot();
            return screenshot;
        }
        catch (error) {
            logger_1.default.error(`Attempt ${attempt} - Error capturing screenshot: ${error}`);
            if (attempt === retries) {
                throw error;
            }
            await page.waitForTimeout(2000); // wait 2 seconds before retrying
        }
    }
    throw new Error("Failed to capture screenshot after retries");
}
