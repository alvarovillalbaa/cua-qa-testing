import fs from "fs";
import { mkdirSync } from "fs";
import { RunRecorder } from "../lib/run-recorder";
import { WorkspaceDocument } from "../lib/workspace-types";
import { getLearningRoot } from "../lib/workspace-paths";

function derivePatterns(
  runRecorder: RunRecorder,
  evaluatorResults: any[]
): string[] {
  const patterns: string[] = [];
  if (runRecorder.getStatus() === "fail") {
    patterns.push(
      `Runtime failure: ${runRecorder.getErrorInfo() || "unknown failure"}`
    );
  }
  if (runRecorder.getTranscript().length === 0) {
    patterns.push("No transcript turns extracted. Prefer stronger DOM/network selectors.");
  }
  const failedEvaluators = evaluatorResults.filter(
    (result) => result?.status === "fail"
  );
  if (failedEvaluators.length > 0) {
    patterns.push(
      `Failed evaluators: ${failedEvaluators.map((item) => item.name).join(", ")}`
    );
  }
  const latestAction = runRecorder.getCurrentAction();
  if (latestAction) {
    patterns.push(`Last recorded action: ${latestAction}`);
  }
  return patterns;
}

export function loadLearningContext(projectId: string) {
  const learningRoot = getLearningRoot(projectId);
  const patternsPath = `${learningRoot}/patterns.json`;
  const splPath = `${learningRoot}/spl.auto.md`;
  let autoSpl = "";
  let topPatterns: string[] = [];
  let lastUpdated: string | null = null;

  try {
    const patterns = JSON.parse(fs.readFileSync(patternsPath, "utf8")) as {
      lastUpdated: string;
      patterns: string[];
    };
    topPatterns = patterns.patterns.slice(0, 5);
    lastUpdated = patterns.lastUpdated;
  } catch {
    // noop
  }

  try {
    autoSpl = fs.readFileSync(splPath, "utf8");
  } catch {
    autoSpl = "";
  }

  return {
    lastUpdated,
    topPatterns,
    autoSpl,
  };
}

export async function runLearningLoop(
  workspace: WorkspaceDocument,
  runRecorder: RunRecorder,
  evaluatorResults: any[]
) {
  const learningRoot = getLearningRoot(workspace.project.id);
  mkdirSync(learningRoot, { recursive: true });
  const patterns = derivePatterns(runRecorder, evaluatorResults);
  const payload = {
    lastUpdated: new Date().toISOString(),
    patterns,
    transcriptTurns: runRecorder.getTranscript().length,
    status: runRecorder.getStatus(),
  };

  fs.writeFileSync(
    `${learningRoot}/run-${runRecorder.getRunId()}.json`,
    JSON.stringify(payload, null, 2),
    "utf8"
  );

  let aggregatePatterns = patterns;
  try {
    const existing = JSON.parse(
      fs.readFileSync(`${learningRoot}/patterns.json`, "utf8")
    ) as { patterns: string[] };
    aggregatePatterns = Array.from(new Set([...patterns, ...existing.patterns])).slice(
      0,
      20
    );
  } catch {
    aggregatePatterns = patterns;
  }

  fs.writeFileSync(
    `${learningRoot}/patterns.json`,
    JSON.stringify(
      {
        lastUpdated: payload.lastUpdated,
        patterns: aggregatePatterns,
      },
      null,
      2
    ),
    "utf8"
  );

  const autoSpl = [
    "Autoresearch-derived testing memory:",
    ...aggregatePatterns.map((pattern) => `- ${pattern}`),
  ].join("\n");
  fs.writeFileSync(`${learningRoot}/spl.auto.md`, autoSpl, "utf8");

  return {
    lastUpdated: payload.lastUpdated,
    topPatterns: aggregatePatterns.slice(0, 5),
    autoSpl,
  };
}
