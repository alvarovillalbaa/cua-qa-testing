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
const run_recorder_1 = __importDefault(require("../lib/run-recorder"));
const learning_loop_1 = require("../learning/learning-loop");
function buildExecutionBrief(workspace, learningContext) {
    const metrics = workspace.testCase.metrics.length > 0
        ? workspace.testCase.metrics
            .filter((metric) => metric.enabled)
            .map((metric) => `- ${metric.name}: ${metric.description}\n  System prompt: ${metric.systemPrompt}`)
            .join("\n")
        : "- Default evaluator derived from the test description";
    const thresholds = workspace.testCase.thresholds.length > 0
        ? workspace.testCase.thresholds
            .map((threshold) => `- ${threshold.metricId} ${threshold.operator} ${threshold.value}`)
            .join("\n")
        : "- No explicit thresholds configured";
    const assets = workspace.testCase.assets.length > 0
        ? workspace.testCase.assets
            .map((asset) => `- ${asset.name} (${asset.relativePath})`)
            .join("\n")
        : "- No uploaded assets";
    return [
        `Project: ${workspace.project.name}`,
        `Website: ${workspace.runDefaults.website}`,
        `Trigger: ${workspace.runDefaults.trigger}`,
        `Test case: ${workspace.testCase.name}`,
        "",
        "Test description:",
        workspace.testCase.testDescription,
        "",
        "Team collaboration notes:",
        workspace.testCase.teamCollaboration,
        "",
        "Additional context:",
        workspace.runDefaults.additionalContextOverride ||
            workspace.testCase.additionalContext,
        "",
        "Metrics:",
        metrics,
        "",
        "Thresholds:",
        thresholds,
        "",
        "Assets:",
        assets,
        "",
        "Shared system prompt:",
        workspace.testCase.prompts.shared,
        "",
        "Persisted learning / SPL auto-memory:",
        learningContext.autoSpl || workspace.testCase.prompts.spl,
        "",
        "Top repeated patterns from prior runs:",
        learningContext.topPatterns.join("\n") || "- None yet",
        "",
        "Login overlay prompt:",
        workspace.testCase.prompts.loginOverlay,
        "",
        "Output response format:",
        workspace.testCase.output.responseFormat,
        "",
        "Output instructions:",
        workspace.runDefaults.outputInstructions,
        "",
        `Login required: ${workspace.runDefaults.loginRequired ? "yes" : "no"}`,
        `Site access mode: ${workspace.secrets.siteAccessMode || "none"}`,
        `Site access origin: ${workspace.secrets.siteAccessOrigin || workspace.runDefaults.website}`,
        `User info: ${JSON.stringify(workspace.runDefaults.userInfo)}`,
    ].join("\n");
}
async function handleTestCaseInitiated(socket, data) {
    logger_1.default.debug(`Received testCaseInitiated with data: ${JSON.stringify(data)}`);
    try {
        const { workspace } = data;
        const loginRequired = workspace.runDefaults.loginRequired;
        const url = workspace.runDefaults.website;
        const userName = workspace.runDefaults.username;
        const password = workspace.runDefaults.password;
        const userInfo = JSON.stringify(workspace.runDefaults.userInfo);
        socket.emit("message", "Received saved workspace - generating executable steps...");
        const testCaseAgent = new test_case_agent_1.default(loginRequired);
        const learningContext = (0, learning_loop_1.loadLearningContext)(workspace.project.id);
        const executionBrief = buildExecutionBrief(workspace, learningContext);
        const runRecorder = new run_recorder_1.default(workspace);
        socket.data.runRecorder = runRecorder;
        socket.data.testCaseStatus = "running";
        runRecorder.emitSnapshot(socket);
        const testCaseResponse = await testCaseAgent.invokeResponseAPI(executionBrief);
        const testCaseJson = JSON.stringify(testCaseResponse);
        const testCaseReviewAgent = new test_script_review_agent_1.default();
        logger_1.default.debug(`Invoking test script review agent - This should only be called once per test script run.`);
        let testScriptReviewResponse = await testCaseReviewAgent.instantiateAgent(`INSTRUCTIONS:\n${testCaseJson}`, url);
        testCaseReviewAgent.setRunContext(url);
        logger_1.default.trace(`Test script state initialized: ${JSON.stringify(testScriptReviewResponse, null, 2)}`);
        socket.emit("message", "Test script review agent initialized.");
        socket.data.testCaseReviewAgent = testCaseReviewAgent;
        runRecorder.initializeSteps(testCaseResponse.steps.map((step) => ({
            step_number: step.step_number,
            step_instructions: step.step_instructions,
        })));
        runRecorder.emitSnapshot(socket);
        logger_1.default.debug(`Cleaned test case: ${testCaseJson}`);
        socket.emit("testcases", testCaseJson);
        socket.emit("message", "Task steps created.");
        const testScript = (0, testCaseUtils_1.convertTestCaseToSteps)(testCaseResponse);
        logger_1.default.debug(`Test script: ${testScript}`);
        // Start the test execution using the provided URL.
        // Pass the test case review agent to the cuaLoopHandler.
        await (0, cua_loop_handler_1.cuaLoopHandler)(testScript, url, socket, testCaseReviewAgent, runRecorder, userName, password, loginRequired, userInfo, workspace);
    }
    catch (error) {
        logger_1.default.error(`Error in handleTestCaseInitiated: ${error}`);
        socket.emit("message", "Error initiating test case.");
    }
}
