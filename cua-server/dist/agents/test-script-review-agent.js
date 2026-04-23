"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * This agent processes test script review tasks sequentially using a task queue.
 * Each call to checkTestScriptStatus enqueues a new screenshot processing job.
 */
const logger_1 = __importDefault(require("../utils/logger"));
const openai_1 = __importDefault(require("openai"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const constants_1 = require("../lib/constants");
const openai = new openai_1.default();
class TestScriptReviewAgent {
    constructor() {
        this.turnIndex = 0;
        this.eventCounter = 0;
        // Flag whether to include the previous screenshot response in the input to the LLM - true works best
        this.includePreviousResponse = true;
        // Task queue related properties
        this.taskQueue = [];
        this.processingQueue = false;
        // Set the default model to "gpt-4o"
        this.model = "gpt-4o";
        // Maintain the previous response id.
        this.previous_response_id = null;
        // Save the current state of the test script. Initially null.
        this.test_script_state = null;
        // Initialize runFolder as null; will be set on each new run
        this.runFolder = null;
        this.runMetadata = null;
    }
    getRunFolderPath() {
        if (!this.runFolder)
            return null;
        return path_1.default.join(process.cwd(), "..", "frontend", "public", "test_results", this.runFolder);
    }
    ensureRunFolder() {
        const runFolderPath = this.getRunFolderPath();
        if (!runFolderPath)
            return;
        if (!fs_1.default.existsSync(runFolderPath)) {
            fs_1.default.mkdirSync(runFolderPath, { recursive: true });
            logger_1.default.debug(`Run folder created: ${runFolderPath}`);
        }
    }
    persistTestScriptStateJson() {
        const runFolderPath = this.getRunFolderPath();
        if (!runFolderPath || !this.test_script_state)
            return;
        const stateJsonPath = path_1.default.join(runFolderPath, "test_script_state.json");
        try {
            fs_1.default.writeFileSync(stateJsonPath, JSON.stringify(this.test_script_state, null, 2), "utf-8");
            logger_1.default.debug(`Test script state saved to: ${stateJsonPath}`);
        }
        catch (err) {
            logger_1.default.error("Error saving test_script_state.json", err);
        }
    }
    persistRunSummaryJson() {
        const runFolderPath = this.getRunFolderPath();
        if (!runFolderPath || !this.runMetadata)
            return;
        const runJsonPath = path_1.default.join(runFolderPath, "run.json");
        const runSummary = {
            schema_version: "1.0",
            run: this.runMetadata,
            traces: {
                events_jsonl: `/test_results/${this.runFolder}/events.jsonl`,
                latest_test_script_state_json: `/test_results/${this.runFolder}/test_script_state.json`,
            },
            counters: {
                turn_count: this.turnIndex,
                event_count: this.eventCounter,
                steps_total: this.test_script_state?.steps.length ?? 0,
                steps_passed: this.test_script_state?.steps.filter((s) => s.status === "Pass")
                    .length ?? 0,
                steps_failed: this.test_script_state?.steps.filter((s) => s.status === "Fail")
                    .length ?? 0,
                steps_pending: this.test_script_state?.steps.filter((s) => s.status === "pending")
                    .length ?? 0,
            },
        };
        try {
            fs_1.default.writeFileSync(runJsonPath, JSON.stringify(runSummary, null, 2), "utf-8");
            logger_1.default.debug(`Run summary saved to: ${runJsonPath}`);
        }
        catch (err) {
            logger_1.default.error("Error saving run summary", err);
        }
    }
    buildEventId() {
        this.eventCounter += 1;
        return `${this.runFolder || "run"}-${Date.now()}-${this.eventCounter}`;
    }
    buildEventSummary(type, payload) {
        if (type === "model_action_selected" && payload.action?.type) {
            return `Model selected action: ${payload.action.type}`;
        }
        if (type === "model_request_sent" && payload.request_type) {
            return `Sent model request: ${payload.request_type}`;
        }
        if (type === "model_response_received" && payload.response_id) {
            return `Received model response: ${payload.response_id}`;
        }
        if (type === "snapshot_saved" && payload.screenshot_type) {
            return `Snapshot saved: ${payload.screenshot_type}`;
        }
        if (type === "run_finalized" && payload.final_status) {
            return `Run finalized with status: ${payload.final_status}`;
        }
        return type.replace(/_/g, " ");
    }
    appendTraceEvent(type, payload = {}) {
        const runFolderPath = this.getRunFolderPath();
        if (!runFolderPath)
            return;
        this.ensureRunFolder();
        const event = {
            schema_version: "1.0",
            id: this.buildEventId(),
            ts: new Date().toISOString(),
            type,
            turn_index: this.turnIndex,
            summary: this.buildEventSummary(type, payload),
            payload,
        };
        const eventsPath = path_1.default.join(runFolderPath, "events.jsonl");
        try {
            fs_1.default.appendFileSync(eventsPath, JSON.stringify(event) + "\n", "utf-8");
        }
        catch (err) {
            logger_1.default.error("Error appending events.jsonl", err);
        }
        this.persistRunSummaryJson();
    }
    setRunContext(url) {
        if (!this.runMetadata)
            return;
        this.runMetadata.url = url;
        this.persistRunSummaryJson();
    }
    setRunStatus(status) {
        if (!this.runMetadata)
            return;
        if (this.runMetadata.final_status === "pass" || this.runMetadata.final_status === "fail") {
            return;
        }
        this.runMetadata.final_status = status;
        this.appendTraceEvent("run_status_updated", {
            status,
        });
        this.persistRunSummaryJson();
    }
    getCurrentVerdict() {
        const steps = this.test_script_state?.steps ?? [];
        if (steps.some((step) => step.status === "Fail"))
            return "fail";
        if (steps.length > 0 && steps.every((step) => step.status === "Pass")) {
            return "pass";
        }
        return "pending";
    }
    startNewTurn(context = {}) {
        this.turnIndex += 1;
        this.appendTraceEvent("turn_started", context);
    }
    saveTraceScreenshot(base64Image, screenshotType, extra = {}) {
        if (!this.runFolder)
            return null;
        this.ensureRunFolder();
        const runFolderPath = this.getRunFolderPath();
        if (!runFolderPath)
            return null;
        const screenshotFilename = `${this.turnIndex}-${screenshotType}-${(0, uuid_1.v4)()}.png`;
        const screenshotPathLocal = path_1.default.join(runFolderPath, screenshotFilename);
        const publicPath = `/test_results/${this.runFolder}/${screenshotFilename}`;
        try {
            const bufferData = Buffer.from(base64Image, "base64");
            fs_1.default.writeFileSync(screenshotPathLocal, new Uint8Array(bufferData));
            this.appendTraceEvent("snapshot_saved", {
                screenshot_type: screenshotType,
                screenshot_path: publicPath,
                ...extra,
            });
            return publicPath;
        }
        catch (err) {
            logger_1.default.error("Error saving trace screenshot", err);
            this.appendTraceEvent("snapshot_save_failed", {
                screenshot_type: screenshotType,
                error: String(err),
            });
            return null;
        }
    }
    finalizeRun(status, errorInfo) {
        if (!this.runMetadata)
            return;
        if (this.runMetadata.final_status === "pass" || this.runMetadata.final_status === "fail") {
            return;
        }
        const finishedAt = new Date().toISOString();
        this.runMetadata.final_status = status;
        this.runMetadata.finished_at = finishedAt;
        this.runMetadata.error_info = errorInfo || null;
        this.runMetadata.duration_ms =
            new Date(finishedAt).getTime() -
                new Date(this.runMetadata.started_at).getTime();
        this.appendTraceEvent("run_finalized", {
            final_status: status,
            error_info: this.runMetadata.error_info,
            duration_ms: this.runMetadata.duration_ms,
        });
        this.persistRunSummaryJson();
    }
    /**
     * Creates the initial test script state from the user instructions.
     */
    async instantiateAgent(userInstruction, url) {
        logger_1.default.debug(`Invoking Chat API (instantiateAgent) with instruction: ${userInstruction}`);
        logger_1.default.debug(`Instantiation agent - This should only be called once per test script run.`);
        const response = await openai.responses.create({
            model: this.model,
            input: [
                { role: "system", content: constants_1.TEST_SCRIPT_INITIALIZATION_PROMPT },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: "Instructions: " + userInstruction },
                    ],
                },
            ],
            text: {
                format: {
                    type: "json_schema",
                    name: "test_script_output",
                    schema: {
                        type: "object",
                        properties: {
                            steps: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        step_number: { type: "number" },
                                        status: {
                                            type: "string",
                                            enum: ["pending"],
                                        },
                                        step_reasoning: { type: "string" },
                                    },
                                    required: ["step_number", "status", "step_reasoning"],
                                    additionalProperties: false,
                                },
                            },
                        },
                        required: ["steps"],
                        additionalProperties: false,
                    },
                },
            },
        });
        logger_1.default.debug(`Response from instantiateAgent: ${JSON.stringify(response.output_text, null, 2)}`);
        this.previous_response_id = response.id;
        // Parse the returned JSON once, store it as an object
        const parsedState = JSON.parse(response.output_text);
        this.test_script_state = parsedState;
        // Create a unique folder for this run and store its name in runFolder
        this.runFolder = (0, uuid_1.v4)();
        this.ensureRunFolder();
        this.runMetadata = {
            run_id: this.runFolder,
            url: url || null,
            started_at: new Date().toISOString(),
            finished_at: null,
            final_status: "pending",
            duration_ms: null,
            error_info: null,
        };
        this.appendTraceEvent("run_initialized", {
            url: this.runMetadata.url,
            model: this.model,
        });
        this.appendTraceEvent("test_script_model_response_received", {
            response_id: response.id,
            source: "instantiateAgent",
        });
        this.persistTestScriptStateJson();
        this.persistRunSummaryJson();
        return response.output_text; // Return the raw JSON string for now
    }
    /**
     * Enqueues a new test script review task.
     */
    async checkTestScriptStatus(base64Image, userInstruction) {
        return new Promise((resolve, reject) => {
            // Enqueue the new task.
            this.taskQueue.push({ base64Image, userInstruction, resolve, reject });
            this.processQueue();
        });
    }
    /**
     * Processes the task queue sequentially.
     */
    async processQueue() {
        if (this.processingQueue)
            return;
        this.processingQueue = true;
        while (this.taskQueue.length > 0) {
            const { base64Image, userInstruction, resolve, reject } = this.taskQueue.shift();
            try {
                const result = await this.processTestScriptStatus(base64Image, userInstruction);
                resolve(result);
            }
            catch (error) {
                reject(error);
            }
        }
        this.processingQueue = false;
    }
    /**
     * Processes the test script status by sending the screenshot (and optional instruction) to the LLM,
     * then updating the test script state with any changes.
     */
    async processTestScriptStatus(base64Image, userInstruction) {
        logger_1.default.debug(`Invoking checkTestScriptStatus. Previous response id: ${this.previous_response_id}; Image length: ${base64Image.length}`);
        // If we don't already have a test_script_state, just parse blank structure
        if (!this.test_script_state) {
            this.test_script_state = { steps: [] };
            logger_1.default.warn("No previous test_script_state found, creating empty state.");
        }
        // Build the input messages starting with the system prompt.
        const inputMessages = [
            { role: "system", content: constants_1.TEST_SCRIPT_REVIEW_PROMPT },
        ];
        // Construct the user message content.
        const userContent = [];
        if (userInstruction) {
            userContent.push({
                type: "input_text",
                text: "Context: " + userInstruction,
            });
        }
        userContent.push({
            type: "input_image",
            image_url: `data:image/png;base64,${base64Image}`,
            detail: "high",
        });
        inputMessages.push({
            role: "user",
            content: userContent,
        });
        // Call the OpenAI API with the new payload.
        const response = await openai.responses.create({
            model: this.model,
            input: inputMessages,
            previous_response_id: this.previous_response_id || undefined,
            text: {
                format: {
                    type: "json_schema",
                    name: "test_script_output",
                    schema: {
                        type: "object",
                        properties: {
                            steps: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        step_number: { type: "number" },
                                        status: {
                                            type: "string",
                                            enum: ["pending", "Pass", "Fail"],
                                        },
                                        step_reasoning: { type: "string" },
                                    },
                                    required: ["step_number", "status", "step_reasoning"],
                                    additionalProperties: false,
                                },
                            },
                        },
                        required: ["steps"],
                        additionalProperties: false,
                    },
                },
            },
        });
        logger_1.default.debug(`Response output text: ${response.output_text}`);
        this.appendTraceEvent("test_script_model_response_received", {
            response_id: response.id,
            source: "checkTestScriptStatus",
            previous_response_id: this.previous_response_id,
        });
        // Conditionally update the previous response id based on the config setting.
        if (this.includePreviousResponse) {
            this.previous_response_id = response.id;
        }
        // Parse the new steps from the model
        const newState = JSON.parse(response.output_text);
        // Ensure the run folder exists (it should be set during instantiateAgent)
        if (!this.runFolder) {
            this.runFolder = (0, uuid_1.v4)();
            this.ensureRunFolder();
            if (!this.runMetadata) {
                this.runMetadata = {
                    run_id: this.runFolder,
                    url: null,
                    started_at: new Date().toISOString(),
                    finished_at: null,
                    final_status: "pending",
                    duration_ms: null,
                    error_info: null,
                };
            }
        }
        // Compare old vs. new test script states to determine if any step transitioned from "pending" -> "Pass"/"Fail".
        const oldSteps = this.test_script_state ? this.test_script_state.steps : [];
        const shouldSaveScreenshot = oldSteps.some((oldStep) => {
            const newStep = newState.steps.find((s) => s.step_number === oldStep.step_number);
            return (newStep &&
                oldStep.status === "pending" &&
                (newStep.status === "Pass" || newStep.status === "Fail"));
        });
        if (shouldSaveScreenshot) {
            // Save the screenshot under the run folder within /public/test_results
            const screenshotFilename = (0, uuid_1.v4)() + ".png";
            const runFolderPath = this.getRunFolderPath();
            const screenshotPathLocal = path_1.default.join(runFolderPath || "", screenshotFilename);
            try {
                const bufferData = Buffer.from(base64Image, "base64");
                fs_1.default.writeFileSync(screenshotPathLocal, new Uint8Array(bufferData));
                logger_1.default.debug(`Screenshot saved to: ${screenshotPathLocal}`);
            }
            catch (err) {
                logger_1.default.error("Error saving screenshot", err);
            }
            // Iterate through steps and attach the screenshot path only for those with a status change.
            for (const newStep of newState.steps) {
                const oldStep = oldSteps.find((s) => s.step_number === newStep.step_number);
                if (oldStep) {
                    if (oldStep.status === "pending" &&
                        (newStep.status === "Pass" || newStep.status === "Fail")) {
                        newStep.image_path =
                            "/test_results/" + this.runFolder + "/" + screenshotFilename;
                    }
                    else if (oldStep.image_path) {
                        newStep.image_path = oldStep.image_path;
                    }
                }
            }
        }
        else {
            // No status change detected; simply carry over any existing image paths.
            for (const newStep of newState.steps) {
                const oldStep = oldSteps.find((s) => s.step_number === newStep.step_number);
                if (oldStep && oldStep.image_path) {
                    newStep.image_path = oldStep.image_path;
                }
            }
        }
        // Update our internal test_script_state with the new state
        this.test_script_state = newState;
        this.appendTraceEvent("test_script_state_updated", {
            total_steps: this.test_script_state.steps.length,
            passed_steps: this.test_script_state.steps.filter((s) => s.status === "Pass")
                .length,
            failed_steps: this.test_script_state.steps.filter((s) => s.status === "Fail")
                .length,
            pending_steps: this.test_script_state.steps.filter((s) => s.status === "pending").length,
        });
        this.persistTestScriptStateJson();
        this.persistRunSummaryJson();
        // Return the entire updated JSON as a string
        const updatedJson = JSON.stringify(this.test_script_state);
        logger_1.default.debug(`Updated test_script_state: ${updatedJson}`);
        return updatedJson;
    }
}
exports.default = TestScriptReviewAgent;
