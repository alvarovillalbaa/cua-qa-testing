import fs from "fs";
import { ExtractorHandler } from "./types";
import { ExtractorConfig } from "../lib/workspace-types";
import { ExtractorContext } from "./types";

async function extractDomTranscript(
  selectors: string[],
  page: any
): Promise<Array<{ role: "user" | "assistant"; text: string }>> {
  return page.evaluate((candidateSelectors: string[]) => {
    const ordered: Array<{ role: "user" | "assistant"; text: string }> = [];
    const seen = new Set<string>();

    for (const selector of candidateSelectors) {
      for (const node of Array.from(document.querySelectorAll(selector))) {
        const text = (node.textContent || "").trim();
        if (!text) continue;
        const element = node as HTMLElement;
        const fingerprint = `${selector}:${text}`;
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        const descriptor = `${element.className} ${element.getAttribute("aria-label") || ""}`;
        const role =
          /user|client|you|tester/i.test(descriptor) ? "user" : "assistant";
        ordered.push({ role, text });
      }
    }

    return ordered;
  }, selectors);
}

function extractNetworkTranscript(
  networkEvents: Array<Record<string, unknown>>
): Array<{ role: "user" | "assistant"; text: string }> {
  const ordered: Array<{ role: "user" | "assistant"; text: string }> = [];

  for (const event of networkEvents) {
    const bodyText = typeof event.bodyText === "string" ? event.bodyText : "";
    if (!bodyText) continue;
    try {
      const parsed = JSON.parse(bodyText);
      const candidates = Array.isArray(parsed?.messages)
        ? parsed.messages
        : Array.isArray(parsed?.conversation)
          ? parsed.conversation
          : [];
      for (const candidate of candidates) {
        if (!candidate) continue;
        const role = /user|client|you/i.test(String(candidate.role || ""))
          ? "user"
          : "assistant";
        const text = String(candidate.content || candidate.text || "").trim();
        if (text) ordered.push({ role, text });
      }
    } catch {
      continue;
    }
  }

  return ordered;
}

export class ChatTranscriptExtractor implements ExtractorHandler {
  supports(config: ExtractorConfig) {
    return config.kind === "chat_transcript";
  }

  async run(config: ExtractorConfig, context: ExtractorContext) {
    let domMessages: Array<{ role: "user" | "assistant"; text: string }> = [];
    let networkMessages: Array<{ role: "user" | "assistant"; text: string }> = [];

    if (config.sourcePriority.includes("dom")) {
      domMessages = await extractDomTranscript(config.selectors, context.page);
    }

    if (config.sourcePriority.includes("network")) {
      networkMessages = extractNetworkTranscript(context.networkEvents);
    }

    const merged = domMessages.length >= networkMessages.length ? domMessages : networkMessages;
    if (merged.length === 0) return null;

    const turns: Array<{
      turn: number;
      user: string;
      assistant: string;
      source: string;
      confidence: number;
      started_at: string;
      completed_at: string;
    }> = [];
    let pendingUser = "";
    let turn = 1;

    for (const message of merged) {
      if (message.role === "user") {
        pendingUser = message.text;
      } else if (pendingUser) {
        turns.push({
          turn,
          user: pendingUser,
          assistant: message.text,
          source: domMessages.length > 0 ? "dom" : "network",
          confidence: domMessages.length > 0 ? 0.9 : 0.72,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });
        pendingUser = "";
        turn += 1;
      }
    }

    const source: "dom" | "network" | "hybrid" =
      domMessages.length > 0 && networkMessages.length > 0
        ? "hybrid"
        : domMessages.length > 0
          ? "dom"
          : "network";

    fs.writeFileSync(
      `${context.extractsRoot}/${config.id}.json`,
      JSON.stringify(turns, null, 2),
      "utf8"
    );

    return {
      extractorId: config.id,
      extractorName: config.name,
      kind: config.kind,
      source,
      confidence: domMessages.length > 0 && networkMessages.length > 0 ? 0.94 : domMessages.length > 0 ? 0.9 : 0.72,
      output: turns,
      updatedAt: new Date().toISOString(),
    };
  }
}

export default ChatTranscriptExtractor;
