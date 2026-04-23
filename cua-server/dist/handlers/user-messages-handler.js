"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSocketMessage = handleSocketMessage;
const logger_1 = __importDefault(require("../utils/logger"));
const openai_cua_client_1 = require("../services/openai-cua-client");
const computer_use_loop_1 = require("../lib/computer-use-loop");
async function handleSocketMessage(socket, msg) {
    logger_1.default.debug(`Server received message: ${msg}`);
    // A message from user resumes the test script or instructs model to take an action.
    const page = socket.data.page;
    const previousResponseId = socket.data.previousResponseId;
    const testCaseReviewAgent = socket.data.testCaseReviewAgent;
    const runRecorder = socket.data.runRecorder;
    const screenshot = await page.screenshot();
    const screenshotBase64 = screenshot.toString("base64");
    const lastCallId = socket.data.lastCallId;
    const modelInput = {
        screenshotBase64: screenshotBase64,
        previousResponseId: previousResponseId,
        lastCallId: lastCallId,
    };
    const resumeResponse = await (0, openai_cua_client_1.sendInputToModel)(modelInput, msg);
    const response = await (0, computer_use_loop_1.computerUseLoop)(page, resumeResponse, testCaseReviewAgent, runRecorder, socket);
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
