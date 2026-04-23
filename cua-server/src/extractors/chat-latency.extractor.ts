import fs from "fs";
import { ExtractorConfig } from "../lib/workspace-types";
import { ExtractorArtifact, ExtractorContext, ExtractorHandler } from "./types";

type LoggedEvent = {
  ts: string;
  type: string;
  payload?: Record<string, unknown>;
};

function readEvents(eventsPath: string): LoggedEvent[] {
  try {
    return fs
      .readFileSync(eventsPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LoggedEvent);
  } catch {
    return [];
  }
}

export class ChatLatencyExtractor implements ExtractorHandler {
  supports(config: ExtractorConfig) {
    return config.kind === "chat_latency";
  }

  async run(
    config: ExtractorConfig,
    context: ExtractorContext
  ): Promise<ExtractorArtifact | null> {
    const events = readEvents(context.eventsPath);
    const submittedAt = events
      .filter((event) => event.type === "chat.user_submitted")
      .map((event) => event.ts);

    if (submittedAt.length === 0 || context.transcript.length === 0) {
      return null;
    }

    const output = context.transcript.map((turn, index) => {
      const completedAt = String(turn.completed_at || new Date().toISOString());
      const startedAt = submittedAt[index] || submittedAt[submittedAt.length - 1];
      return {
        turn: turn.turn,
        started_at: startedAt,
        completed_at: completedAt,
        latency_ms:
          new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      };
    });

    fs.writeFileSync(
      `${context.extractsRoot}/${config.id}.json`,
      JSON.stringify(output, null, 2),
      "utf8"
    );

    return {
      extractorId: config.id,
      extractorName: config.name,
      kind: config.kind,
      source: "events",
      confidence: 0.88,
      output,
      updatedAt: new Date().toISOString(),
    };
  }
}

export default ChatLatencyExtractor;
