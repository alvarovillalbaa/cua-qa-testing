import path from "path";

export function getRepoRoot() {
  return path.join(process.cwd(), "..");
}

export function getWorkspaceRoot() {
  return path.join(getRepoRoot(), "workspace-data");
}

export function getProjectRoot(projectId: string) {
  return path.join(getWorkspaceRoot(), "projects", projectId);
}

export function getRunRoot(projectId: string, runId: string) {
  return path.join(getProjectRoot(projectId), "test-runs", runId);
}

export function getArtifactsRoot(projectId: string, runId: string) {
  return path.join(getRunRoot(projectId, runId), "artifacts");
}

export function getExtractsRoot(projectId: string, runId: string) {
  return path.join(getRunRoot(projectId, runId), "extracts");
}

export function getEvaluatorsRoot(projectId: string, runId: string) {
  return path.join(getRunRoot(projectId, runId), "evaluators");
}

export function getResultsRoot(projectId: string, runId: string) {
  return path.join(getRunRoot(projectId, runId), "results");
}

export function getLearningRoot(projectId: string) {
  return path.join(getProjectRoot(projectId), "learning");
}

export function getTracePath(projectId: string, runId: string) {
  return path.join(getArtifactsRoot(projectId, runId), "playwright-trace.zip");
}

export function getPublicResultsRoot(runId: string) {
  return path.join(getRepoRoot(), "frontend", "public", "test_results", runId);
}
