"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInputToModel = sendInputToModel;
exports.sendFunctionCallOutput = sendFunctionCallOutput;
exports.setupCUAModel = setupCUAModel;
const openai_1 = __importDefault(require("openai"));
const logger_1 = __importDefault(require("../utils/logger"));
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
// Environment specific instructions for the CUA model e.g., MacOS specific actions CMD+A vs CTRL+A
const envInstructions = process.env.ENV_SPECIFIC_INSTRUCTIONS || "";
const configuredModel = process.env.CUA_MODEL || "gpt-5.4";
const configuredToolType = (process.env.CUA_TOOL_TYPE || "computer");
const cuaPrompt = `You are a testing agent. You will be given a list of instructions with steps to test a web application.
You must navigate the web application and perform the actions described in the instructions.
Use the computer tool to interact with the browser.
Do not decide that the run is finished on your own. Keep taking the next necessary browser action until the system stops the run.
If you are blocked, try the documented recovery path in the instructions before attempting anything else.
You do not need to authenticate on user's behalf, the user will authenticate and your flow starts after that.`;
function resolveToolType() {
    if (configuredToolType === "computer" || configuredToolType === "computer_use_preview") {
        return configuredToolType;
    }
    logger_1.default.warn(`Invalid CUA_TOOL_TYPE '${configuredToolType}'. Falling back to 'computer'.`);
    return "computer";
}
const computerToolType = resolveToolType();
const tools = [
    {
        type: computerToolType,
    },
];
// Helper to construct and send a request to the CUA model
async function callCUAModel(input, previousResponseId) {
    logger_1.default.trace("Sending request body to the model...");
    const requestBody = {
        model: configuredModel,
        tools,
        input,
        reasoning: {
            effort: "low",
            summary: "auto"
        },
        truncation: "auto",
        tool_choice: "required",
    };
    if (previousResponseId) {
        requestBody.previous_response_id = previousResponseId;
        logger_1.default.trace(`Adding previous response ID to the request body: ${previousResponseId}`);
    }
    logger_1.default.trace(`Calling CUA model API with the request body: ${JSON.stringify(requestBody, null, 2)}`);
    try {
        const response = await openai.responses.create(requestBody);
        logger_1.default.trace("Received response from the model.");
        return response;
    }
    catch (error) {
        logger_1.default.error({
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
                ? requestBody.tools.map((tool) => tool?.type)
                : [],
        }, "CUA model request failed");
        throw error;
    }
}
/**
 * Sends input (or screenshot output) to the OpenAI model.
 * If no lastCallId is provided, it sends an initial query.
 */
async function sendInputToModel({ screenshotBase64, previousResponseId, lastCallId }, userMessage) {
    logger_1.default.trace("Building image input for the model...");
    const input = [];
    if (lastCallId) {
        // This is a follow-up call with a screenshot
        logger_1.default.trace(`Adding screenshot to the input with the call ID: ${lastCallId}`);
        input.push({
            call_id: lastCallId,
            type: "computer_call_output",
            output: {
                type: computerToolType === "computer"
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
async function sendFunctionCallOutput(callId, previousResponseId, outputObj = {}) {
    const input = [
        {
            call_id: callId,
            type: "function_call_output",
            output: JSON.stringify(outputObj),
        },
    ];
    return callCUAModel(input, previousResponseId);
}
async function setupCUAModel(systemPrompt, userInfo) {
    logger_1.default.trace("Setting up CUA model...");
    const input = [];
    const cua_initiation_prompt = `${cuaPrompt}
      ${envInstructions
        ? "Environment specific instructions: " + envInstructions
        : ""}
      `;
    logger_1.default.trace(`CUA system prompt: ${cua_initiation_prompt}`);
    input.push({
        role: "system",
        content: cua_initiation_prompt,
    });
    input.push({
        role: "user",
        content: `INSTRUCTIONS:\n${systemPrompt}\n\nUSER INFO:\n${userInfo}`,
    });
    return callCUAModel(input);
}
