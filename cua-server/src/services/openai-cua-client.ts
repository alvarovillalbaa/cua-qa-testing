import OpenAI from "openai";
import logger from "../utils/logger";
import {
  OpenAIResponseInputFile,
  sanitizeResponseInput,
} from "../lib/openai-file-utils";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type CuaToolType = "computer" | "computer_use_preview";

// Environment specific instructions for the CUA model e.g., MacOS specific actions CMD+A vs CTRL+A
const envInstructions = process.env.ENV_SPECIFIC_INSTRUCTIONS || "";
const configuredModel = process.env.CUA_MODEL || "gpt-5.4";
const configuredToolType = (
  process.env.CUA_TOOL_TYPE || "computer"
) as CuaToolType;

const cuaPrompt = `You are a testing agent. You will be given a list of instructions with steps to test a web application.
You must navigate the web application and perform the actions described in the instructions.
Use the computer tool to interact with the browser.
Do not decide that the run is finished on your own. Keep taking the next necessary browser action until the system stops the run.
If you are blocked, try the documented recovery path in the instructions before attempting anything else.
You do not need to authenticate on user's behalf, the user will authenticate and your flow starts after that.
Use the capture_data tool only when you need to persist structured visible data that is not already deterministically captured by the default telemetry and extractors.`;

function resolveToolType(): CuaToolType {
  if (configuredToolType === "computer" || configuredToolType === "computer_use_preview") {
    return configuredToolType;
  }

  logger.warn(
    `Invalid CUA_TOOL_TYPE '${configuredToolType}'. Falling back to 'computer'.`
  );
  return "computer";
}

const computerToolType = resolveToolType();

const tools = [
  {
    type: computerToolType,
  },
  {
    type: "function" as const,
    name: "capture_data",
    description:
      "Store structured data visible in the current UI according to a named schema. Use this only for ambiguous or domain-specific data capture.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        schema_name: {
          type: "string",
          description: "Named schema such as chatbot_turn, booking_summary, modal_options.",
        },
        payload_json: {
          type: "string",
          description:
            "JSON string with the structured data visible in the UI right now.",
        },
        notes: {
          type: "string",
          description: "Short note explaining why this capture was needed.",
        },
      },
      required: ["schema_name", "payload_json"],
      additionalProperties: false,
    },
  },
];

interface OpenAIResponse {
  id: string;
  output: Array<any>;
}

export interface ModelInput {
  screenshotBase64: string;
  previousResponseId?: string;
  lastCallId?: string;
}

// Helper to construct and send a request to the CUA model
async function callCUAModel(input: any[], previousResponseId?: string) {
  logger.trace("Sending request body to the model...");
  const sanitizedInput = sanitizeResponseInput(input);

  const requestBody: any = {
    model: configuredModel,
    tools,
    input: sanitizedInput,
    reasoning: {
      effort: "low",
      summary: "auto"
    },
    truncation: "auto",
    tool_choice: "required",
  };

  if (previousResponseId) {
    requestBody.previous_response_id = previousResponseId;
    logger.trace(
      `Adding previous response ID to the request body: ${previousResponseId}`
    );
  }

  logger.trace(
    `Calling CUA model API with the request body: ${JSON.stringify(
      requestBody,
      null,
      2
    )}`
  );
  try {
    const response = await openai.responses.create(requestBody);
    logger.trace("Received response from the model.");
    return response;
  } catch (error: any) {
    logger.error(
      {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        type: error?.type,
        param: error?.param,
        request_id: error?.request_id,
        error: error?.error,
        response: error?.response?.data,
        model: requestBody?.model,
        tool_types: Array.isArray(requestBody?.tools)
          ? requestBody.tools.map((tool: any) => tool?.type)
          : [],
      },
      "CUA model request failed"
    );
    throw error;
  }
}

/**
 * Sends input (or screenshot output) to the OpenAI model.
 * If no lastCallId is provided, it sends an initial query.
 */
export async function sendInputToModel(
  { screenshotBase64, previousResponseId, lastCallId }: ModelInput,
  userMessage?: string
): Promise<OpenAIResponse> {
  logger.trace("Building image input for the model...");
  const input: any[] = [];

  if (lastCallId) {
    // This is a follow-up call with a screenshot
    logger.trace(
      `Adding screenshot to the input with the call ID: ${lastCallId}`
    );
    input.push({
      call_id: lastCallId,
      type: "computer_call_output",
      output: {
        type:
          computerToolType === "computer"
            ? "computer_screenshot"
            : "input_image",
        ...(computerToolType === "computer"
          ? { detail: "original" }
          : {}),
        image_url: `data:image/png;base64,${screenshotBase64}`,
      },
    });
  }

  if (userMessage) {
    input.push({
      role: "user",
      content: userMessage,
    });
  }

  return callCUAModel(input, previousResponseId);
}

export async function sendFunctionCallOutput(
  callId: string,
  previousResponseId: string,
  outputObj: object = {}
): Promise<OpenAIResponse> {
  const input = [
    {
      call_id: callId,
      type: "function_call_output",
      output: JSON.stringify(outputObj),
    },
  ];

  return callCUAModel(input, previousResponseId);
}

export async function setupCUAModel(
  systemPrompt: string,
  userInfo: string,
  inputFiles: OpenAIResponseInputFile[] = []
) {
  logger.trace("Setting up CUA model...");
  const input: any[] = [];

  const cua_initiation_prompt = `${cuaPrompt}
      ${
        envInstructions
          ? "Environment specific instructions: " + envInstructions
          : ""
      }
      `;

  logger.trace(`CUA system prompt: ${cua_initiation_prompt}`);

  input.push({
    role: "system",
    content: cua_initiation_prompt,
  });

  input.push({
    role: "user",
    content: [
      {
        type: "input_text",
        text: `INSTRUCTIONS:\n${systemPrompt}\n\nUSER INFO:\n${userInfo}`,
      },
      ...inputFiles,
    ],
  });

  return callCUAModel(input);
}
