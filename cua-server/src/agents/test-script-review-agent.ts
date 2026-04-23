/**
 * This agent processes test script review tasks sequentially using a task queue.
 * Each call to checkTestScriptStatus enqueues a new screenshot processing job.
 */
import logger from "../utils/logger";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  TEST_SCRIPT_INITIALIZATION_PROMPT,
  TEST_SCRIPT_REVIEW_PROMPT,
} from "../lib/constants";

const openai = new OpenAI();

interface TestScriptState {
  steps: Array<{
    step_number: number;
    status: string;
    step_reasoning: string;
    image_path?: string;
  }>;
}

type RunStatus = "pending" | "running" | "pass" | "fail";

interface RunMetadata {
  run_id: string;
  url: string | null;
  started_at: string;
  finished_at: string | null;
  final_status: RunStatus;
  duration_ms: number | null;
  error_info: string | null;
}

interface TraceEvent {
  schema_version: "1.0";
  id: string;
  ts: string;
  type: string;
  turn_index: number;
  summary: string;
  payload: Record<string, any>;
}

interface Task {
  base64Image: string;
  userInstruction?: string;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

class TestScriptReviewAgent {
  model: string;
  previous_response_id: string | null;
  test_script_state: TestScriptState | null;
  runFolder: string | null;
  runMetadata: RunMetadata | null;
  private turnIndex: number = 0;
  private eventCounter: number = 0;

  // Flag whether to include the previous screenshot response in the input to the LLM - true works best
  includePreviousResponse: boolean = true;

  // Task queue related properties
  private taskQueue: Task[] = [];
  private processingQueue: boolean = false;

  constructor() {
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

  private getRunFolderPath(): string | null {
    if (!this.runFolder) return null;
    return path.join(
      process.cwd(),
      "..",
      "frontend",
      "public",
      "test_results",
      this.runFolder
    );
  }

  private ensureRunFolder(): void {
    const runFolderPath = this.getRunFolderPath();
    if (!runFolderPath) return;
    if (!fs.existsSync(runFolderPath)) {
      fs.mkdirSync(runFolderPath, { recursive: true });
      logger.debug(`Run folder created: ${runFolderPath}`);
    }
  }

  private persistTestScriptStateJson(): void {
    const runFolderPath = this.getRunFolderPath();
    if (!runFolderPath || !this.test_script_state) return;

    const stateJsonPath = path.join(runFolderPath, "test_script_state.json");
    try {
      fs.writeFileSync(
        stateJsonPath,
        JSON.stringify(this.test_script_state, null, 2),
        "utf-8"
      );
      logger.debug(`Test script state saved to: ${stateJsonPath}`);
    } catch (err) {
      logger.error({ err }, "Error saving test_script_state.json");
    }
  }

  private persistRunSummaryJson(): void {
    const runFolderPath = this.getRunFolderPath();
    if (!runFolderPath || !this.runMetadata) return;

    const runJsonPath = path.join(runFolderPath, "run.json");
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
        steps_passed:
          this.test_script_state?.steps.filter((s) => s.status === "Pass")
            .length ?? 0,
        steps_failed:
          this.test_script_state?.steps.filter((s) => s.status === "Fail")
            .length ?? 0,
        steps_pending:
          this.test_script_state?.steps.filter((s) => s.status === "pending")
            .length ?? 0,
      },
    };

    try {
      fs.writeFileSync(runJsonPath, JSON.stringify(runSummary, null, 2), "utf-8");
      logger.debug(`Run summary saved to: ${runJsonPath}`);
    } catch (err) {
      logger.error({ err }, "Error saving run summary");
    }
  }

  private buildEventId(): string {
    this.eventCounter += 1;
    return `${this.runFolder || "run"}-${Date.now()}-${this.eventCounter}`;
  }

