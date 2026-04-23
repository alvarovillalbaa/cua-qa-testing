"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTestCaseInitiated = handleTestCaseInitiated;
const logger_1 = __importDefault(require("../utils/logger"));
const test_case_agent_1 = __importDefault(require("../agents/test-case-agent"));
const testCaseUtils_1 = require("../utils/testCaseUtils");
const cua_loop_handler_1 = require("./cua-loop-handler");
const test_script_review_agent_1 = __importDefault(require("../agents/test-script-review-agent"));
async function handleTestCaseInitiated(socket, data) {
    logger_1.default.debug(`Received testCaseInitiated with data: ${JSON.stringify(data)}`);
    try {
        const { testCase, url, userName, password, userInfo } = data;
        const loginRequired = data.loginRequired ?? true;
        logger_1.default.debug(`Login required: ${loginRequired}`);
        socket.emit("message", "Received test case - working on creating test script...");
        // Create system prompt by combining form inputs.
        const msg = `${testCase} URL: ${url} User Name: ${userName} Password: *********\n USER INFO:\n${userInfo}`;
        const testCaseAgent = new test_case_agent_1.default(loginRequired);
        const testCaseResponse = await testCaseAgent.invokeResponseAPI(msg);
        const testCaseJson = JSON.stringify(testCaseResponse);
        // Create a new test case review agent.
        const testCaseReviewAgent = new test_script_review_agent_1.default();
        logger_1.default.debug(`Invoking test script review agent - This should only be called once per test script run.`);
        let testScriptReviewResponse = await testCaseReviewAgent.instantiateAgent(`INSTRUCTIONS:\n${testCaseJson}`, url);
        testCaseReviewAgent.setRunContext(url);
        logger_1.default.trace(`Test script state initialized: ${JSON.stringify(testScriptReviewResponse, null, 2)}`);
        socket.emit("message", "Test script review agent intiatlized.");
        // Set the test case review agent in the socket.
        socket.data.testCaseReviewAgent = testCaseReviewAgent;
        logger_1.default.debug(`Cleaned test case: ${testCaseJson}`);
        socket.emit("testcases", testCaseJson);
        socket.emit("message", "Task steps created.");
        const testScript = (0, testCaseUtils_1.convertTestCaseToSteps)(testCaseResponse);
        logger_1.default.debug(`Test script: ${testScript}`);
        // Start the test execution using the provided URL.
        // Pass the test case review agent to the cuaLoopHandler.
        await (0, cua_loop_handler_1.cuaLoopHandler)(testScript, url, socket, testCaseReviewAgent, userName, password, loginRequired, userInfo);
    }
    catch (error) {
        logger_1.default.error(`Error in handleTestCaseInitiated: ${error}`);
        socket.emit("message", "Error initiating test case.");
    }
}
