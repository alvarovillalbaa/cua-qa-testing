import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { parse as parseEnv } from "dotenv";
import type {
  AnalyticsSummary,
  LearningSummary,
  ProjectListItem,
  RunSummary,
  SaveWorkspaceResponse,
  TestCaseListItem,
  WorkspaceAsset,
  WorkspaceDocument,
  WorkspaceFilter,
  WorkspacePayload,
  WorkspaceSelection,
} from "@/lib/workspace-types";
import {
  createDefaultWorkspace,
  DEFAULT_PROJECT_ID,
  DEFAULT_TEST_CASE_ID,
} from "@/lib/server/workspace-defaults";

const REPO_ROOT = path.join(process.cwd(), "..");
const WORKSPACE_ROOT = path.join(REPO_ROOT, "workspace-data");
const CUA_ENV_PATH = path.join(REPO_ROOT, "cua-server", ".env.development");

function getProjectRoot(projectId: string) {
  return path.join(WORKSPACE_ROOT, "projects", projectId);
}

function getTestCaseRoot(projectId: string, testCaseId: string) {
  return path.join(getProjectRoot(projectId), "test-cases", testCaseId);
}

function getPromptsRoot(projectId: string, testCaseId: string) {
  return path.join(getTestCaseRoot(projectId, testCaseId), "prompts");
}

function getContentRoot(projectId: string, testCaseId: string) {
  return path.join(getTestCaseRoot(projectId, testCaseId), "content");
}

function getAssetsRoot(projectId: string, testCaseId: string) {
  return path.join(getTestCaseRoot(projectId, testCaseId), "assets");
}

function getRunsRoot(projectId: string) {
  return path.join(getProjectRoot(projectId), "test-runs");
}

