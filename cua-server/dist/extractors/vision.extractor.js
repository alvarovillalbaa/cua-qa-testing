"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisionExtractor = void 0;
const fs_1 = __importDefault(require("fs"));
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
class VisionExtractor {
    supports(config) {
        return config.sourcePriority.includes("vision");
    }
    async run(config, context) {
        const source = "vision";
        if (!context.latestScreenshotLocalPath || !process.env.OPENAI_API_KEY) {
            return null;
        }
        const base64Image = fs_1.default.readFileSync(context.latestScreenshotLocalPath).toString("base64");
        const response = await openai.responses.create({
            model: process.env.CUA_MODEL || "gpt-5.4",
            input: [
                {
                    role: "system",
                    content: "You are an extraction engine. Return only JSON-compatible structured data.",
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `${config.schemaPrompt}\nExtractor kind: ${config.kind}`,
                        },
                        {
                            type: "input_image",
                            image_url: `data:image/png;base64,${base64Image}`,
                            detail: "high",
                        },
                    ],
                },
            ],
        });
        const rawText = response.output_text || "";
        fs_1.default.writeFileSync(`${context.extractsRoot}/${config.id}-vision.json`, rawText, "utf8");
        return {
            extractorId: config.id,
            extractorName: `${config.name} vision`,
            kind: config.kind,
            source,
            confidence: 0.55,
            output: rawText,
            updatedAt: new Date().toISOString(),
        };
    }
}
exports.VisionExtractor = VisionExtractor;
exports.default = VisionExtractor;
