"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cuaLoopHandler = cuaLoopHandler;
// lib/handlers/playwright-loop-handler.ts
const playwright_1 = __importDefault(require("playwright"));
const { chromium } = playwright_1.default;
const logger_1 = __importDefault(require("../utils/logger"));
const computer_use_loop_1 = require("../lib/computer-use-loop");
const openai_cua_client_1 = require("../services/openai-cua-client");
const login_service_1 = require("../services/login-service");
// Read viewport dimensions from .env file with defaults if not set
const displayWidth = parseInt(process.env.DISPLAY_WIDTH || "1024", 10);
const displayHeight = parseInt(process.env.DISPLAY_HEIGHT || "768", 10);
async function cuaLoopHandler(systemPrompt, url, socket, testCaseReviewAgent, username, password, loginRequired, userInfo) {
    socket.data.testCaseStatus = "running";
    testCaseReviewAgent.setRunStatus("running");
    logger_1.default.info("Starting test script execution...");
    socket.emit("message", "Starting test script execution...");
    testCaseReviewAgent.appendTraceEvent("cua_loop_started", {
        url,
        login_required: loginRequired,
    });
    try {
        // const browser = await chromium.launch({
        //   headless: false,
        //   env: {},
        //   args: ["--disable-extensions", "--disable-file-system"],
        // });
        const { chromium } = playwright_1.default;
        const browser = await chromium.launch({
            headless: false,
            env: {},
            args: ["--disable-file-system"], // remove --disable-extensions if you want, but not needed anymore
        });
        const context = await browser.newContext();
        const extraHeaderName = process.env.EXTRA_HEADER_NAME;
        const extraHeaderValue = process.env.EXTRA_HEADER_VALUE;
        if (!extraHeaderName || !extraHeaderValue) {
            throw new Error("Missing EXTRA_HEADER_NAME or EXTRA_HEADER_VALUE");
        }
        await context.setExtraHTTPHeaders({
            [extraHeaderName]: extraHeaderValue,
        });
        const page = await context.newPage();
        logger_1.default.debug("Creating new browser instance...");
        socket.emit("message", "Launching browser...");
        // Set the page as data in the socket.
        socket.data.page = page;
        // Set viewport dimensions using env values
        await page.setViewportSize({ width: displayWidth, height: displayHeight });
        // Navigate to the provided URL from the form.
        await page.goto(url);
        // wait for 2 seconds
        await page.waitForTimeout(2000);
        // Capture an initial screenshot.
        const screenshot_before_login = await page.screenshot();
        const screenshot_before_login_base64 = screenshot_before_login.toString("base64");
        // Asynchronously check the status of the test script.
        const testScriptReviewResponsePromise = testCaseReviewAgent.checkTestScriptStatus(screenshot_before_login_base64);
        // Asynchronously emit the test script review response to the socket.
        testScriptReviewResponsePromise.then((testScriptReviewResponse) => {
            logger_1.default.debug("Sending screenshot before login to Test Script Review Agent");
            socket.emit("testscriptupdate", testScriptReviewResponse);
            logger_1.default.trace(`Initial test script state emitted: ${JSON.stringify(testScriptReviewResponse, null, 2)}`);
        });
        // Await till network is idle.
        await page.waitForTimeout(2000);
        let modelInput;
        if (loginRequired) {
            // Note to the developer: Different applications will need their own login handlers.
            logger_1.default.debug("Login required... proceeding with login.");
            socket.emit("message", "Login required... proceeding with login.");
            const loginService = new login_service_1.LoginService();
            await loginService.fillin_login_credentials(username, password, page);
            logger_1.default.trace("Login execution completed... proceeding with test script execution.");
            // wait for 5 seconds
            await page.waitForTimeout(5000);
            const screenshot_after_login = await page.screenshot();
            const screenshot_after_login_base64 = screenshot_after_login.toString("base64");
            // Asynchronously check the status of the test script.
            const testScriptReviewResponsePromise_after_login = testCaseReviewAgent.checkTestScriptStatus(screenshot_after_login_base64);
            // Asynchronously emit the test script review response to the socket.
            testScriptReviewResponsePromise_after_login.then((testScriptReviewResponse) => {
                logger_1.default.debug("Sending screenshot after login to Test Script Review Agent");
                // Emit the test script review response to the socket.
                socket.emit("testscriptupdate", testScriptReviewResponse);
                logger_1.default.trace(`Test script state emitted after login: ${JSON.stringify(testScriptReviewResponse, null, 2)}`);
            });
            await loginService.click_login_button(page);
            socket.emit("message", "Login step executed... proceeding with test script execution.");
            modelInput = {
                screenshotBase64: screenshot_after_login_base64,
                previousResponseId: undefined,
                lastCallId: undefined,
            };
        }
        else {
            // If login is not required, use the screenshot before login.
            modelInput = {
                screenshotBase64: screenshot_before_login_base64,
                previousResponseId: undefined,
                lastCallId: undefined,
            };
        }
        // Start with an initial call (without a screenshot or call_id)
        const userInfoStr = userInfo ?? "";
        let initial_response = await (0, openai_cua_client_1.setupCUAModel)(systemPrompt, userInfoStr);
        testCaseReviewAgent.appendTraceEvent("model_response_received", {
            response_id: initial_response?.id ?? null,
            source: "setupCUAModel",
        });
        logger_1.default.debug(`Initial response from CUA model: ${JSON.stringify(initial_response, null, 2)}`);
        logger_1.default.debug(`Starting computer use loop...`);
        const response = await (0, computer_use_loop_1.computerUseLoop)(page, initial_response, testCaseReviewAgent, socket);
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
        if (socket.data.testCaseStatus !== "pass" && socket.data.testCaseStatus !== "fail") {
            socket.data.testCaseStatus = "fail";
        }
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
    }
}
