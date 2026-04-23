"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFinalOutputPipeline = runFinalOutputPipeline;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const xlsx_1 = __importDefault(require("xlsx"));
const openai_1 = __importDefault(require("openai"));
const fs_2 = require("fs");
const workspace_paths_1 = require("../lib/workspace-paths");
const openai_file_utils_1 = require("../lib/openai-file-utils");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
function interpolate(text, variables) {
    return text.replace(/\{\{(.*?)\}\}/g, (_, key) => variables[key.trim()] || "");
}
function parseJsonSchema(maybeSchema) {
    try {
        const parsed = JSON.parse(maybeSchema);
        return parsed && typeof parsed === "object" ? parsed : null;
    }
    catch {
        return null;
    }
}
function summarizeDataset(filePath) {
    const workbook = xlsx_1.default.readFile(filePath, { cellDates: true });
    return workbook.SheetNames.map((sheetName) => {
        const rows = xlsx_1.default.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
        const sampleRows = rows.slice(0, 3);
        const columns = sampleRows.length > 0 ? Object.keys(sampleRows[0]) : [];
        return {
            sheetName,
            columns,
            sampleRows,
            rowCount: rows.length,
        };
    });
}
function normalizeRowsForTabularOutput(finalOutput) {
    if (Array.isArray(finalOutput))
        return finalOutput;
    if (finalOutput &&
        typeof finalOutput === "object" &&
        Array.isArray(finalOutput.rows)) {
        return finalOutput.rows;
    }
    if (finalOutput &&
        typeof finalOutput === "object" &&
        Array.isArray(finalOutput.data)) {
        return finalOutput.data;
    }
    return null;
}
function writeOutputTarget(targetPath, finalOutput) {
    const rows = normalizeRowsForTabularOutput(finalOutput);
    if (/\.(xlsx)$/i.test(targetPath) && rows) {
        const workbook = xlsx_1.default.utils.book_new();
        const sheet = xlsx_1.default.utils.json_to_sheet(rows);
        xlsx_1.default.utils.book_append_sheet(workbook, sheet, "Results");
        xlsx_1.default.writeFile(workbook, targetPath);
        return;
    }
    if (/\.(csv)$/i.test(targetPath) && rows) {
        const sheet = xlsx_1.default.utils.json_to_sheet(rows);
        const csv = xlsx_1.default.utils.sheet_to_csv(sheet);
        fs_1.default.writeFileSync(targetPath, csv, "utf8");
        return;
    }
    fs_1.default.writeFileSync(targetPath, typeof finalOutput === "string"
        ? finalOutput
        : JSON.stringify(finalOutput, null, 2), "utf8");
}
function collectDatasetSummaries(workspace) {
    const repoRoot = (0, workspace_paths_1.getRepoRoot)();
    const assets = workspace.testCase.assets.filter((asset) => /\.(csv|xlsx)$/i.test(asset.name));
    return assets.map((asset) => {
        try {
            return {
                assetId: asset.id,
                name: asset.name,
                relativePath: asset.relativePath,
                sheets: summarizeDataset(path_1.default.join(repoRoot, asset.relativePath)),
            };
        }
        catch (error) {
            return {
                assetId: asset.id,
                name: asset.name,
                relativePath: asset.relativePath,
                error: String(error),
                sheets: [],
            };
        }
    });
}
async function runFinalOutputPipeline(workspace, runRecorder, evaluatorResults, learningContext) {
    const resultsRoot = (0, workspace_paths_1.getResultsRoot)(workspace.project.id, runRecorder.getRunId());
    (0, fs_2.mkdirSync)(resultsRoot, { recursive: true });
    const datasetSummaries = collectDatasetSummaries(workspace);
    fs_1.default.writeFileSync(`${resultsRoot}/dataset-summaries.json`, JSON.stringify(datasetSummaries, null, 2), "utf8");
    const fallback = {
        verdict: runRecorder.getStatus(),
        summary: runRecorder.getStatus() === "fail"
            ? runRecorder.getErrorInfo() || "Run failed."
            : "Run finished. Review evaluator results and transcript for details.",
        transcript: runRecorder.getTranscript(),
        evaluators: evaluatorResults,
        datasets: datasetSummaries,
        learning_context: learningContext.autoSpl,
    };
    let finalOutput = fallback;
    const schema = parseJsonSchema(workspace.testCase.output.responseFormat);
    if (process.env.OPENAI_API_KEY) {
        try {
            const { refs, inputFiles } = await (0, openai_file_utils_1.prepareOpenAIFileInputs)(workspace);
            if (refs.length > 0) {
                runRecorder.recordOpenAIFileRefs("final_output", refs);
            }
            const variables = {
                website: workspace.runDefaults.website,
                response_format: workspace.testCase.output.responseFormat,
                personalization: workspace.testCase.prompts.personalization,
                test_description: workspace.testCase.testDescription,
                additional_context: workspace.runDefaults.additionalContextOverride ||
                    workspace.testCase.additionalContext,
                spl: learningContext.autoSpl || workspace.testCase.prompts.spl,
            };
            const response = await openai.responses.create({
                model: process.env.CUA_MODEL || "gpt-5.4",
                input: (0, openai_file_utils_1.sanitizeResponseInput)([
                    {
                        role: "system",
                        content: [
                            workspace.testCase.prompts.shared,
                            workspace.testCase.prompts.postprocessing,
                            ...workspace.testCase.messages.system.map((message) => interpolate(message.content, variables)),
                        ]
                            .filter(Boolean)
                            .join("\n\n"),
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_text",
                                text: [
                                    ...workspace.testCase.messages.user.map((message) => interpolate(message.content, variables)),
                                    `Run status: ${runRecorder.getStatus()}`,
                                    `Run transcript: ${JSON.stringify(runRecorder.getTranscript(), null, 2)}`,
                                    `Captured data: ${JSON.stringify(runRecorder.getCapturedData(), null, 2)}`,
                                    `Evaluator results: ${JSON.stringify(evaluatorResults, null, 2)}`,
                                    `Dataset summaries: ${JSON.stringify(datasetSummaries, null, 2)}`,
                                    `Output instructions: ${workspace.runDefaults.outputInstructions}`,
                                    `Learning context: ${learningContext.autoSpl}`,
                                ].join("\n\n"),
                            },
                            ...inputFiles,
                        ],
                    },
                ]),
                ...(schema
                    ? {
                        text: {
                            format: {
                                type: "json_schema",
                                name: "final_output",
                                schema,
                            },
                        },
                    }
                    : {}),
            });
            finalOutput = schema
                ? JSON.parse(response.output_text || JSON.stringify(fallback))
                : response.output_text || fallback;
        }
        catch {
            finalOutput = fallback;
        }
    }
    fs_1.default.writeFileSync(`${resultsRoot}/final-output.json`, JSON.stringify(finalOutput, null, 2), "utf8");
    fs_1.default.writeFileSync(`${resultsRoot}/results.json`, JSON.stringify({
        run_id: runRecorder.getRunId(),
        status: runRecorder.getStatus(),
        summary: fallback.summary,
        structured_results: {
            transcript: runRecorder.getTranscript(),
            captured_data: runRecorder.getCapturedData(),
            evaluators: evaluatorResults,
            final_output: finalOutput,
            datasets: datasetSummaries,
        },
    }, null, 2), "utf8");
    for (const target of workspace.testCase.output.fileTargets) {
        const targetPath = path_1.default.join((0, workspace_paths_1.getRepoRoot)(), target);
        fs_1.default.mkdirSync(path_1.default.dirname(targetPath), { recursive: true });
        writeOutputTarget(targetPath, finalOutput);
    }
    return {
        datasetSummaries,
        finalOutput,
        outputPath: `${resultsRoot}/final-output.json`,
    };
}
