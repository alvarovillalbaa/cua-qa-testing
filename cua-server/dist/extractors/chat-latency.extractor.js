"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatLatencyExtractor = void 0;
const fs_1 = __importDefault(require("fs"));
function readEvents(eventsPath) {
    try {
        return fs_1.default
            .readFileSync(eventsPath, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    }
    catch {
        return [];
    }
}
class ChatLatencyExtractor {
    supports(config) {
        return config.kind === "chat_latency";
    }
    async run(config, context) {
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
                latency_ms: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
            };
        });
        fs_1.default.writeFileSync(`${context.extractsRoot}/${config.id}.json`, JSON.stringify(output, null, 2), "utf8");
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
exports.ChatLatencyExtractor = ChatLatencyExtractor;
exports.default = ChatLatencyExtractor;