  private buildEventSummary(type: string, payload: Record<string, any>): string {
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

  appendTraceEvent(type: string, payload: Record<string, any> = {}): void {
    const runFolderPath = this.getRunFolderPath();
    if (!runFolderPath) return;

    this.ensureRunFolder();
    const event: TraceEvent = {
      schema_version: "1.0",
      id: this.buildEventId(),
      ts: new Date().toISOString(),
      type,
      turn_index: this.turnIndex,
      summary: this.buildEventSummary(type, payload),
      payload,
    };

    const eventsPath = path.join(runFolderPath, "events.jsonl");
    try {
      fs.appendFileSync(eventsPath, JSON.stringify(event) + "\n", "utf-8");
    } catch (err) {
      logger.error({ err }, "Error appending events.jsonl");
    }

    this.persistRunSummaryJson();
  }

  setRunContext(url: string): void {
    if (!this.runMetadata) return;
    this.runMetadata.url = url;
    this.persistRunSummaryJson();
  }

  setRunStatus(status: RunStatus): void {
    if (!this.runMetadata) return;
    if (this.runMetadata.final_status === "pass" || this.runMetadata.final_status === "fail") {
      return;
    }
    this.runMetadata.final_status = status;
    this.appendTraceEvent("run_status_updated", {
      status,
    });
    this.persistRunSummaryJson();
  }

  getCurrentVerdict(): RunStatus {
    const steps = this.test_script_state?.steps ?? [];
    if (steps.some((step) => step.status === "Fail")) return "fail";
    if (steps.length > 0 && steps.every((step) => step.status === "Pass")) {
      return "pass";
    }
    return "pending";
  }

  startNewTurn(context: Record<string, any> = {}): void {
    this.turnIndex += 1;
    this.appendTraceEvent("turn_started", context);
  }

  saveTraceScreenshot(
    base64Image: string,
    screenshotType: string,
    extra: Record<string, any> = {}
  ): string | null {
    if (!this.runFolder) return null;
    this.ensureRunFolder();
    const runFolderPath = this.getRunFolderPath();
    if (!runFolderPath) return null;

    const screenshotFilename = `${this.turnIndex}-${screenshotType}-${uuidv4()}.png`;
    const screenshotPathLocal = path.join(runFolderPath, screenshotFilename);
    const publicPath = `/test_results/${this.runFolder}/${screenshotFilename}`;

    try {
      const bufferData = Buffer.from(base64Image, "base64");
      fs.writeFileSync(screenshotPathLocal, new Uint8Array(bufferData));
      this.appendTraceEvent("snapshot_saved", {
        screenshot_type: screenshotType,
        screenshot_path: publicPath,
        ...extra,
      });
      return publicPath;
    } catch (err) {
      logger.error({ err }, "Error saving trace screenshot");
      this.appendTraceEvent("snapshot_save_failed", {
        screenshot_type: screenshotType,
        error: String(err),
      });
      return null;
    }
  }

  finalizeRun(status: RunStatus, errorInfo?: string): void {
    if (!this.runMetadata) return;
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
  async instantiateAgent(userInstruction: string, url?: string): Promise<any> {
    logger.debug(
      `Invoking Chat API (instantiateAgent) with instruction: ${userInstruction}`
    );
    logger.debug(
      `Instantiation agent - This should only be called once per test script run.`
    );

    const response = await openai.responses.create({
      model: this.model,
      input: [
        { role: "system", content: TEST_SCRIPT_INITIALIZATION_PROMPT },
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

    logger.debug(
      `Response from instantiateAgent: ${JSON.stringify(
        response.output_text,
        null,
        2
      )}`
    );

    this.previous_response_id = response.id;

    // Parse the returned JSON once, store it as an object
    const parsedState: TestScriptState = JSON.parse(response.output_text);
    this.test_script_state = parsedState;

    // Create a unique folder for this run and store its name in runFolder
    this.runFolder = uuidv4();
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
  async checkTestScriptStatus(
    base64Image: string,
    userInstruction?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // Enqueue the new task.
      this.taskQueue.push({ base64Image, userInstruction, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Processes the task queue sequentially.
   */
  private async processQueue() {
    if (this.processingQueue) return;
    this.processingQueue = true;

    while (this.taskQueue.length > 0) {
      const { base64Image, userInstruction, resolve, reject } =
        this.taskQueue.shift()!;
      try {
        const result = await this.processTestScriptStatus(
          base64Image,
          userInstruction
        );
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
    this.processingQueue = false;
  }

  /**
   * Processes the test script status by sending the screenshot (and optional instruction) to the LLM,
   * then updating the test script state with any changes.
   */
  private async processTestScriptStatus(
    base64Image: string,
    userInstruction?: string
  ): Promise<any> {
    logger.debug(
      `Invoking checkTestScriptStatus. Previous response id: ${this.previous_response_id}; Image length: ${base64Image.length}`
    );

    // If we don't already have a test_script_state, just parse blank structure
    if (!this.test_script_state) {
      this.test_script_state = { steps: [] };
      logger.warn("No previous test_script_state found, creating empty state.");
    }

    // Build the input messages starting with the system prompt.
    const inputMessages: Array<any> = [
      { role: "system", content: TEST_SCRIPT_REVIEW_PROMPT },
    ];

    // Construct the user message content.
    const userContent: Array<any> = [];
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

    logger.debug(`Response output text: ${response.output_text}`);
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
    const newState: TestScriptState = JSON.parse(response.output_text);

    // Ensure the run folder exists (it should be set during instantiateAgent)
    if (!this.runFolder) {
      this.runFolder = uuidv4();
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
      const newStep = newState.steps.find(
        (s) => s.step_number === oldStep.step_number
      );
      return (
        newStep &&
        oldStep.status === "pending" &&
        (newStep.status === "Pass" || newStep.status === "Fail")
      );
    });

    if (shouldSaveScreenshot) {
      // Save the screenshot under the run folder within /public/test_results
      const screenshotFilename = uuidv4() + ".png";
      const runFolderPath = this.getRunFolderPath();
      const screenshotPathLocal = path.join(runFolderPath || "", screenshotFilename);
      try {
        const bufferData = Buffer.from(base64Image, "base64");
        fs.writeFileSync(screenshotPathLocal, new Uint8Array(bufferData));
        logger.debug(`Screenshot saved to: ${screenshotPathLocal}`);
      } catch (err) {
        logger.error({ err }, "Error saving screenshot");
      }

      // Iterate through steps and attach the screenshot path only for those with a status change.
      for (const newStep of newState.steps) {
        const oldStep = oldSteps.find(
          (s) => s.step_number === newStep.step_number
        );
        if (oldStep) {
          if (
            oldStep.status === "pending" &&
            (newStep.status === "Pass" || newStep.status === "Fail")
          ) {
            newStep.image_path =
              "/test_results/" + this.runFolder + "/" + screenshotFilename;
          } else if (oldStep.image_path) {
            newStep.image_path = oldStep.image_path;
          }
        }
      }
    } else {
      // No status change detected; simply carry over any existing image paths.
      for (const newStep of newState.steps) {
        const oldStep = oldSteps.find(
          (s) => s.step_number === newStep.step_number
        );
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
      pending_steps: this.test_script_state.steps.filter(
        (s) => s.status === "pending"
      ).length,
    });
    this.persistTestScriptStateJson();
    this.persistRunSummaryJson();

    // Return the entire updated JSON as a string
    const updatedJson = JSON.stringify(this.test_script_state);
    logger.debug(`Updated test_script_state: ${updatedJson}`);
    return updatedJson;
  }
}

export default TestScriptReviewAgent;
