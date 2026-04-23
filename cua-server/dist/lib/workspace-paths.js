"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRepoRoot = getRepoRoot;
exports.getWorkspaceRoot = getWorkspaceRoot;
exports.getProjectRoot = getProjectRoot;
exports.getRunRoot = getRunRoot;
exports.getArtifactsRoot = getArtifactsRoot;
exports.getExtractsRoot = getExtractsRoot;
exports.getEvaluatorsRoot = getEvaluatorsRoot;
exports.getResultsRoot = getResultsRoot;
exports.getLearningRoot = getLearningRoot;
exports.getTracePath = getTracePath;
exports.getPublicResultsRoot = getPublicResultsRoot;
const path_1 = __importDefault(require("path"));
function getRepoRoot() {
    return path_1.default.join(process.cwd(), "..");
}
function getWorkspaceRoot() {
    return path_1.default.join(getRepoRoot(), "workspace-data");
}
function getProjectRoot(projectId) {
    return path_1.default.join(getWorkspaceRoot(), "projects", projectId);
}
function getRunRoot(projectId, runId) {
    return path_1.default.join(getProjectRoot(projectId), "test-runs", runId);
}
function getArtifactsRoot(projectId, runId) {
    return path_1.default.join(getRunRoot(projectId, runId), "artifacts");
}
function getExtractsRoot(projectId, runId) {
    return path_1.default.join(getRunRoot(projectId, runId), "extracts");
}
function getEvaluatorsRoot(projectId, runId) {
    return path_1.default.join(getRunRoot(projectId, runId), "evaluators");
}
function getResultsRoot(projectId, runId) {
    return path_1.default.join(getRunRoot(projectId, runId), "results");
}
function getLearningRoot(projectId) {
    return path_1.default.join(getProjectRoot(projectId), "learning");
}
function getTracePath(projectId, runId) {
    return path_1.default.join(getArtifactsRoot(projectId, runId), "playwright-trace.zip");
}
function getPublicResultsRoot(runId) {
    return path_1.default.join(getRepoRoot(), "frontend", "public", "test_results", runId);
}
