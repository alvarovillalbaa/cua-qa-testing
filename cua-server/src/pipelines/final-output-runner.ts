import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import OpenAI from "openai";
import { mkdirSync } from "fs";
import { RunRecorder } from "../lib/run-recorder";
import { WorkspaceDocument } from "../lib/workspace-types";
import { getRepoRoot, getResultsRoot } from "../lib/workspace-paths";
import {
  prepareOpenAIFileInputs,
  sanitizeResponseInput,
} from "../lib/openai-file-utils";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function interpolate(text: string, variables: Record<string, string>) {
  return text.replace(/\{\{(.*?)\}\}/g, (_, key) => variables[key.trim()] || "");
}

function parseJsonSchema(maybeSchema: string) {
  try {
    const parsed = JSON.parse(maybeSchema);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function summarizeDataset(filePath: string) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  return workbook.SheetNames.map((sheetName) => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName],
      { defval: "" }
    );
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

function normalizeRowsForTabularOutput(finalOutput: unknown) {
  if (Array.isArray(finalOutput)) return finalOutput;
  if (
    finalOutput &&
    typeof finalOutput === "object" &&
    Array.isArray((finalOutput as { rows?: unknown[] }).rows)
  ) {
    return (finalOutput as { rows: unknown[] }).rows;
  }
  if (
    finalOutput &&
    typeof finalOutput === "object" &&
    Array.isArray((finalOutput as { data?: unknown[] }).data)
  ) {
    return (finalOutput as { data: unknown[] }).data;
  }
  return null;
}

function writeOutputTarget(targetPath: string, finalOutput: unknown) {
  const rows = normalizeRowsForTabularOutput(finalOutput);

  if (/\.(xlsx)$/i.test(targetPath) && rows) {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows as Record<string, unknown>[]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Results");
    XLSX.writeFile(workbook, targetPath);
    return;
  }

  if (/\.(csv)$/i.test(targetPath) && rows) {
    const sheet = XLSX.utils.json_to_sheet(rows as Record<string, unknown>[]);
    const csv = XLSX.utils.sheet_to_csv(sheet);
    fs.writeFileSync(targetPath, csv, "utf8");
    return;
  }

  fs.writeFileSync(
    targetPath,
    typeof finalOutput === "string"
      ? finalOutput
      : JSON.stringify(finalOutput, null, 2),
    "utf8"
  );
}

function collectDatasetSummaries(workspace: WorkspaceDocument) {
  const repoRoot = getRepoRoot();
  const assets = workspace.testCase.assets.filter((asset) =>
    /\.(csv|xlsx)$/i.test(asset.name)
  );

  return assets.map((asset) => {
    try {
      return {
        assetId: asset.id,
        name: asset.name,
        relativePath: asset.relativePath,
        sheets: summarizeDataset(path.join(repoRoot, asset.relativePath)),
      };
    } catch (error) {
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

export async function runFinalOutputPipeline(
  workspace: WorkspaceDocument,
  runRecorder: RunRecorder,
  evaluatorResults: unknown[],
  learningContext: { autoSpl: string }
) {
  const resultsRoot = getResultsRoot(workspace.project.id, runRecorder.getRunId());
  mkdirSync(resultsRoot, { recursive: true });

  const datasetSummaries = collectDatasetSummaries(workspace);
  fs.writeFileSync(
    `${resultsRoot}/dataset-summaries.json`,
    JSON.stringify(datasetSummaries, null, 2),
    "utf8"
  );

  const fallback = {
    verdict: runRecorder.getStatus(),
    summary:
      runRecorder.getStatus() === "fail"
        ? runRecorder.getErrorInfo() || "Run failed."
        : "Run finished. Review evaluator results and transcript for details.",
    transcript: runRecorder.getTranscript(),
    evaluators: evaluatorResults,
    datasets: datasetSummaries,
    learning_context: learningContext.autoSpl,
  };

  let finalOutput: unknown = fallback;
  const schema = parseJsonSchema(workspace.testCase.output.responseFormat);

  if (process.env.OPENAI_API_KEY) {
    try {
      const { refs, inputFiles } = await prepareOpenAIFileInputs(workspace);
      if (refs.length > 0) {
        runRecorder.recordOpenAIFileRefs("final_output", refs);
      }
      const variables = {
        website: workspace.runDefaults.website,
        response_format: workspace.testCase.output.responseFormat,
        personalization: workspace.testCase.prompts.personalization,
        test_description: workspace.testCase.testDescription,
        additional_context:
          workspace.runDefaults.additionalContextOverride ||
          workspace.testCase.additionalContext,
        spl: learningContext.autoSpl || workspace.testCase.prompts.spl,
      };
      const response = await openai.responses.create({
        model: process.env.CUA_MODEL || "gpt-5.4",
        input: sanitizeResponseInput([
          {
            role: "system",
            content: [
              workspace.testCase.prompts.shared,
              workspace.testCase.prompts.postprocessing,
              ...workspace.testCase.messages.system.map((message) =>
                interpolate(message.content, variables)
              ),
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
                  ...workspace.testCase.messages.user.map((message) =>
                    interpolate(message.content, variables)
                  ),
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
                  type: "json_schema" as const,
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
    } catch {
      finalOutput = fallback;
    }
  }

  fs.writeFileSync(
    `${resultsRoot}/final-output.json`,
    JSON.stringify(finalOutput, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    `${resultsRoot}/results.json`,
    JSON.stringify(
      {
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
      },
      null,
      2
    ),
    "utf8"
  );

  for (const target of workspace.testCase.output.fileTargets) {
    const targetPath = path.join(getRepoRoot(), target);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    writeOutputTarget(targetPath, finalOutput);
  }

  return {
    datasetSummaries,
    finalOutput,
    outputPath: `${resultsRoot}/final-output.json`,
  };
}
