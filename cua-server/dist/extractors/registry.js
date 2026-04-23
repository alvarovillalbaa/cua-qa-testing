"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runConfiguredExtractors = runConfiguredExtractors;
const fs_1 = __importDefault(require("fs"));
const chat_transcript_extractor_1 = __importDefault(require("./chat-transcript.extractor"));
const chat_latency_extractor_1 = __importDefault(require("./chat-latency.extractor"));
const ui_entities_extractor_1 = __importDefault(require("./ui-entities.extractor"));
const vision_extractor_1 = __importDefault(require("./vision.extractor"));
const custom_schema_extractor_1 = __importDefault(require("./custom-schema.extractor"));
const handlers = [
    new chat_transcript_extractor_1.default(),
    new chat_latency_extractor_1.default(),
    new ui_entities_extractor_1.default(),
    new vision_extractor_1.default(),
    new custom_schema_extractor_1.default(),
];
async function runConfiguredExtractors(workspace, context) {
    const outputs = [];
    for (const config of workspace.testCase.extractors.filter((item) => item.enabled)) {
        const matchingHandlers = handlers.filter((handler) => handler.supports(config));
        for (const handler of matchingHandlers) {
            try {
                const result = await handler.run(config, context);
                if (result) {
                    outputs.push(result);
                    context.transcript =
                        config.kind === "chat_transcript" && Array.isArray(result.output)
                            ? result.output
                            : context.transcript;
                    break;
                }
            }
            catch {
                continue;
            }
        }
    }
    fs_1.default.writeFileSync(`${context.extractsRoot}/extractor-results.json`, JSON.stringify(outputs, null, 2), "utf8");
    return outputs;
}
