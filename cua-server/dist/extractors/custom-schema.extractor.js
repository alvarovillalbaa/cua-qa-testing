"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomSchemaExtractor = void 0;
const fs_1 = __importDefault(require("fs"));
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
class CustomSchemaExtractor {
    supports(config) {
        return config.kind === "custom_schema";
    }
    async run(config, context) {
        const domValues = config.sourcePriority.includes("dom") && config.selectors.length > 0
            ? await context.page.evaluate((selectors) => {
                return selectors.map((selector) => ({
                    selector,
                    values: Array.from(document.querySelectorAll(selector))
                        .map((node) => (node.textContent || "").trim())
                        .filter(Boolean)
                        .slice(0, 10),
                }));
            }, config.selectors)
            : [];
        let output = {
            selector_values: domValues,
            alerts: context.networkEvents
                .filter((event) => Number(event.status || 0) >= 400)
                .slice(0, 10),
        };
        let source = "dom";
        let confidence = 0.7;
        if (process.env.OPENAI_API_KEY && config.schemaPrompt) {
            try {
                const response = await openai.responses.create({
                    model: process.env.CUA_MODEL || "gpt-5.4",
                    input: [
                        {
                            role: "system",
                            content: config.schemaPrompt,
                        },
                        {
                            role: "user",
                            content: JSON.stringify({
                                selector_values: domValues,
                                transcript: context.transcript,
                                network_events: context.networkEvents.slice(-20),
                            }, null, 2),
                        },
                    ],
                });
                output = response.output_text || output;
                source = "hybrid";
                confidence = 0.82;
            }
            catch {
                // fall back to deterministic DOM/network data
            }
        }
        fs_1.default.writeFileSync(`${context.extractsRoot}/${config.id}.json`, JSON.stringify(output, null, 2), "utf8");
        return {
            extractorId: config.id,
            extractorName: config.name,
            kind: config.kind,
            source,
            confidence,
            output,
            updatedAt: new Date().toISOString(),
        };
    }
}
exports.CustomSchemaExtractor = CustomSchemaExtractor;
exports.default = CustomSchemaExtractor;
