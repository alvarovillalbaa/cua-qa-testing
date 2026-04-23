export type StepStatus =
  | "pending"
  | "running"
  | "pass"
  | "fail"
  | "blocked"
  | "not_run";

export type RunStatus =
  | "idle"
  | "draft"
  | "running"
  | "pass"
  | "fail"
  | "incomplete";

export type ExtractorKind =
  | "chat_transcript"
  | "chat_latency"
  | "ui_entities"
  | "custom_schema";

export interface WorkspaceAsset {
  id: string;
  name: string;
  relativePath: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  enabled: boolean;
}

export interface ThresholdDefinition {
  id: string;
  metricId: string;
  operator: "gte" | "lte" | "contains";
  value: string;
}

export interface ExtractorConfig {
  id: string;
  name: string;
  kind: ExtractorKind;
  enabled: boolean;
  sourcePriority: Array<"dom" | "network" | "vision" | "events">;
  selectors: string[];
  schemaPrompt: string;
}

export interface PromptBundle {
  shared: string;
  loginOverlay: string;
  preprocessing: string;
  postprocessing: string;
  spl: string;
  personalization: string;
}

export interface MessageTemplate {
  id: string;
  role: "system" | "user";
  content: string;
  variables: string[];
}

export interface ProjectConfig {
  id: string;
  name: string;
  description: string;
  tags: string[];
  baseUrl: string;
  analyticsViews: SavedAnalyticsView[];
}

export interface ProjectListItem {
  id: string;
  name: string;
  description: string;
}

export interface SavedAnalyticsView {
  id: string;
  name: string;
  query: string;
  statuses: Array<"running" | "pass" | "fail">;
  metricIds: string[];
  onlyFailures: boolean;
}

export interface TestCaseConfig {
  id: string;
  name: string;
  teamCollaboration: string;
  testDescription: string;
  additionalContext: string;
  metrics: MetricDefinition[];
  thresholds: ThresholdDefinition[];
  prompts: PromptBundle;
  messages: {
    system: MessageTemplate[];
    user: MessageTemplate[];
  };
  extractors: ExtractorConfig[];
  output: {
    responseFormat: string;
    fileTargets: string[];
  };
  assets: WorkspaceAsset[];
}

export interface TestCaseListItem {
  id: string;
  projectId: string;
  name: string;
  teamCollaboration: string;
}

export interface HeaderDefinition {
  id: string;
  name: string;
  value: string;
  secret: boolean;
}

export interface UserInfoDefinition {
  name: string;
  email: string;
  address: string;
}

export type SiteAccessMode = "none" | "headers" | "http_basic";

export interface TestRunConfig {
  trigger: string;
  loginRequired: boolean;
  website: string;
  additionalContextOverride: string;
  headers: HeaderDefinition[];
  username: string;
  password: string;
  userInfo: UserInfoDefinition;
  outputInstructions: string;
  uploadedAssetIds: string[];
}

export interface WorkspaceSecrets {
  openaiApiKey: string;
  cuaModel: string;
  extraHeaderName: string;
  extraHeaderValue: string;
  siteAccessMode: SiteAccessMode;
  siteAccessOrigin: string;
  siteAccessHttpUsername: string;
  siteAccessHttpPassword: string;
}

export interface WorkspaceDocument {
  schemaVersion: "1.0";
  project: ProjectConfig;
  testCase: TestCaseConfig;
  runDefaults: TestRunConfig;
  secrets: WorkspaceSecrets;
  savedAt: string;
}

export interface WorkspaceSelection {
  projectId: string;
  testCaseId: string;
}

export interface WorkspaceFilter {
  query?: string;
  status?: "running" | "pass" | "fail";
  metricId?: string;
  onlyFailures?: boolean;
}

export interface RunSummary {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus | "pass" | "fail";
  projectId: string;
  testCaseId: string;
  trigger: string;
  evaluatorCount: number;
  passedEvaluators: number;
  failedEvaluators: number;
  assetCount: number;
  transcriptTurnCount: number;
  metricIds: string[];
  metricNames: string[];
}

export interface AnalyticsSummary {
  totalRuns: number;
  passRuns: number;
  failRuns: number;
  runningRuns: number;
  averageTranscriptTurns: number;
  metricBreakdown: Array<{
    metricId: string;
    metricName: string;
    passCount: number;
    failCount: number;
  }>;
}

export interface LearningSummary {
  lastUpdated: string | null;
  topPatterns: string[];
  autoSpl: string;
}

export interface WorkspacePayload {
  selection: WorkspaceSelection;
  projects: ProjectListItem[];
  testCases: TestCaseListItem[];
  workspace: WorkspaceDocument;
  runs: RunSummary[];
  analytics: AnalyticsSummary;
  learning: LearningSummary;
}

export interface RunDetailPayload {
  runId: string;
  projectId: string;
  testCaseId: string;
  run: Record<string, unknown>;
  results: Record<string, unknown> | null;
  evaluators: Array<Record<string, unknown>>;
  extracts: Array<Record<string, unknown>>;
  finalOutput: unknown;
}

export interface SaveWorkspacePayload {
  selection: WorkspaceSelection;
  workspace: WorkspaceDocument;
}

export interface SaveWorkspaceResponse {
  workspace: WorkspaceDocument;
  restartRequired: boolean;
  changedFiles: string[];
  envFilesChanged: string[];
}

export interface RunStepSnapshot {
  step_number: number;
  step_instructions: string;
  status: StepStatus;
  step_reasoning: string;
  image_path?: string;
}

export interface CurrentRunSnapshot {
  runId: string | null;
  projectId: string;
  testCaseId: string;
  status: RunStatus | "pass" | "fail";
  startedAt: string | null;
  finishedAt: string | null;
  errorInfo: string | null;
  currentAction: string | null;
  steps: RunStepSnapshot[];
}
