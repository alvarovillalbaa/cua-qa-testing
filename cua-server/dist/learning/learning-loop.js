"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadLearningContext = loadLearningContext;
exports.runLearningLoop = runLearningLoop;
const fs_1 = __importDefault(require("fs"));
const fs_2 = require("fs");
const workspace_paths_1 = require("../lib/workspace-paths");
function derivePatterns(runRecorder, evaluatorResults) {
    const patterns = [];
    if (runRecorder.getStatus() === "fail") {
        patterns.push(`Runtime failure: ${runRecorder.getErrorInfo() || "unknown failure"}`);
    }
    if (runRecorder.getTranscript().length === 0) {
        patterns.push("No transcript turns extracted. Prefer stronger DOM/network selectors.");
    }
    const failedEvaluators = evaluatorResults.filter((result) => result?.status === "fail");
    if (failedEvaluators.length > 0) {
        patterns.push(`Failed evaluators: ${failedEvaluators.map((item) => item.name).join(", ")}`);
    }
    const latestAction = runRecorder.getCurrentAction();
    if (latestAction) {
        patterns.push(`Last recorded action: ${latestAction}`);
    }
    return patterns;
}
function loadLearningContext(projectId) {
    const learningRoot = (0, workspace_paths_1.getLearningRoot)(projectId);
    const patternsPath = `${learningRoot}/patterns.json`;
    const splPath = `${learningRoot}/spl.auto.md`;
    let autoSpl = "";
    let topPatterns = [];
    let lastUpdated = null;
    try {
        const patterns = JSON.parse(fs_1.default.readFileSync(patternsPath, "utf8"));
        topPatterns = patterns.patterns.slice(0, 5);
        lastUpdated = patterns.lastUpdated;
    }
    catch {
        // noop
    }
    try {
        autoSpl = fs_1.default.readFileSync(splPath, "utf8");
    }
    catch {
        autoSpl = "";
    }
    return {
        lastUpdated,
        topPatterns,
        autoSpl,
    };
}
async function runLearningLoop(workspace, runRecorder, evaluatorResults) {
    const learningRoot = (0, workspace_paths_1.getLearningRoot)(workspace.project.id);
    (0, fs_2.mkdirSync)(learningRoot, { recursive: true });
    const patterns = derivePatterns(runRecorder, evaluatorResults);
    const payload = {
        lastUpdated: new Date().toISOString(),
        patterns,
        transcriptTurns: runRecorder.getTranscript().length,
        status: runRecorder.getStatus(),
    };
    fs_1.default.writeFileSync(`${learningRoot}/run-${runRecorder.getRunId()}.json`, JSON.stringify(payload, null, 2), "utf8");
    let aggregatePatterns = patterns;
    try {
        const existing = JSON.parse(fs_1.default.readFileSync(`${learningRoot}/patterns.json`, "utf8"));
        aggregatePatterns = Array.from(new Set([...patterns, ...existing.patterns])).slice(0, 20);
    }
    catch {
        aggregatePatterns = patterns;
    }
    fs_1.default.writeFileSync(`${learningRoot}/patterns.json`, JSON.stringify({
        lastUpdated: payload.lastUpdated,
        patterns: aggregatePatterns,
    }, null, 2), "utf8");
    const autoSpl = [
        "Autoresearch-derived testing memory:",
        ...aggregatePatterns.map((pattern) => `- ${pattern}`),
    ].join("\n");
    fs_1.default.writeFileSync(`${learningRoot}/spl.auto.md`, autoSpl, "utf8");
    return {
        lastUpdated: payload.lastUpdated,
        topPatterns: aggregatePatterns.slice(0, 5),
        autoSpl,
    };
}
