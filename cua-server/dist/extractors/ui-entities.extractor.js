"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UiEntitiesExtractor = void 0;
const fs_1 = __importDefault(require("fs"));
class UiEntitiesExtractor {
    supports(config) {
        return config.kind === "ui_entities";
    }
    async run(config, context) {
        const source = "dom";
        const entities = await context.page.evaluate((selectors) => {
            const results = [];
            for (const selector of selectors) {
                for (const node of Array.from(document.querySelectorAll(selector))) {
                    const text = (node.textContent || "").trim();
                    if (text)
                        results.push({ selector, text });
                }
            }
            return results;
        }, config.selectors);
        if (!entities.length)
            return null;
        fs_1.default.writeFileSync(`${context.extractsRoot}/${config.id}.json`, JSON.stringify(entities, null, 2), "utf8");
        return {
            extractorId: config.id,
            extractorName: config.name,
            kind: config.kind,
            source,
            confidence: 0.88,
            output: entities,
            updatedAt: new Date().toISOString(),
        };
    }
}
exports.UiEntitiesExtractor = UiEntitiesExtractor;
exports.default = UiEntitiesExtractor;