function getMarkdownFields(projectId: string, testCaseId: string) {
  const promptsRoot = getPromptsRoot(projectId, testCaseId);
  const contentRoot = getContentRoot(projectId, testCaseId);
  return {
    testDescription: path.join(contentRoot, "test-description.md"),
    additionalContext: path.join(contentRoot, "additional-context.md"),
    teamCollaboration: path.join(contentRoot, "team-collaboration.md"),
    sharedPrompt: path.join(promptsRoot, "shared.md"),
    loginOverlayPrompt: path.join(promptsRoot, "login-overlay.md"),
    preprocessingPrompt: path.join(promptsRoot, "preprocessing.md"),
    postprocessingPrompt: path.join(promptsRoot, "postprocessing.md"),
    splPrompt: path.join(promptsRoot, "spl.md"),
    personalizationPrompt: path.join(promptsRoot, "personalization.md"),
    responseFormat: path.join(contentRoot, "response-format.json"),
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeSelection(
  selection?: Partial<WorkspaceSelection>
): WorkspaceSelection {
  return {
    projectId: selection?.projectId || DEFAULT_PROJECT_ID,
    testCaseId: selection?.testCaseId || DEFAULT_TEST_CASE_ID,
  };
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(targetPath: string) {
  await mkdir(targetPath, { recursive: true });
}

async function readTextOrEmpty(targetPath: string) {
  try {
    return await readFile(targetPath, "utf8");
  } catch {
    return "";
  }
}

async function writeJson(targetPath: string, value: unknown) {
  await writeFile(targetPath, JSON.stringify(value, null, 2), "utf8");
}

async function readJson<T>(targetPath: string): Promise<T> {
  return JSON.parse(await readFile(targetPath, "utf8")) as T;
}

async function loadEnvFile() {
  try {
    return parseEnv(await readFile(CUA_ENV_PATH, "utf8"));
  } catch {
    return {} as Record<string, string>;
  }
}

async function writeEnvFile(values: Record<string, string>) {
  const keys = Object.keys(values).sort();
  const serialized = `${keys
    .map((key) => `${key}=${JSON.stringify(values[key] ?? "")}`)
    .join("\n")}\n`;
  await writeFile(CUA_ENV_PATH, serialized, "utf8");
}

function buildAnalytics(runs: RunSummary[]): AnalyticsSummary {
  const totalRuns = runs.length;
  const passRuns = runs.filter((run) => run.status === "pass").length;
  const failRuns = runs.filter((run) => run.status === "fail").length;
  const runningRuns = runs.filter((run) => run.status === "running").length;
  const averageTranscriptTurns =
    totalRuns === 0
      ? 0
      : Number(
          (
            runs.reduce((sum, run) => sum + run.transcriptTurnCount, 0) / totalRuns
          ).toFixed(2)
        );

  const metricMap = new Map<
    string,
    { metricName: string; passCount: number; failCount: number }
  >();

  runs.forEach((run) => {
    run.metricIds.forEach((metricId, index) => {
      const entry = metricMap.get(metricId) || {
        metricName: run.metricNames[index] || metricId,
        passCount: 0,
        failCount: 0,
      };
      if (run.status === "pass") entry.passCount += 1;
      if (run.status === "fail") entry.failCount += 1;
      metricMap.set(metricId, entry);
    });
  });

  return {
    totalRuns,
    passRuns,
    failRuns,
    runningRuns,
    averageTranscriptTurns,
    metricBreakdown: Array.from(metricMap.entries()).map(([metricId, value]) => ({
      metricId,
      metricName: value.metricName,
      passCount: value.passCount,
      failCount: value.failCount,
    })),
  };
}

async function loadLearningSummary(projectId: string): Promise<LearningSummary> {
  const learningRoot = path.join(getProjectRoot(projectId), "learning");
  const patternsPath = path.join(learningRoot, "patterns.json");
  const autoSplPath = path.join(learningRoot, "spl.auto.md");

  let lastUpdated: string | null = null;
  let topPatterns: string[] = [];
  let autoSpl = "";

  try {
    const patternsJson = JSON.parse(await readFile(patternsPath, "utf8")) as {
      lastUpdated?: string;
      patterns?: string[];
    };
    lastUpdated = patternsJson.lastUpdated || null;
    topPatterns = Array.isArray(patternsJson.patterns)
      ? patternsJson.patterns.slice(0, 5)
      : [];
  } catch {
    // noop
  }

  try {
    autoSpl = await readFile(autoSplPath, "utf8");
  } catch {
    autoSpl = "";
  }

  return {
    lastUpdated,
    topPatterns,
    autoSpl,
  };
}

async function ensureProjectTestCaseBootstrapped(selection?: Partial<WorkspaceSelection>) {
  const { projectId, testCaseId } = normalizeSelection(selection);
  const projectRoot = getProjectRoot(projectId);
  const testCaseRoot = getTestCaseRoot(projectId, testCaseId);
  const promptsRoot = getPromptsRoot(projectId, testCaseId);
  const contentRoot = getContentRoot(projectId, testCaseId);
  const assetsRoot = getAssetsRoot(projectId, testCaseId);
  const runsRoot = getRunsRoot(projectId);
  const markdownFields = getMarkdownFields(projectId, testCaseId);

  await ensureDir(projectRoot);
  await ensureDir(testCaseRoot);
  await ensureDir(promptsRoot);
  await ensureDir(contentRoot);
  await ensureDir(assetsRoot);
  await ensureDir(runsRoot);

  const projectJsonPath = path.join(projectRoot, "project.json");
  const testCaseJsonPath = path.join(testCaseRoot, "test-case.json");
  const runDefaultsPath = path.join(testCaseRoot, "run-defaults.json");

  if (
    (await pathExists(projectJsonPath)) &&
    (await pathExists(testCaseJsonPath)) &&
    (await pathExists(runDefaultsPath))
  ) {
    return normalizeSelection(selection);
  }

  const defaults = createDefaultWorkspace({
    projectId,
    testCaseId,
  });

  await writeJson(projectJsonPath, defaults.project);
  await writeJson(testCaseJsonPath, {
    id: defaults.testCase.id,
    name: defaults.testCase.name,
    teamCollaboration: defaults.testCase.teamCollaboration,
    metrics: defaults.testCase.metrics,
    thresholds: defaults.testCase.thresholds,
    messages: defaults.testCase.messages,
    extractors: defaults.testCase.extractors,
    output: {
      ...defaults.testCase.output,
      responseFormat: undefined,
    },
    assets: defaults.testCase.assets,
  });
  await writeJson(runDefaultsPath, defaults.runDefaults);

  await writeFile(markdownFields.testDescription, defaults.testCase.testDescription, "utf8");
  await writeFile(markdownFields.additionalContext, defaults.testCase.additionalContext, "utf8");
  await writeFile(markdownFields.teamCollaboration, defaults.testCase.teamCollaboration, "utf8");
  await writeFile(markdownFields.sharedPrompt, defaults.testCase.prompts.shared, "utf8");
  await writeFile(markdownFields.loginOverlayPrompt, defaults.testCase.prompts.loginOverlay, "utf8");
  await writeFile(markdownFields.preprocessingPrompt, defaults.testCase.prompts.preprocessing, "utf8");
  await writeFile(markdownFields.postprocessingPrompt, defaults.testCase.prompts.postprocessing, "utf8");
  await writeFile(markdownFields.splPrompt, defaults.testCase.prompts.spl, "utf8");
  await writeFile(markdownFields.personalizationPrompt, defaults.testCase.prompts.personalization, "utf8");
  await writeFile(markdownFields.responseFormat, defaults.testCase.output.responseFormat, "utf8");

  const envValues = await loadEnvFile();
  const mergedEnv = {
    ...envValues,
    CUA_MODEL: envValues.CUA_MODEL || defaults.secrets.cuaModel,
    EXTRA_HEADER_NAME: envValues.EXTRA_HEADER_NAME || defaults.secrets.extraHeaderName,
    EXTRA_HEADER_VALUE:
      envValues.EXTRA_HEADER_VALUE || defaults.secrets.extraHeaderValue,
    SITE_ACCESS_MODE: envValues.SITE_ACCESS_MODE || defaults.secrets.siteAccessMode,
    SITE_ACCESS_ORIGIN:
      envValues.SITE_ACCESS_ORIGIN || defaults.secrets.siteAccessOrigin,
    SITE_ACCESS_HTTP_USERNAME:
      envValues.SITE_ACCESS_HTTP_USERNAME ||
      defaults.secrets.siteAccessHttpUsername,
    SITE_ACCESS_HTTP_PASSWORD:
      envValues.SITE_ACCESS_HTTP_PASSWORD ||
      defaults.secrets.siteAccessHttpPassword,
    OPENAI_API_KEY: envValues.OPENAI_API_KEY || defaults.secrets.openaiApiKey,
  };
  await writeEnvFile(mergedEnv);

  return { projectId, testCaseId };
}

async function listProjects(): Promise<ProjectListItem[]> {
  const projectsRoot = path.join(WORKSPACE_ROOT, "projects");
  await ensureDir(projectsRoot);
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const projects: ProjectListItem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectId = entry.name;
    const projectJsonPath = path.join(projectsRoot, projectId, "project.json");
    if (!(await pathExists(projectJsonPath))) continue;
    try {
      const projectJson = await readJson<{ id: string; name: string; description?: string }>(
        projectJsonPath
      );
      projects.push({
        id: projectJson.id || projectId,
        name: projectJson.name || projectId,
        description: projectJson.description || "",
      });
    } catch {
      continue;
    }
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

async function listTestCases(projectId: string): Promise<TestCaseListItem[]> {
  const testCasesRoot = path.join(getProjectRoot(projectId), "test-cases");
  await ensureDir(testCasesRoot);
  const entries = await readdir(testCasesRoot, { withFileTypes: true });
  const testCases: TestCaseListItem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const testCaseId = entry.name;
    const testCaseJsonPath = path.join(testCasesRoot, testCaseId, "test-case.json");
    if (!(await pathExists(testCaseJsonPath))) continue;
    try {
      const testCaseJson = await readJson<{
        id: string;
        name: string;
        teamCollaboration?: string;
      }>(testCaseJsonPath);
      testCases.push({
        id: testCaseJson.id || testCaseId,
        projectId,
        name: testCaseJson.name || testCaseId,
        teamCollaboration: testCaseJson.teamCollaboration || "",
      });
    } catch {
      continue;
    }
  }

  return testCases.sort((a, b) => a.name.localeCompare(b.name));
}

function applyRunFilter(runs: RunSummary[], filter?: WorkspaceFilter) {
  if (!filter) return runs;

  return runs.filter((run) => {
    if (filter.status && run.status !== filter.status) return false;
    if (filter.onlyFailures && run.status !== "fail") return false;
    if (filter.metricId && !run.metricIds.includes(filter.metricId)) return false;
    if (!filter.query?.trim()) return true;
    const haystack = [run.runId, run.trigger, ...run.metricNames]
      .join(" ")
      .toLowerCase();
    return haystack.includes(filter.query.toLowerCase());
  });
}

export async function ensureWorkspaceBootstrapped(
  selection?: Partial<WorkspaceSelection>
) {
  return ensureProjectTestCaseBootstrapped(selection);
}

export async function loadWorkspace(
  selection?: Partial<WorkspaceSelection>,
  filter?: WorkspaceFilter
): Promise<WorkspacePayload> {
  const ensuredSelection = await ensureProjectTestCaseBootstrapped(selection);
  const projects = await listProjects();
  const availableTestCases = await listTestCases(ensuredSelection.projectId);

  const [project, testCaseJson, runDefaults, envValues, runs] = await Promise.all([
    readJson<WorkspaceDocument["project"]>(
      path.join(getProjectRoot(ensuredSelection.projectId), "project.json")
    ),
    readJson<Omit<WorkspaceDocument["testCase"], "testDescription" | "additionalContext" | "prompts">>(
      path.join(getTestCaseRoot(ensuredSelection.projectId, ensuredSelection.testCaseId), "test-case.json")
    ),
    readJson<WorkspaceDocument["runDefaults"]>(
      path.join(getTestCaseRoot(ensuredSelection.projectId, ensuredSelection.testCaseId), "run-defaults.json")
    ),
    loadEnvFile(),
    loadRuns(ensuredSelection.projectId, ensuredSelection.testCaseId, filter),
  ]);

  const markdownFields = getMarkdownFields(
    ensuredSelection.projectId,
    ensuredSelection.testCaseId
  );

  const testCase: WorkspaceDocument["testCase"] = {
    ...testCaseJson,
    teamCollaboration: await readTextOrEmpty(markdownFields.teamCollaboration),
    testDescription: await readTextOrEmpty(markdownFields.testDescription),
    additionalContext: await readTextOrEmpty(markdownFields.additionalContext),
    prompts: {
      shared: await readTextOrEmpty(markdownFields.sharedPrompt),
      loginOverlay: await readTextOrEmpty(markdownFields.loginOverlayPrompt),
      preprocessing: await readTextOrEmpty(markdownFields.preprocessingPrompt),
      postprocessing: await readTextOrEmpty(markdownFields.postprocessingPrompt),
      spl: await readTextOrEmpty(markdownFields.splPrompt),
      personalization: await readTextOrEmpty(markdownFields.personalizationPrompt),
    },
    output: {
      ...testCaseJson.output,
      responseFormat: await readTextOrEmpty(markdownFields.responseFormat),
    },
  };

  const workspace: WorkspaceDocument = {
    schemaVersion: "1.0",
    project: {
      ...project,
      analyticsViews: Array.isArray(project.analyticsViews)
        ? project.analyticsViews
        : [],
    },
    testCase,
    runDefaults,
    secrets: {
      openaiApiKey: envValues.OPENAI_API_KEY || "",
      cuaModel: envValues.CUA_MODEL || "gpt-5.4",
      extraHeaderName: envValues.EXTRA_HEADER_NAME || "",
      extraHeaderValue: envValues.EXTRA_HEADER_VALUE || "",
      siteAccessMode:
        envValues.SITE_ACCESS_MODE === "headers" ||
        envValues.SITE_ACCESS_MODE === "http_basic"
          ? envValues.SITE_ACCESS_MODE
          : "none",
      siteAccessOrigin: envValues.SITE_ACCESS_ORIGIN || project.baseUrl || "",
      siteAccessHttpUsername: envValues.SITE_ACCESS_HTTP_USERNAME || "",
      siteAccessHttpPassword: envValues.SITE_ACCESS_HTTP_PASSWORD || "",
    },
    savedAt: new Date().toISOString(),
  };

  return {
    selection: ensuredSelection,
    projects,
    testCases: availableTestCases,
    workspace,
    runs,
    analytics: buildAnalytics(runs),
    learning: await loadLearningSummary(workspace.project.id),
  };
}

export async function saveWorkspace(
  selection: WorkspaceSelection,
  nextWorkspace: WorkspaceDocument
): Promise<SaveWorkspaceResponse> {
  const normalized = await ensureProjectTestCaseBootstrapped(selection);
  const current = await loadWorkspace(normalized);
  const changedFiles: string[] = [];
  const envFilesChanged: string[] = [];
  const testCaseRoot = getTestCaseRoot(normalized.projectId, normalized.testCaseId);
  const markdownFields = getMarkdownFields(normalized.projectId, normalized.testCaseId);

  await writeJson(path.join(getProjectRoot(normalized.projectId), "project.json"), nextWorkspace.project);
  changedFiles.push(`workspace-data/projects/${normalized.projectId}/project.json`);

  await writeJson(path.join(testCaseRoot, "test-case.json"), {
    id: nextWorkspace.testCase.id,
    name: nextWorkspace.testCase.name,
    teamCollaboration: nextWorkspace.testCase.teamCollaboration,
    metrics: nextWorkspace.testCase.metrics,
    thresholds: nextWorkspace.testCase.thresholds,
    messages: nextWorkspace.testCase.messages,
    extractors: nextWorkspace.testCase.extractors,
    output: {
      ...nextWorkspace.testCase.output,
      responseFormat: undefined,
    },
    assets: nextWorkspace.testCase.assets,
  });
  changedFiles.push(
    `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/test-case.json`
  );

  await writeJson(path.join(testCaseRoot, "run-defaults.json"), nextWorkspace.runDefaults);
  changedFiles.push(
    `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/run-defaults.json`
  );

  const markdownWrites: Array<[string, string, string]> = [
    [markdownFields.testDescription, nextWorkspace.testCase.testDescription, `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/content/test-description.md`],
    [markdownFields.additionalContext, nextWorkspace.testCase.additionalContext, `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/content/additional-context.md`],
    [markdownFields.teamCollaboration, nextWorkspace.testCase.teamCollaboration, `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/content/team-collaboration.md`],
    [markdownFields.sharedPrompt, nextWorkspace.testCase.prompts.shared, `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/prompts/shared.md`],
    [markdownFields.loginOverlayPrompt, nextWorkspace.testCase.prompts.loginOverlay, `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/prompts/login-overlay.md`],
    [markdownFields.preprocessingPrompt, nextWorkspace.testCase.prompts.preprocessing, `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/prompts/preprocessing.md`],
    [markdownFields.postprocessingPrompt, nextWorkspace.testCase.prompts.postprocessing, `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/prompts/postprocessing.md`],
    [markdownFields.splPrompt, nextWorkspace.testCase.prompts.spl, `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/prompts/spl.md`],
    [markdownFields.personalizationPrompt, nextWorkspace.testCase.prompts.personalization, `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/prompts/personalization.md`],
    [markdownFields.responseFormat, nextWorkspace.testCase.output.responseFormat, `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/content/response-format.json`],
  ];

  for (const [targetPath, content, displayPath] of markdownWrites) {
    await writeFile(targetPath, content, "utf8");
    changedFiles.push(displayPath);
  }

  const envValues = await loadEnvFile();
  const nextEnvValues = {
    ...envValues,
    OPENAI_API_KEY: nextWorkspace.secrets.openaiApiKey || "",
    CUA_MODEL: nextWorkspace.secrets.cuaModel || "gpt-5.4",
    EXTRA_HEADER_NAME: nextWorkspace.secrets.extraHeaderName || "",
    EXTRA_HEADER_VALUE: nextWorkspace.secrets.extraHeaderValue || "",
    SITE_ACCESS_MODE: nextWorkspace.secrets.siteAccessMode || "none",
    SITE_ACCESS_ORIGIN: nextWorkspace.secrets.siteAccessOrigin || "",
    SITE_ACCESS_HTTP_USERNAME:
      nextWorkspace.secrets.siteAccessHttpUsername || "",
    SITE_ACCESS_HTTP_PASSWORD:
      nextWorkspace.secrets.siteAccessHttpPassword || "",
  };

  const envChanged =
    current.workspace.secrets.openaiApiKey !== nextWorkspace.secrets.openaiApiKey ||
    current.workspace.secrets.cuaModel !== nextWorkspace.secrets.cuaModel ||
    current.workspace.secrets.extraHeaderName !== nextWorkspace.secrets.extraHeaderName ||
    current.workspace.secrets.extraHeaderValue !== nextWorkspace.secrets.extraHeaderValue ||
    current.workspace.secrets.siteAccessMode !== nextWorkspace.secrets.siteAccessMode ||
    current.workspace.secrets.siteAccessOrigin !==
      nextWorkspace.secrets.siteAccessOrigin ||
    current.workspace.secrets.siteAccessHttpUsername !==
      nextWorkspace.secrets.siteAccessHttpUsername ||
    current.workspace.secrets.siteAccessHttpPassword !==
      nextWorkspace.secrets.siteAccessHttpPassword;

  if (envChanged) {
    await writeEnvFile(nextEnvValues);
    envFilesChanged.push("cua-server/.env.development");
  }

  return {
    workspace: {
      ...nextWorkspace,
      savedAt: new Date().toISOString(),
    },
    restartRequired: envChanged,
    changedFiles,
    envFilesChanged,
  };
}

export async function createProject(name: string) {
  const projectId = slugify(name) || `project-${randomUUID().slice(0, 8)}`;
  const testCaseId = DEFAULT_TEST_CASE_ID;
  const defaults = createDefaultWorkspace({
    projectId,
    projectName: name,
    testCaseId,
  });

  await ensureProjectTestCaseBootstrapped({ projectId, testCaseId });
  await saveWorkspace(
    { projectId, testCaseId },
    {
      ...defaults,
      project: { ...defaults.project, id: projectId, name },
    }
  );

  return { projectId, testCaseId };
}

export async function createTestCase(projectId: string, name: string) {
  const testCaseId = slugify(name) || `test-case-${randomUUID().slice(0, 8)}`;
  const baseSelection = await ensureProjectTestCaseBootstrapped({
    projectId,
    testCaseId: DEFAULT_TEST_CASE_ID,
  });
  const baseWorkspace = await loadWorkspace(baseSelection);
  const nextWorkspace: WorkspaceDocument = {
    ...baseWorkspace.workspace,
    testCase: {
      ...baseWorkspace.workspace.testCase,
      id: testCaseId,
      name,
    },
    savedAt: new Date().toISOString(),
  };

  await ensureProjectTestCaseBootstrapped({ projectId, testCaseId });
  await saveWorkspace({ projectId, testCaseId }, nextWorkspace);
  return { projectId, testCaseId };
}

export async function saveUploadedAssets(
  selection: WorkspaceSelection,
  files: Array<{ name: string; type: string; buffer: Buffer }>
): Promise<WorkspaceAsset[]> {
  const normalized = await ensureProjectTestCaseBootstrapped(selection);
  const current = await loadWorkspace(normalized);
  const existingAssets = current.workspace.testCase.assets;
  const newAssets: WorkspaceAsset[] = [];
  const assetsRoot = getAssetsRoot(normalized.projectId, normalized.testCaseId);

  for (const file of files) {
    const id = randomUUID();
    const fileName = `${id}-${file.name}`;
    const localPath = path.join(assetsRoot, fileName);
    await writeFile(localPath, file.buffer);
    newAssets.push({
      id,
      name: file.name,
      relativePath: `workspace-data/projects/${normalized.projectId}/test-cases/${normalized.testCaseId}/assets/${fileName}`,
      mimeType: file.type || "application/octet-stream",
      size: file.buffer.byteLength,
      uploadedAt: new Date().toISOString(),
    });
  }

  const updatedWorkspace: WorkspaceDocument = {
    ...current.workspace,
    testCase: {
      ...current.workspace.testCase,
      assets: [...existingAssets, ...newAssets],
    },
  };

  await saveWorkspace(normalized, updatedWorkspace);
  return newAssets;
}

export async function loadRunDetail(projectId: string, runId: string) {
  const runRoot = path.join(getRunsRoot(projectId), runId);
  const runJsonPath = path.join(runRoot, "run.json");
  const resultsPath = path.join(runRoot, "results", "results.json");
  const extractsRoot = path.join(runRoot, "extracts");
  const evaluatorsRoot = path.join(runRoot, "evaluators");

  const run = await readJson<Record<string, unknown>>(runJsonPath);
  const results = (await pathExists(resultsPath))
    ? await readJson<Record<string, unknown>>(resultsPath)
    : null;

  const evaluators: Array<Record<string, unknown>> = [];
  if (await pathExists(evaluatorsRoot)) {
    const entries = await readdir(evaluatorsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        evaluators.push(
          await readJson<Record<string, unknown>>(path.join(evaluatorsRoot, entry.name))
        );
      } catch {
        continue;
      }
    }
  }

  const extracts: Array<Record<string, unknown>> = [];
  if (await pathExists(extractsRoot)) {
    const entries = await readdir(extractsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        extracts.push(
          await readJson<Record<string, unknown>>(path.join(extractsRoot, entry.name))
        );
      } catch {
        continue;
      }
    }
  }

  return {
    runId,
    projectId,
    testCaseId: String(run.test_case_id || DEFAULT_TEST_CASE_ID),
    run,
    results,
    evaluators,
    extracts,
    finalOutput:
      (
        (results as { structured_results?: { final_output?: unknown } } | null)
          ?.structured_results?.final_output
      ) ||
      (run.final_output as unknown) ||
      null,
  };
}

async function loadRuns(
  projectId: string,
  testCaseId: string,
  filter?: WorkspaceFilter
): Promise<RunSummary[]> {
  const runsRoot = getRunsRoot(projectId);
  await ensureDir(runsRoot);
  const entries = await readdir(runsRoot, { withFileTypes: true });
  const runs: RunSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runJsonPath = path.join(runsRoot, entry.name, "run.json");
    if (!(await pathExists(runJsonPath))) continue;
    try {
      const runJson = await readJson<any>(runJsonPath);
      if ((runJson.test_case_id || DEFAULT_TEST_CASE_ID) !== testCaseId) continue;
      runs.push({
        runId: runJson.run_id,
        startedAt: runJson.started_at,
        finishedAt: runJson.finished_at,
        status: runJson.status,
        projectId: runJson.project_id || projectId,
        testCaseId: runJson.test_case_id || testCaseId,
        trigger: runJson.trigger || "Manual trigger from localhost:3000",
        evaluatorCount: Array.isArray(runJson.evaluators)
          ? runJson.evaluators.length
          : 0,
        passedEvaluators: Array.isArray(runJson.evaluators)
          ? runJson.evaluators.filter((item: any) => item.status === "pass").length
          : 0,
        failedEvaluators: Array.isArray(runJson.evaluators)
          ? runJson.evaluators.filter((item: any) => item.status === "fail").length
          : 0,
        assetCount: Array.isArray(runJson.artifacts) ? runJson.artifacts.length : 0,
        transcriptTurnCount: Array.isArray(runJson.chat_transcript)
          ? runJson.chat_transcript.length
          : 0,
        metricIds: Array.isArray(runJson.evaluators)
          ? runJson.evaluators.map((item: any) =>
              String(item.id || item.evaluator_id || "unknown-metric")
            )
          : [],
        metricNames: Array.isArray(runJson.evaluators)
          ? runJson.evaluators.map((item: any) => String(item.name))
          : [],
      });
    } catch {
      continue;
    }
  }

  return applyRunFilter(
    runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    filter
  );
}
