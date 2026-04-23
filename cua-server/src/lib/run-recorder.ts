import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Page } from "playwright";
import { Socket } from "socket.io";
import logger from "../utils/logger";
import {
  CurrentRunSnapshot,
  RunStatus,
  RunStepSnapshot,
  WorkspaceDocument,
} from "./workspace-types";
import { runConfiguredExtractors } from "../extractors/registry";
import { ExtractorArtifact } from "../extractors/types";
import {
  getArtifactsRoot,
  getEvaluatorsRoot,
  getExtractsRoot,
  getPublicResultsRoot,
  getResultsRoot,
  getRunRoot,
} from "./workspace-paths";
import {
  ActionTargetMetadata,
  getTargetMetadataForAction,
  standardizeActionLabel,
} from "./action-utils";

type ReviewStateStep = {
  step_number: number;
  step_instructions?: string;
  status: string;
  step_reasoning: string;
  image_path?: string;
};

type ReviewState = {
  steps: ReviewStateStep[];
};

export class RunRecorder {
  private readonly workspace: WorkspaceDocument;
  private readonly runId: string;
  private readonly startedAt: string;
  private readonly runRoot: string;
  private readonly publicArtifactRoot: string;
  private readonly artifactsRoot: string;
  private readonly extractsRoot: string;
  private readonly evaluatorsRoot: string;
  private readonly resultsRoot: string;
  private eventCounter = 0;
  private status: RunStatus | "pass" | "fail" = "running";
  private errorInfo: string | null = null;
  private finishedAt: string | null = null;
  private currentAction: string | null = null;
  private steps: RunStepSnapshot[] = [];
  private transcript: Array<{
    turn: number;
    user: string;
    assistant: string;
    source: string;
    confidence: number;
    completed_at: string;
  }> = [];
  private orderedMessages: Array<{ role: "user" | "assistant"; text: string }> = [];
  private pendingUserInput: string | null = null;
  private artifacts = new Set<string>();
  private networkEvents: Array<Record<string, unknown>> = [];
  private extractorResults: ExtractorArtifact[] = [];
  private latestScreenshotLocalPath: string | null = null;
  private latestScreenshotPublicPath: string | null = null;
  private latestDomSnapshotPath: string | null = null;
  private evaluatorResults: unknown[] = [];
  private finalOutput: unknown = null;
  private openAiFileRefs: Array<Record<string, unknown>> = [];
  private capturedData: Array<Record<string, unknown>> = [];

  constructor(workspace: WorkspaceDocument) {
    this.workspace = workspace;
    this.runId = randomUUID();
    this.startedAt = new Date().toISOString();

    this.runRoot = getRunRoot(workspace.project.id, this.runId);
    this.publicArtifactRoot = getPublicResultsRoot(this.runId);
    this.artifactsRoot = getArtifactsRoot(workspace.project.id, this.runId);
    this.extractsRoot = getExtractsRoot(workspace.project.id, this.runId);
    this.evaluatorsRoot = getEvaluatorsRoot(workspace.project.id, this.runId);
    this.resultsRoot = getResultsRoot(workspace.project.id, this.runId);

    fs.mkdirSync(this.artifactsRoot, { recursive: true });
    fs.mkdirSync(this.extractsRoot, { recursive: true });
    fs.mkdirSync(this.publicArtifactRoot, { recursive: true });
    fs.mkdirSync(this.evaluatorsRoot, { recursive: true });
    fs.mkdirSync(this.resultsRoot, { recursive: true });

    this.appendEvent("run.initialized", {
      project_id: workspace.project.id,
      test_case_id: workspace.testCase.id,
      trigger: workspace.runDefaults.trigger,
    });
    this.persistResolvedConfig();
    this.persistRunJson();
  }

  getRunId() {
    return this.runId;
  }

  getStatus() {
    return this.status;
  }

  getErrorInfo() {
    return this.errorInfo;
  }

  getCurrentAction() {
    return this.currentAction;
  }

  getTranscript() {
    return this.transcript;
  }

