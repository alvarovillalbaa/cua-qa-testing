"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cuaLoopHandler = cuaLoopHandler;
const playwright_1 = __importDefault(require("playwright"));
const logger_1 = __importDefault(require("../utils/logger"));
const computer_use_loop_1 = require("../lib/computer-use-loop");
const openai_cua_client_1 = require("../services/openai-cua-client");
const login_service_1 = require("../services/login-service");
const workspace_paths_1 = require("../lib/workspace-paths");
const learning_loop_1 = require("../learning/learning-loop");
const evaluator_runner_1 = require("../evaluators/evaluator-runner");
const final_output_runner_1 = require("../pipelines/final-output-runner");
const openai_file_utils_1 = require("../lib/openai-file-utils");
const displayWidth = parseInt(process.env.DISPLAY_WIDTH || "1024", 10);
const displayHeight = parseInt(process.env.DISPLAY_HEIGHT || "768", 10);
function buildExtraHeaders(workspace) {
    const headers = workspace.runDefaults.headers
        .filter((header) => header.name && header.value)
        .reduce((acc, header) => {
        acc[header.name] = header.value;
        return acc;
    }, {});
    if (workspace.secrets.extraHeaderName && workspace.secrets.extraHeaderValue) {
        headers[workspace.secrets.extraHeaderName] =
            workspace.secrets.extraHeaderValue;
    }
    return headers;
}
function buildContextOptions(workspace) {
    const options = {};
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
function emitReviewState(socket, runRecorder, payload) {
    try {
        const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
        socket.emit("testscriptupdate", parsed);
        runRecorder.updateFromReviewState(parsed);
        runRecorder.emitSnapshot(socket);
    }
    catch (error) {
        logger_1.default.error(`Failed to emit review state: ${error}`);
    }
}
async function cuaLoopHandler(systemPrompt, url, socket, testCaseReviewAgent, runRecorder, username, password, loginRequired, userInfo, workspace) {
    socket.data.testCaseStatus = "running";
    runRecorder.setRunStatus("running");
    testCaseReviewAgent.setRunStatus("running");
    socket.emit("message", "Starting test script execution...");
    runRecorder.emitSnapshot(socket);
    let browser = null;
    let context = null;
    const resolvedWorkspace = workspace || runRecorder.getWorkspace();
    const learningContext = (0, learning_loop_1.loadLearningContext)(resolvedWorkspace.project.id);
    try {
        browser = await playwright_1.default.chromium.launch({
            headless: false,
            env: {},
            args: ["--disable-file-system"],
        });
        const contextOptions = buildContextOptions(resolvedWorkspace);
        logger_1.default.info({
            siteAccessMode: resolvedWorkspace.secrets.siteAccessMode || "none",
            siteAccessOrigin: resolvedWorkspace.secrets.siteAccessOrigin ||
                resolvedWorkspace.runDefaults.website,
            headerNames: Object.keys(contextOptions.extraHTTPHeaders || {}),
            hasHttpCredentials: Boolean(contextOptions.httpCredentials?.username),
            loginRequired,
        }, "Creating browser context");
        context = await browser.newContext(contextOptions);
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        const page = await context.newPage();
        socket.data.page = page;
        await runRecorder.attachPageListeners(page);
        logger_1.default.debug("Creating new browser instance...");
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
            logger_1.default.error(`Initial review failed: ${error}`);
        });
        await page.waitForTimeout(2000);
        if (loginRequired) {
            logger_1.default.debug("Login required... proceeding with login.");
            socket.emit("message", "Login required... proceeding with login.");
            const loginService = new login_service_1.LoginService();
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
                logger_1.default.error(`Post-login review failed: ${error}`);
            });
            socket.emit("message", "Login step executed... proceeding with test script execution.");
        }
        const userInfoStr = userInfo ?? "";
        const { refs, inputFiles } = await (0, openai_file_utils_1.prepareOpenAIFileInputs)(resolvedWorkspace);
        if (refs.length > 0) {
            runRecorder.recordOpenAIFileRefs("cua_setup", refs);
        }
        const initialResponse = await (0, openai_cua_client_1.setupCUAModel)(systemPrompt, userInfoStr, inputFiles);
        const response = await (0, computer_use_loop_1.computerUseLoop)(page, initialResponse, testCaseReviewAgent, runRecorder, socket);
        const messageResponse = response.output.filter((item) => item.type === "message");
        if (messageResponse.length > 0) {
            messageResponse.forEach((message) => {
                if (Array.isArray(message.content)) {
                    message.content.forEach((contentBlock) => {
                        if (contentBlock.type === "output_text" && contentBlock.text) {
                            socket.emit("message", contentBlock.text);
                        }
                    });
                }
            });
        }
    }
    catch (error) {
        socket.data.testCaseStatus = "fail";
        logger_1.default.error({
            message: error?.message,
            status: error?.status,
            code: error?.code,
            type: error?.type,
            param: error?.param,
            request_id: error?.request_id,
            error: error?.error,
            response: error?.response?.data,
        }, "Error during playwright loop");
        socket.emit("message", `Run failed: ${error?.message || "unknown OpenAI error"}`);
        testCaseReviewAgent.appendTraceEvent("cua_loop_error", {
            error: String(error),
        });
        testCaseReviewAgent.finalizeRun("fail", String(error));
        runRecorder.setRunStatus("fail", String(error));
        runRecorder.finalizeReviewStateOnFailure(String(error));
        runRecorder.emitSnapshot(socket);
    }
    finally {
        if (context) {
            try {
                await context.tracing.stop({
                    path: (0, workspace_paths_1.getTracePath)(resolvedWorkspace.project.id, runRecorder.getRunId()),
                });
            }
            catch (error) {
                logger_1.default.warn(`Unable to stop tracing cleanly: ${error}`);
            }
        }
        if (browser) {
            try {
                await browser.close();
            }
            catch {
                // no-op
            }
        }
        if (runRecorder.getStatus() === "running") {
            runRecorder.setRunStatus("incomplete", "Run ended without a terminal verdict.");
            runRecorder.emitSnapshot(socket);
        }
        const evaluatorResults = await (0, evaluator_runner_1.runEvaluators)(resolvedWorkspace, runRecorder, learningContext);
        runRecorder.setEvaluatorResults(evaluatorResults);
        const learningSummary = await (0, learning_loop_1.runLearningLoop)(resolvedWorkspace, runRecorder, evaluatorResults);
        const finalOutput = await (0, final_output_runner_1.runFinalOutputPipeline)(resolvedWorkspace, runRecorder, evaluatorResults, learningSummary);
        runRecorder.setFinalOutput(finalOutput.finalOutput);
        socket.emit("message", `Post-processing completed. Evaluators: ${evaluatorResults.length}. Final output generated.`);
    }
}
