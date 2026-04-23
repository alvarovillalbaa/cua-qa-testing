import fs from "fs";
import { ExtractorConfig, WorkspaceDocument } from "../lib/workspace-types";
import { ExtractorArtifact, ExtractorContext, ExtractorHandler } from "./types";
import ChatTranscriptExtractor from "./chat-transcript.extractor";
import ChatLatencyExtractor from "./chat-latency.extractor";
import UiEntitiesExtractor from "./ui-entities.extractor";
import VisionExtractor from "./vision.extractor";
import CustomSchemaExtractor from "./custom-schema.extractor";

const handlers: ExtractorHandler[] = [
  new ChatTranscriptExtractor(),
  new ChatLatencyExtractor(),
  new UiEntitiesExtractor(),
  new VisionExtractor(),
  new CustomSchemaExtractor(),
];

export async function runConfiguredExtractors(
  workspace: WorkspaceDocument,
  context: ExtractorContext
) {
  const outputs: ExtractorArtifact[] = [];

  for (const config of workspace.testCase.extractors.filter((item) => item.enabled)) {
    const matchingHandlers = handlers.filter((handler) => handler.supports(config));
    for (const handler of matchingHandlers) {
      try {
        const result = await handler.run(config, context);
        if (result) {
          outputs.push(result);
          context.transcript =
            config.kind === "chat_transcript" && Array.isArray(result.output)
              ? (result.output as Array<Record<string, unknown>>)
              : context.transcript;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  fs.writeFileSync(
    `${context.extractsRoot}/extractor-results.json`,
    JSON.stringify(outputs, null, 2),
    "utf8"
  );

  return outputs;
}
