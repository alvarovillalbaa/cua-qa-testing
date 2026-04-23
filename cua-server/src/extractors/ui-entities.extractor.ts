import fs from "fs";
import { ExtractorHandler } from "./types";
import { ExtractorConfig } from "../lib/workspace-types";
import { ExtractorContext } from "./types";

export class UiEntitiesExtractor implements ExtractorHandler {
  supports(config: ExtractorConfig) {
    return config.kind === "ui_entities";
  }

  async run(config: ExtractorConfig, context: ExtractorContext) {
    const source: "dom" = "dom";
    const entities = await context.page.evaluate((selectors: string[]) => {
      const results: Array<{ selector: string; text: string }> = [];
      for (const selector of selectors) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          const text = (node.textContent || "").trim();
          if (text) results.push({ selector, text });
        }
      }
      return results;
    }, config.selectors);

    if (!entities.length) return null;

    fs.writeFileSync(
      `${context.extractsRoot}/${config.id}.json`,
      JSON.stringify(entities, null, 2),
      "utf8"
    );

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

export default UiEntitiesExtractor;
