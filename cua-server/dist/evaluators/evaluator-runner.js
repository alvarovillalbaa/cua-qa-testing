"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEvaluators = runEvaluators;
const fs_1 = __importDefault(require("fs"));
const openai_1 = __importDefault(require("openai"));
const fs_2 = require("fs");
const workspace_paths_1 = require("../lib/workspace-paths");
const openai_file_utils_1 = require("../lib/openai-file-utils");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
function interpolate(text, variables) {
    return text.replace(/\{\{(.*?)\}\}/g, (_, key) => variables[key.trim()] || "");
}
function getEnabledMetrics(workspace) {
    const metrics = workspace.testCase.metrics.filter((metric) => metric.enabled);
    if (metrics.length > 0)
        return metrics;
    return [
        {
            id: "default-evaluator",
            name: "Default evaluator",
            description: workspace.testCase.testDescription,
            systemPrompt: workspace.testCase.testDescription,
            enabled: true,
        },
    ];
}
async function runOneEvaluator(workspace, metric, runRecorder, learningContext) {
    const variables = {
        metric_name: metric.name,
        test_description: workspace.testCase.testDescription,
        additional_context: workspace.runDefaults.additionalContextOverride ||
            workspace.testCase.additionalContext,
        spl: learningContext.autoSpl || workspace.testCase.prompts.spl,
        personalization: workspace.testCase.prompts.personalization,
        response_format: workspace.testCase.output.responseFormat,
        website: workspace.runDefaults.website,
        run_status: runRecorder.getStatus(),
        transcript: JSON.stringify(runRecorder.getTranscript(), null, 2),
        current_action: runRecorder.getCurrentAction() || "",
        error_info: runRecorder.getErrorInfo() || "",
    };
    const systemParts = [
        workspace.testCase.prompts.shared,
        workspace.runDefaults.loginRequired
            ? workspace.testCase.prompts.loginOverlay
            : "",
        metric.systemPrompt,
        ...workspace.testCase.messages.system.map((message) => interpolate(message.content, variables)),
    ].filter(Boolean);
    const userParts = [
        ...workspace.testCase.messages.user.map((message) => interpolate(message.content, variables)),
        `Thresholds: ${JSON.stringify(workspace.testCase.thresholds, null, 2)}`,
        `Extractor results: ${JSON.stringify(runRecorder.getExtractorResults(), null, 2)}`,
        `Structured transcript: ${JSON.stringify(runRecorder.getTranscript(), null, 2)}`,
    ].filter(Boolean);
    const fallback = {
        id: metric.id,
        evaluator_id: metric.id,
        name: metric.name,
        status: runRecorder.getStatus() === "fail" ? "fail" : "pass",
        verdict: runRecorder.getStatus() === "fail" ? "fail" : "pass",
        score: runRecorder.getStatus() === "fail" ? 0 : 1,
        summary: runRecorder.getStatus() === "fail"
            ? runRecorder.getErrorInfo() || "Run failed."
            : "Run completed without runtime failure.",
        evidence: {
            transcript_turns: runRecorder.getTranscript().length,
            current_action: runRecorder.getCurrentAction(),
        },
    };
    if (!process.env.OPENAI_API_KEY) {
        return fallback;
    }
    try {
        const { refs, inputFiles } = await (0, openai_file_utils_1.prepareOpenAIFileInputs)(workspace);
        if (refs.length > 0) {
            runRecorder.recordOpenAIFileRefs(`evaluator:${metric.id}`, refs);
        }
        const response = await openai.responses.create({
            model: process.env.CUA_MODEL || "gpt-5.4",
            input: (0, openai_file_utils_1.sanitizeResponseInput)([
                {
                    role: "system",
                    content: systemParts.join("\n\n"),
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: userParts.join("\n\n"),
                        },
                        ...inputFiles,
                    ],
                },
            ]),
            text: {
                format: {
                    type: "json_schema",
                    name: "evaluator_result",
                    schema: {
                        type: "object",
                        properties: {
                            evaluator_id: { type: "string" },
                            id: { type: "string" },
                            name: { type: "string" },
                            status: { type: "string", enum: ["pass", "fail"] },
                            verdict: { type: "string" },
                            score: { type: "number" },
                            summary: { type: "string" },
                            evidence: { type: "object", additionalProperties: true },
                        },
                        required: [
                            "evaluator_id",
                            "id",
                            "name",
                            "status",
                            "verdict",
                            "score",
                            "summary",
                            "evidence",
                        ],
                        additionalProperties: false,
                    },
                },
            },
        });
        const parsed = JSON.parse(response.output_text || JSON.stringify(fallback));
        return {
            ...parsed,
            id: parsed.id || parsed.evaluator_id || metric.id,
            evaluator_id: parsed.evaluator_id || parsed.id || metric.id,
        };
    }
    catch {
        return fallback;
    }
}
async function runEvaluators(workspace, runRecorder, learningContext) {
    const evaluatorsRoot = (0, workspace_paths_1.getEvaluatorsRoot)(workspace.project.id, runRecorder.getRunId());
    (0, fs_2.mkdirSync)(evaluatorsRoot, { recursive: true });
    const metrics = getEnabledMetrics(workspace);
    const results = await Promise.all(metrics.map((metric) => runOneEvaluator(workspace, metric, runRecorder, learningContext)));
    for (const result of results) {
        fs_1.default.writeFileSync(`${evaluatorsRoot}/${result.evaluator_id}.json`, JSON.stringify(result, null, 2), "utf8");
    }
    return results;
}
