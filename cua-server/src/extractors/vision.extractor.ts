import fs from "fs";
import OpenAI from "openai";
import { ExtractorHandler } from "./types";
import { ExtractorConfig } from "../lib/workspace-types";
import { ExtractorContext } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class VisionExtractor implements ExtractorHandler {
  supports(config: ExtractorConfig) {
    return config.sourcePriority.includes("vision");
  }

  async run(config: ExtractorConfig, context: ExtractorContext) {
    const source: "vision" = "vision";
    if (!context.latestScreenshotLocalPath || !process.env.OPENAI_API_KEY) {
      return null;
    }

    const base64Image = fs.readFileSync(context.latestScreenshotLocalPath).toString("base64");
    const response = await openai.responses.create({
      model: process.env.CUA_MODEL || "gpt-5.4",
      input: [
        {
          role: "system",
          content:
            "You are an extraction engine. Return only JSON-compatible structured data.",
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
    fs.writeFileSync(
      `${context.extractsRoot}/${config.id}-vision.json`,
      rawText,
      "utf8"
    );

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

export default VisionExtractor;
