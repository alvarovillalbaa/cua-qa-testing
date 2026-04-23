"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatTranscriptExtractor = void 0;
const fs_1 = __importDefault(require("fs"));
async function extractDomTranscript(selectors, page) {
    return page.evaluate((candidateSelectors) => {
        const ordered = [];
        const seen = new Set();
        for (const selector of candidateSelectors) {
            for (const node of Array.from(document.querySelectorAll(selector))) {
                const text = (node.textContent || "").trim();
                if (!text)
                    continue;
                const element = node;
                const fingerprint = `${selector}:${text}`;
                if (seen.has(fingerprint))
                    continue;
                seen.add(fingerprint);
                const descriptor = `${element.className} ${element.getAttribute("aria-label") || ""}`;
                const role = /user|client|you|tester/i.test(descriptor) ? "user" : "assistant";
                ordered.push({ role, text });
            }
        }
        return ordered;
    }, selectors);
}
function extractNetworkTranscript(networkEvents) {
    const ordered = [];
    for (const event of networkEvents) {
        const bodyText = typeof event.bodyText === "string" ? event.bodyText : "";
        if (!bodyText)
            continue;
        try {
            const parsed = JSON.parse(bodyText);
            const candidates = Array.isArray(parsed?.messages)
                ? parsed.messages
                : Array.isArray(parsed?.conversation)
                    ? parsed.conversation
                    : [];
            for (const candidate of candidates) {
                if (!candidate)
                    continue;
                const role = /user|client|you/i.test(String(candidate.role || ""))
                    ? "user"
                    : "assistant";
                const text = String(candidate.content || candidate.text || "").trim();
                if (text)
                    ordered.push({ role, text });
            }
        }
        catch {
            continue;
        }
    }
    return ordered;
}
class ChatTranscriptExtractor {
    supports(config) {
        return config.kind === "chat_transcript";
    }
    async run(config, context) {
        let domMessages = [];
        let networkMessages = [];
        if (config.sourcePriority.includes("dom")) {
            domMessages = await extractDomTranscript(config.selectors, context.page);
        }
        if (config.sourcePriority.includes("network")) {
            networkMessages = extractNetworkTranscript(context.networkEvents);
        }
        const merged = domMessages.length >= networkMessages.length ? domMessages : networkMessages;
        if (merged.length === 0)
            return null;
        const turns = [];
        let pendingUser = "";
        let turn = 1;
        for (const message of merged) {
            if (message.role === "user") {
                pendingUser = message.text;
            }
            else if (pendingUser) {
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
        const source = domMessages.length > 0 && networkMessages.length > 0
            ? "hybrid"
            : domMessages.length > 0
                ? "dom"
                : "network";
        fs_1.default.writeFileSync(`${context.extractsRoot}/${config.id}.json`, JSON.stringify(turns, null, 2), "utf8");
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
exports.ChatTranscriptExtractor = ChatTranscriptExtractor;
exports.default = ChatTranscriptExtractor;
