import { Socket } from "socket.io";
import logger from "../utils/logger";
import TestCaseAgent from "../agents/test-case-agent";
import { convertTestCaseToSteps, TestCase } from "../utils/testCaseUtils";
import { cuaLoopHandler } from "./cua-loop-handler";
import TestScriptReviewAgent from "../agents/test-script-review-agent";
import RunRecorder from "../lib/run-recorder";
import { WorkspaceDocument } from "../lib/workspace-types";
import { loadLearningContext } from "../learning/learning-loop";

function buildExecutionBrief(
  workspace: WorkspaceDocument,
  learningContext: { autoSpl: string; topPatterns: string[] }
) {
  const metrics =
    workspace.testCase.metrics.length > 0
      ? workspace.testCase.metrics
          .filter((metric) => metric.enabled)
          .map(
            (metric) =>
              `- ${metric.name}: ${metric.description}\n  System prompt: ${metric.systemPrompt}`
          )
          .join("\n")
      : "- Default evaluator derived from the test description";

  const thresholds =
    workspace.testCase.thresholds.length > 0
      ? workspace.testCase.thresholds
          .map(
            (threshold) =>
              `- ${threshold.metricId} ${threshold.operator} ${threshold.value}`
          )
          .join("\n")
      : "- No explicit thresholds configured";

  const assets =
    workspace.testCase.assets.length > 0
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

export async function handleTestCaseInitiated(
  socket: Socket,
  data: any
): Promise<void> {
  logger.debug(`Received testCaseInitiated with data: ${JSON.stringify(data)}`);
  try {
    const { workspace } = data as {
      workspace: WorkspaceDocument;
    };
    const loginRequired = workspace.runDefaults.loginRequired;
    const url = workspace.runDefaults.website;
    const userName = workspace.runDefaults.username;
    const password = workspace.runDefaults.password;
    const userInfo = JSON.stringify(workspace.runDefaults.userInfo);

    socket.emit(
      "message",
      "Received saved workspace - generating executable steps..."
    );

    const testCaseAgent = new TestCaseAgent(loginRequired);
    const learningContext = loadLearningContext(workspace.project.id);
    const executionBrief = buildExecutionBrief(workspace, learningContext);
    const runRecorder = new RunRecorder(workspace);
    socket.data.runRecorder = runRecorder;
    socket.data.testCaseStatus = "running";
    runRecorder.emitSnapshot(socket);

    const testCaseResponse = await testCaseAgent.invokeResponseAPI(executionBrief);
    const testCaseJson = JSON.stringify(testCaseResponse);

    const testCaseReviewAgent = new TestScriptReviewAgent();

    logger.debug(
      `Invoking test script review agent - This should only be called once per test script run.`
    );

    let testScriptReviewResponse = await testCaseReviewAgent.instantiateAgent(
      `INSTRUCTIONS:\n${testCaseJson}`,
      url
    );
    testCaseReviewAgent.setRunContext(url);
    logger.trace(
      `Test script state initialized: ${JSON.stringify(
        testScriptReviewResponse,
        null,
        2
      )}`
    );

    socket.emit("message", "Test script review agent initialized.");

    socket.data.testCaseReviewAgent = testCaseReviewAgent;
    runRecorder.initializeSteps(
      (testCaseResponse as TestCase).steps.map((step) => ({
        step_number: step.step_number,
        step_instructions: step.step_instructions,
      }))
    );
    runRecorder.emitSnapshot(socket);

    logger.debug(`Cleaned test case: ${testCaseJson}`);

    socket.emit("testcases", testCaseJson);
    socket.emit("message", "Task steps created.");

    const testScript = convertTestCaseToSteps(testCaseResponse as TestCase);

    logger.debug(`Test script: ${testScript}`);

    // Start the test execution using the provided URL.
    // Pass the test case review agent to the cuaLoopHandler.
    await cuaLoopHandler(
      testScript,
      url,
      socket,
      testCaseReviewAgent,
      runRecorder,
      userName,
      password,
      loginRequired,
      userInfo,
      workspace
    );
  } catch (error) {
    logger.error(`Error in handleTestCaseInitiated: ${error}`);
    socket.emit("message", "Error initiating test case.");
  }
}

export type TestCaseStep = {
  step_number: number;
  step_instructions: string;
  status: string | null;
};
