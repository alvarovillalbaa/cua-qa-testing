"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunRecorder = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const logger_1 = __importDefault(require("../utils/logger"));
const registry_1 = require("../extractors/registry");
const workspace_paths_1 = require("./workspace-paths");
const action_utils_1 = require("./action-utils");
class RunRecorder {
    constructor(workspace) {
        this.eventCounter = 0;
        this.status = "running";
        this.errorInfo = null;
        this.finishedAt = null;
        this.currentAction = null;
        this.steps = [];
        this.transcript = [];
        this.orderedMessages = [];
        this.pendingUserInput = null;
        this.artifacts = new Set();
        this.networkEvents = [];
        this.extractorResults = [];
        this.latestScreenshotLocalPath = null;
        this.latestScreenshotPublicPath = null;
        this.latestDomSnapshotPath = null;
        this.evaluatorResults = [];
        this.finalOutput = null;
        this.openAiFileRefs = [];
        this.capturedData = [];
        this.workspace = workspace;
        this.runId = (0, crypto_1.randomUUID)();
        this.startedAt = new Date().toISOString();
        this.runRoot = (0, workspace_paths_1.getRunRoot)(workspace.project.id, this.runId);
        this.publicArtifactRoot = (0, workspace_paths_1.getPublicResultsRoot)(this.runId);
        this.artifactsRoot = (0, workspace_paths_1.getArtifactsRoot)(workspace.project.id, this.runId);
        this.extractsRoot = (0, workspace_paths_1.getExtractsRoot)(workspace.project.id, this.runId);
        this.evaluatorsRoot = (0, workspace_paths_1.getEvaluatorsRoot)(workspace.project.id, this.runId);
        this.resultsRoot = (0, workspace_paths_1.getResultsRoot)(workspace.project.id, this.runId);
        fs_1.default.mkdirSync(this.artifactsRoot, { recursive: true });
        fs_1.default.mkdirSync(this.extractsRoot, { recursive: true });
        fs_1.default.mkdirSync(this.publicArtifactRoot, { recursive: true });
        fs_1.default.mkdirSync(this.evaluatorsRoot, { recursive: true });
        fs_1.default.mkdirSync(this.resultsRoot, { recursive: true });
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
    initializeSteps(testCaseSteps) {
        this.steps = testCaseSteps.map((step, index) => ({
            step_number: step.step_number,
            step_instructions: step.step_instructions,
            status: index === 0 ? "running" : "pending",
            step_reasoning: "Waiting for evidence from the execution run.",
        }));
        this.persistSnapshot();
        this.persistRunJson();
    }
    async attachPageListeners(page) {
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
    async captureResponseEvent(response) {
        let bodyText = "";
        const headers = response.headers();
        const contentType = String(headers["content-type"] || "");
        if (/json|text|javascript/i.test(contentType)) {
            try {
                bodyText = (await response.text()).slice(0, 20000);
            }
            catch {
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
        fs_1.default.writeFileSync(path_1.default.join(this.artifactsRoot, "network-events.json"), JSON.stringify(this.networkEvents, null, 2), "utf8");
        this.appendEvent("network.response", {
            status: response.status(),
            url: response.url(),
            content_type: contentType,
        });
    }
    updateCurrentAction(label) {
        this.currentAction = label;
        this.persistSnapshot();
    }
    setRunStatus(status, errorInfo) {
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
    emitSnapshot(socket) {
        socket.emit("runstate", this.getSnapshot());
    }
    getSnapshot() {
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
    appendEvent(type, payload) {
        this.eventCounter += 1;
        const event = {
            id: `${this.runId}-${this.eventCounter}`,
            ts: new Date().toISOString(),
            type,
            payload,
        };
        fs_1.default.appendFileSync(path_1.default.join(this.runRoot, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
    }
    async recordActionSelection(page, action) {
        const target = await (0, action_utils_1.getTargetMetadataForAction)(page, action);
        const label = (0, action_utils_1.standardizeActionLabel)(action, target);
        this.currentAction = label;
        this.appendEvent("action.selected", {
            action,
            label,
            target,
        });
        if (action?.type === "type" && typeof action?.text === "string") {
            this.pendingUserInput = action.text;
        }
        if (action?.type === "keypress" &&
            Array.isArray(action?.keys) &&
            action.keys.map((key) => key.toUpperCase()).includes("ENTER") &&
            this.pendingUserInput) {
            this.appendEvent("chat.user_submitted", {
                text: this.pendingUserInput,
            });
        }
        this.persistSnapshot();
        return { label, target };
    }
    recordActionResult(action, label, target) {
        this.appendEvent("action.completed", {
            action,
            label,
            target,
        });
    }
    recordActionFailure(action, error) {
        this.appendEvent("action.failed", {
            action,
            error: String(error),
        });
    }
    async captureEvidence(page, kind) {
        try {
            const screenshot = await page.screenshot();
            const fileName = `${Date.now()}-${kind}.png`;
            const localPath = path_1.default.join(this.publicArtifactRoot, fileName);
            fs_1.default.writeFileSync(localPath, screenshot);
            const publicPath = `/test_results/${this.runId}/${fileName}`;
            this.artifacts.add(publicPath);
            this.latestScreenshotLocalPath = localPath;
            this.latestScreenshotPublicPath = publicPath;
            this.appendEvent("observation.screenshot_saved", {
                kind,
                path: publicPath,
            });
            const htmlPath = path_1.default.join(this.artifactsRoot, `${Date.now()}-${kind}.html`);
            const html = await page.content();
            fs_1.default.writeFileSync(htmlPath, html, "utf8");
            this.latestDomSnapshotPath = htmlPath;
            this.artifacts.add(htmlPath);
            this.appendEvent("observation.dom_snapshot_saved", {
                kind,
                path: htmlPath,
            });
            await this.extractStructuredArtifacts(page);
            this.persistRunJson();
            return publicPath;
        }
        catch (error) {
            logger_1.default.error(`Failed to capture evidence: ${error}`);
            this.appendEvent("observation.capture_failed", {
                kind,
                error: String(error),
            });
            return null;
        }
    }
    updateFromReviewState(reviewState) {
        const reviewMap = new Map(reviewState.steps.map((step) => [step.step_number, step]));
        const firstPending = reviewState.steps.find((step) => step.status === "pending")?.step_number;
        const hasFail = reviewState.steps.some((step) => step.status === "Fail");
        this.steps = reviewState.steps.map((step) => {
            let status = "pending";
            if (step.status === "Pass") {
                status = "pass";
            }
            else if (step.status === "Fail") {
                status = "fail";
            }
            else if (this.status === "running" && step.step_number === firstPending) {
                status = "running";
            }
            else if (this.status === "fail") {
                if (!hasFail && step.step_number === firstPending) {
                    status = "fail";
                }
                else if (step.step_number > (firstPending || 0)) {
                    status = "not_run";
                }
                else {
                    status = "blocked";
                }
            }
            else if (this.status === "pass") {
                status = "pass";
            }
            const prior = this.steps.find((item) => item.step_number === step.step_number);
            return {
                step_number: step.step_number,
                step_instructions: prior?.step_instructions ||
                    step.step_instructions ||
                    `Step ${step.step_number}`,
                status,
                step_reasoning: status === "fail" && this.errorInfo && step.status === "pending"
                    ? this.errorInfo
                    : step.step_reasoning,
                image_path: step.image_path || prior?.image_path,
            };
        });
        this.persistSnapshot();
        this.persistRunJson();
    }
    finalizeReviewStateOnFailure(errorInfo) {
        const firstRunning = this.steps.find((step) => step.status === "running")?.step_number ||
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
    async extractStructuredArtifacts(page) {
        const extraction = await page.evaluate(() => {
            const selectors = [
                "[role='log'] *",
                "[data-testid*='chat'] *",
                ".ibot-message",
                "[class*='message']",
            ];
            const alertSelectors = [".alert", "[role='alert']", ".toast", ".error"];
            const messages = [];
            const seen = new Set();
            for (const selector of selectors) {
                for (const node of Array.from(document.querySelectorAll(selector))) {
                    const text = (node.textContent || "").trim();
                    if (!text || text.length < 2)
                        continue;
                    const htmlNode = node;
                    const descriptor = `${selector}:${text}`;
                    if (seen.has(descriptor))
                        continue;
                    seen.add(descriptor);
                    const className = htmlNode.className || "";
                    const aria = htmlNode.getAttribute("aria-label") || "";
                    const role = /user|client|you/i.test(className) || /user|client|you/i.test(aria)
                        ? "user"
                        : "assistant";
                    messages.push({ role, text });
                }
            }
            const alerts = alertSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))
                .map((node) => (node.textContent || "").trim())
                .filter(Boolean));
            return { messages, alerts };
        });
        if (!Array.isArray(extraction.messages))
            return;
        const ordered = extraction.messages;
        const fingerprint = JSON.stringify(ordered);
        const priorFingerprint = JSON.stringify(this.orderedMessages);
        if (fingerprint === priorFingerprint)
            return;
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
        fs_1.default.writeFileSync(path_1.default.join(this.extractsRoot, "chat_transcript.json"), JSON.stringify(this.transcript, null, 2), "utf8");
        fs_1.default.writeFileSync(path_1.default.join(this.extractsRoot, "ui_entities.json"), JSON.stringify({
            alerts: extraction.alerts,
        }, null, 2), "utf8");
        this.appendEvent("extractor.updated", {
            transcript_turns: this.transcript.length,
            alert_count: Array.isArray(extraction.alerts) ? extraction.alerts.length : 0,
        });
        this.extractorResults = await (0, registry_1.runConfiguredExtractors)(this.workspace, {
            page,
            workspace: this.workspace,
            runId: this.runId,
            projectId: this.workspace.project.id,
            eventsPath: path_1.default.join(this.runRoot, "events.jsonl"),
            artifactsRoot: this.artifactsRoot,
            extractsRoot: this.extractsRoot,
            latestScreenshotLocalPath: this.latestScreenshotLocalPath,
            latestScreenshotPublicPath: this.latestScreenshotPublicPath,
            latestDomSnapshotPath: this.latestDomSnapshotPath,
            networkEvents: this.networkEvents,
            transcript: this.transcript,
        });
        this.transcript =
            this.extractorResults.find((item) => item.kind === "chat_transcript")
                ?.output || this.transcript;
        this.appendEvent("extractor.registry_completed", {
            extractor_count: this.extractorResults.length,
        });
    }
    setEvaluatorResults(results) {
        this.evaluatorResults = results;
        this.persistRunJson();
    }
    setFinalOutput(output) {
        this.finalOutput = output;
        this.persistRunJson();
    }
    recordOpenAIFileRefs(scope, refs) {
        this.openAiFileRefs.push(...refs.map((ref) => ({
            scope,
            ...(typeof ref === "object" && ref ? ref : { value: ref }),
        })));
        fs_1.default.writeFileSync(path_1.default.join(this.resultsRoot, "openai-file-refs.json"), JSON.stringify(this.openAiFileRefs, null, 2), "utf8");
        this.appendEvent("openai.file_refs_recorded", {
            scope,
            count: refs.length,
        });
        this.persistRunJson();
    }
    recordCapturedData(schemaName, payload, metadata) {
        const capture = {
            id: `${schemaName}-${Date.now()}`,
            schema_name: schemaName,
            payload,
            metadata: metadata || {},
            captured_at: new Date().toISOString(),
        };
        this.capturedData.push(capture);
        fs_1.default.writeFileSync(path_1.default.join(this.extractsRoot, "captured-data.json"), JSON.stringify(this.capturedData, null, 2), "utf8");
        this.appendEvent("capture_data.stored", capture);
        this.persistRunJson();
        return capture;
    }
    buildTranscriptFromOrderedMessages(ordered) {
        const turns = [];
        let pendingUser = this.pendingUserInput || "";
        let turnIndex = 1;
        for (const message of ordered) {
            if (message.role === "user") {
                pendingUser = message.text;
            }
            else if (pendingUser) {
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
    persistResolvedConfig() {
        fs_1.default.writeFileSync(path_1.default.join(this.runRoot, "resolved-config.json"), JSON.stringify(this.workspace, null, 2), "utf8");
    }
    persistSnapshot() {
        fs_1.default.writeFileSync(path_1.default.join(this.runRoot, "run-snapshot.json"), JSON.stringify(this.getSnapshot(), null, 2), "utf8");
    }
    persistRunJson() {
        const metrics = this.workspace.testCase.metrics.length > 0
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
        const persistedEvaluators = Array.isArray(this.evaluatorResults) && this.evaluatorResults.length > 0
            ? this.evaluatorResults
            : metrics.map((metric) => ({
                id: metric.id,
                name: metric.name,
                status: this.status === "pass"
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
        fs_1.default.writeFileSync(path_1.default.join(this.runRoot, "run.json"), JSON.stringify(runJson, null, 2), "utf8");
    }
}
exports.RunRecorder = RunRecorder;
exports.default = RunRecorder;