  getExtractorResults() {
    return this.extractorResults;
  }

  getNetworkEvents() {
    return this.networkEvents;
  }

  getCapturedData() {
    return this.capturedData;
  }

  getRunRoot() {
    return this.runRoot;
  }

  getEvaluatorsRoot() {
    return this.evaluatorsRoot;
  }

  getResultsRoot() {
    return this.resultsRoot;
  }

  getWorkspace() {
    return this.workspace;
  }

  initializeSteps(testCaseSteps: Array<{ step_number: number; step_instructions: string }>) {
    this.steps = testCaseSteps.map((step, index) => ({
      step_number: step.step_number,
      step_instructions: step.step_instructions,
      status: index === 0 ? "running" : "pending",
      step_reasoning: "Waiting for evidence from the execution run.",
    }));
    this.persistSnapshot();
    this.persistRunJson();
  }

  async attachPageListeners(page: Page) {
    page.on("pageerror", (error) => {
      this.appendEvent("browser.page_error", {
        message: String(error),
      });
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        this.appendEvent("browser.console_error", {
          text: message.text(),
        });
      }
    });
    page.context().on("request", (request) => {
      const event = {
        method: request.method(),
        url: request.url(),
        headers: request.headers(),
        type: "request",
      };
      this.networkEvents.push(event);
      this.appendEvent("network.request", event);
    });
    page.context().on("response", (response) => {
      void this.captureResponseEvent(response);
    });
  }

  private async captureResponseEvent(response: any) {
    let bodyText = "";
    const headers = response.headers();
    const contentType = String(headers["content-type"] || "");
    if (/json|text|javascript/i.test(contentType)) {
      try {
        bodyText = (await response.text()).slice(0, 20000);
      } catch {
        bodyText = "";
      }
    }
    const event = {
      status: response.status(),
      url: response.url(),
      headers,
      bodyText,
      type: "response",
    };
    this.networkEvents.push(event);
    fs.writeFileSync(
      path.join(this.artifactsRoot, "network-events.json"),
      JSON.stringify(this.networkEvents, null, 2),
      "utf8"
    );
    this.appendEvent("network.response", {
      status: response.status(),
      url: response.url(),
      content_type: contentType,
    });
  }

  updateCurrentAction(label: string | null) {
    this.currentAction = label;
    this.persistSnapshot();
  }

  setRunStatus(status: RunStatus | "pass" | "fail", errorInfo?: string) {
    this.status = status;
    this.errorInfo = errorInfo || null;
    if (status === "pass" || status === "fail" || status === "incomplete") {
      this.finishedAt = new Date().toISOString();
    }
    this.appendEvent("run.status_updated", {
      status,
      error_info: this.errorInfo,
    });
    this.persistSnapshot();
    this.persistRunJson();
  }

  emitSnapshot(socket: Socket) {
    socket.emit("runstate", this.getSnapshot());
  }

  getSnapshot(): CurrentRunSnapshot {
    return {
      runId: this.runId,
      projectId: this.workspace.project.id,
      testCaseId: this.workspace.testCase.id,
      status: this.status,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      errorInfo: this.errorInfo,
      currentAction: this.currentAction,
      steps: this.steps,
    };
  }

  appendEvent(type: string, payload: Record<string, any>) {
    this.eventCounter += 1;
    const event = {
      id: `${this.runId}-${this.eventCounter}`,
      ts: new Date().toISOString(),
      type,
      payload,
    };
    fs.appendFileSync(
      path.join(this.runRoot, "events.jsonl"),
      `${JSON.stringify(event)}\n`,
      "utf8"
    );
  }

  async recordActionSelection(page: Page, action: any) {
    const target = await getTargetMetadataForAction(page, action);
    const label = standardizeActionLabel(action, target);
    this.currentAction = label;
    this.appendEvent("action.selected", {
      action,
      label,
      target,
    });
    if (action?.type === "type" && typeof action?.text === "string") {
      this.pendingUserInput = action.text;
    }
    if (
      action?.type === "keypress" &&
      Array.isArray(action?.keys) &&
      action.keys.map((key: string) => key.toUpperCase()).includes("ENTER") &&
      this.pendingUserInput
    ) {
      this.appendEvent("chat.user_submitted", {
        text: this.pendingUserInput,
      });
    }
    this.persistSnapshot();
    return { label, target };
  }

  recordActionResult(action: any, label: string, target: ActionTargetMetadata | null) {
    this.appendEvent("action.completed", {
      action,
      label,
      target,
    });
  }

  recordActionFailure(action: any, error: unknown) {
    this.appendEvent("action.failed", {
      action,
      error: String(error),
    });
  }

  async captureEvidence(page: Page, kind: string) {
    try {
      const screenshot = await page.screenshot();
      const fileName = `${Date.now()}-${kind}.png`;
      const localPath = path.join(this.publicArtifactRoot, fileName);
      fs.writeFileSync(localPath, screenshot);
      const publicPath = `/test_results/${this.runId}/${fileName}`;
      this.artifacts.add(publicPath);
      this.latestScreenshotLocalPath = localPath;
      this.latestScreenshotPublicPath = publicPath;
      this.appendEvent("observation.screenshot_saved", {
        kind,
        path: publicPath,
      });
      const htmlPath = path.join(this.artifactsRoot, `${Date.now()}-${kind}.html`);
      const html = await page.content();
      fs.writeFileSync(htmlPath, html, "utf8");
      this.latestDomSnapshotPath = htmlPath;
      this.artifacts.add(htmlPath);
      this.appendEvent("observation.dom_snapshot_saved", {
        kind,
        path: htmlPath,
      });
      await this.extractStructuredArtifacts(page);
      this.persistRunJson();
      return publicPath;
    } catch (error) {
      logger.error(`Failed to capture evidence: ${error}`);
      this.appendEvent("observation.capture_failed", {
        kind,
        error: String(error),
      });
      return null;
    }
  }

  updateFromReviewState(reviewState: ReviewState) {
    const reviewMap = new Map(reviewState.steps.map((step) => [step.step_number, step]));
    const firstPending = reviewState.steps.find((step) => step.status === "pending")?.step_number;
    const hasFail = reviewState.steps.some((step) => step.status === "Fail");

    this.steps = reviewState.steps.map((step) => {
      let status: RunStepSnapshot["status"] = "pending";
      if (step.status === "Pass") {
        status = "pass";
      } else if (step.status === "Fail") {
        status = "fail";
      } else if (this.status === "running" && step.step_number === firstPending) {
        status = "running";
      } else if (this.status === "fail") {
        if (!hasFail && step.step_number === firstPending) {
          status = "fail";
        } else if (step.step_number > (firstPending || 0)) {
          status = "not_run";
        } else {
          status = "blocked";
        }
      } else if (this.status === "pass") {
        status = "pass";
      }

      const prior = this.steps.find((item) => item.step_number === step.step_number);

      return {
        step_number: step.step_number,
        step_instructions:
          prior?.step_instructions ||
          step.step_instructions ||
          `Step ${step.step_number}`,
        status,
        step_reasoning:
          status === "fail" && this.errorInfo && step.status === "pending"
            ? this.errorInfo
            : step.step_reasoning,
        image_path: step.image_path || prior?.image_path,
      };
    });

    this.persistSnapshot();
    this.persistRunJson();
  }

  finalizeReviewStateOnFailure(errorInfo: string) {
    const firstRunning =
      this.steps.find((step) => step.status === "running")?.step_number ||
      this.steps.find((step) => step.status === "pending")?.step_number;

    this.steps = this.steps.map((step) => {
      if (step.status === "pass" || step.status === "fail") {
        return step;
      }
      if (step.step_number === firstRunning) {
        return {
          ...step,
          status: "fail",
          step_reasoning: errorInfo,
        };
      }
      if (firstRunning && step.step_number > firstRunning) {
        return {
          ...step,
          status: "not_run",
          step_reasoning: "Run terminated before this step could execute.",
        };
      }
      return {
        ...step,
        status: "blocked",
        step_reasoning: "Run terminated before reviewer evidence resolved this step.",
      };
    });

    this.persistSnapshot();
    this.persistRunJson();
  }

  async extractStructuredArtifacts(page: Page) {
    const extraction = await page.evaluate(() => {
      const selectors = [
        "[role='log'] *",
        "[data-testid*='chat'] *",
        ".ibot-message",
        "[class*='message']",
      ];
      const alertSelectors = [".alert", "[role='alert']", ".toast", ".error"];

      const messages: Array<{ role: "user" | "assistant"; text: string }> = [];
      const seen = new Set<string>();

      for (const selector of selectors) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          const text = (node.textContent || "").trim();
          if (!text || text.length < 2) continue;
          const htmlNode = node as HTMLElement;
          const descriptor = `${selector}:${text}`;
          if (seen.has(descriptor)) continue;
          seen.add(descriptor);
          const className = htmlNode.className || "";
          const aria = htmlNode.getAttribute("aria-label") || "";
          const role =
            /user|client|you/i.test(className) || /user|client|you/i.test(aria)
              ? "user"
              : "assistant";
          messages.push({ role, text });
        }
      }

      const alerts = alertSelectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector))
          .map((node) => (node.textContent || "").trim())
          .filter(Boolean)
      );

      return { messages, alerts };
    });

    if (!Array.isArray(extraction.messages)) return;

    const ordered = extraction.messages as Array<{ role: "user" | "assistant"; text: string }>;
    const fingerprint = JSON.stringify(ordered);
    const priorFingerprint = JSON.stringify(this.orderedMessages);
    if (fingerprint === priorFingerprint) return;

    this.orderedMessages = ordered;
    this.transcript = this.buildTranscriptFromOrderedMessages(ordered);
    const latestTurn = this.transcript[this.transcript.length - 1];
    if (latestTurn) {
      this.appendEvent("chat.assistant_message", {
        turn: latestTurn.turn,
        user: latestTurn.user,
        assistant: latestTurn.assistant,
        confidence: latestTurn.confidence,
      });
    }
    fs.writeFileSync(
      path.join(this.extractsRoot, "chat_transcript.json"),
      JSON.stringify(this.transcript, null, 2),
      "utf8"
    );
    fs.writeFileSync(
      path.join(this.extractsRoot, "ui_entities.json"),
      JSON.stringify(
        {
          alerts: extraction.alerts,
        },
        null,
        2
      ),
      "utf8"
    );
    this.appendEvent("extractor.updated", {
      transcript_turns: this.transcript.length,
      alert_count: Array.isArray(extraction.alerts) ? extraction.alerts.length : 0,
    });

    this.extractorResults = await runConfiguredExtractors(this.workspace, {
      page,
      workspace: this.workspace,
      runId: this.runId,
      projectId: this.workspace.project.id,
      eventsPath: path.join(this.runRoot, "events.jsonl"),
      artifactsRoot: this.artifactsRoot,
      extractsRoot: this.extractsRoot,
      latestScreenshotLocalPath: this.latestScreenshotLocalPath,
      latestScreenshotPublicPath: this.latestScreenshotPublicPath,
      latestDomSnapshotPath: this.latestDomSnapshotPath,
      networkEvents: this.networkEvents,
      transcript: this.transcript as Array<Record<string, unknown>>,
    });
    this.transcript =
      (this.extractorResults.find((item) => item.kind === "chat_transcript")
        ?.output as Array<any>) || this.transcript;
    this.appendEvent("extractor.registry_completed", {
      extractor_count: this.extractorResults.length,
    });
  }

  setEvaluatorResults(results: unknown[]) {
    this.evaluatorResults = results;
    this.persistRunJson();
  }

  setFinalOutput(output: unknown) {
    this.finalOutput = output;
    this.persistRunJson();
  }

  recordOpenAIFileRefs(scope: string, refs: unknown[]) {
    this.openAiFileRefs.push(
      ...refs.map((ref) => ({
        scope,
        ...(typeof ref === "object" && ref ? ref : { value: ref }),
      }))
    );
    fs.writeFileSync(
      path.join(this.resultsRoot, "openai-file-refs.json"),
      JSON.stringify(this.openAiFileRefs, null, 2),
      "utf8"
    );
    this.appendEvent("openai.file_refs_recorded", {
      scope,
      count: refs.length,
    });
    this.persistRunJson();
  }

  recordCapturedData(
    schemaName: string,
    payload: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ) {
    const capture = {
      id: `${schemaName}-${Date.now()}`,
      schema_name: schemaName,
      payload,
      metadata: metadata || {},
      captured_at: new Date().toISOString(),
    };
    this.capturedData.push(capture);
    fs.writeFileSync(
      path.join(this.extractsRoot, "captured-data.json"),
      JSON.stringify(this.capturedData, null, 2),
      "utf8"
    );
    this.appendEvent("capture_data.stored", capture);
    this.persistRunJson();
    return capture;
  }

  private buildTranscriptFromOrderedMessages(
    ordered: Array<{ role: "user" | "assistant"; text: string }>
  ) {
    const turns: Array<{
      turn: number;
      user: string;
      assistant: string;
      source: string;
      confidence: number;
      completed_at: string;
    }> = [];
    let pendingUser = this.pendingUserInput || "";
    let turnIndex = 1;

    for (const message of ordered) {
      if (message.role === "user") {
        pendingUser = message.text;
      } else if (pendingUser) {
        turns.push({
          turn: turnIndex,
          user: pendingUser,
          assistant: message.text,
          source: "dom",
          confidence: 0.8,
          completed_at: new Date().toISOString(),
        });
        turnIndex += 1;
        pendingUser = "";
      }
    }

    return turns;
  }

  private persistResolvedConfig() {
    fs.writeFileSync(
      path.join(this.runRoot, "resolved-config.json"),
      JSON.stringify(this.workspace, null, 2),
      "utf8"
    );
  }

  private persistSnapshot() {
    fs.writeFileSync(
      path.join(this.runRoot, "run-snapshot.json"),
      JSON.stringify(this.getSnapshot(), null, 2),
      "utf8"
    );
  }

  private persistRunJson() {
    const metrics =
      this.workspace.testCase.metrics.length > 0
        ? this.workspace.testCase.metrics.filter((metric) => metric.enabled)
        : [
            {
              id: "default-metric",
              name: "Default evaluator",
              description: this.workspace.testCase.testDescription,
              systemPrompt: this.workspace.testCase.prompts.shared,
              enabled: true,
            },
          ];

    const persistedEvaluators =
      Array.isArray(this.evaluatorResults) && this.evaluatorResults.length > 0
        ? this.evaluatorResults
        : metrics.map((metric) => ({
            id: metric.id,
            name: metric.name,
            status:
              this.status === "pass"
                ? "pass"
                : this.status === "fail"
                  ? "fail"
                  : "pending",
            output_schema: this.workspace.testCase.output.responseFormat,
          }));

    const runJson = {
      schema_version: "1.0",
      run_id: this.runId,
      project_id: this.workspace.project.id,
      test_case_id: this.workspace.testCase.id,
      trigger: this.workspace.runDefaults.trigger,
      started_at: this.startedAt,
      finished_at: this.finishedAt,
      status: this.status,
      error_info: this.errorInfo,
      current_action: this.currentAction,
      evaluators: persistedEvaluators,
      chat_transcript: this.transcript,
      extractor_results: this.extractorResults,
      evaluator_results: this.evaluatorResults,
      final_output: this.finalOutput,
      openai_file_refs: this.openAiFileRefs,
      captured_data: this.capturedData,
      artifacts: Array.from(this.artifacts),
      step_count: this.steps.length,
      steps: this.steps,
    };

    fs.writeFileSync(
      path.join(this.runRoot, "run.json"),
      JSON.stringify(runJson, null, 2),
      "utf8"
    );
  }
}

export default RunRecorder;
