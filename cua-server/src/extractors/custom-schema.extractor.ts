import fs from "fs";
import OpenAI from "openai";
import { ExtractorConfig } from "../lib/workspace-types";
import { ExtractorArtifact, ExtractorContext, ExtractorHandler } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class CustomSchemaExtractor implements ExtractorHandler {
  supports(config: ExtractorConfig) {
    return config.kind === "custom_schema";
  }

  async run(
    config: ExtractorConfig,
    context: ExtractorContext
  ): Promise<ExtractorArtifact | null> {
    const domValues =
      config.sourcePriority.includes("dom") && config.selectors.length > 0
        ? await context.page.evaluate((selectors: string[]) => {
            return selectors.map((selector) => ({
              selector,
              values: Array.from(document.querySelectorAll(selector))
                .map((node) => (node.textContent || "").trim())
                .filter(Boolean)
                .slice(0, 10),
            }));
          }, config.selectors)
        : [];

    let output: unknown = {
      selector_values: domValues,
      alerts: context.networkEvents
        .filter((event) => Number(event.status || 0) >= 400)
        .slice(0, 10),
    };
    let source: ExtractorArtifact["source"] = "dom";
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
              content: JSON.stringify(
                {
                  selector_values: domValues,
                  transcript: context.transcript,
                  network_events: context.networkEvents.slice(-20),
                },
                null,
                2
              ),
            },
          ],
        });
        output = response.output_text || output;
        source = "hybrid";
        confidence = 0.82;
      } catch {
        // fall back to deterministic DOM/network data
      }
    }

    fs.writeFileSync(
      `${context.extractsRoot}/${config.id}.json`,
      JSON.stringify(output, null, 2),
      "utf8"
    );

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

export default CustomSchemaExtractor;
