export type UiStepStatus =
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

export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  enabled: boolean;
}

export type SiteAccessMode = "none" | "headers" | "http_basic";

export interface ExtractorConfig {
  id: string;
  name: string;
  kind: "chat_transcript" | "chat_latency" | "ui_entities" | "custom_schema";
  enabled: boolean;
  sourcePriority: Array<"dom" | "network" | "vision" | "events">;
  selectors: string[];
  schemaPrompt: string;
}

export interface WorkspaceDocument {
  schemaVersion: "1.0";
  project: {
    id: string;
    name: string;
    description: string;
    tags: string[];
    baseUrl: string;
    analyticsViews: Array<{
      id: string;
      name: string;
      query: string;
      statuses: Array<"running" | "pass" | "fail">;
      metricIds: string[];
      onlyFailures: boolean;
    }>;
  };
  testCase: {
    id: string;
    name: string;
    teamCollaboration: string;
    testDescription: string;
    additionalContext: string;
    metrics: MetricDefinition[];
    thresholds: Array<{
      id: string;
      metricId: string;
      operator: "gte" | "lte" | "contains";
      value: string;
    }>;
    prompts: {
      shared: string;
      loginOverlay: string;
      preprocessing: string;
      postprocessing: string;
      spl: string;
      personalization: string;
    };
    messages: {
      system: Array<{
        id: string;
        role: "system" | "user";
        content: string;
        variables: string[];
      }>;
      user: Array<{
        id: string;
        role: "system" | "user";
        content: string;
        variables: string[];
      }>;
    };
    extractors: ExtractorConfig[];
    output: {
      responseFormat: string;
      fileTargets: string[];
    };
    assets: Array<{
      id: string;
      name: string;
      relativePath: string;
      mimeType: string;
      size: number;
      uploadedAt: string;
    }>;
  };
  runDefaults: {
    trigger: string;
    loginRequired: boolean;
    website: string;
    additionalContextOverride: string;
    headers: Array<{
      id: string;
      name: string;
      value: string;
      secret: boolean;
    }>;
    username: string;
    password: string;
    userInfo: {
      name: string;
      email: string;
      address: string;
    };
    outputInstructions: string;
    uploadedAssetIds: string[];
  };
  secrets: {
    openaiApiKey: string;
    cuaModel: string;
    extraHeaderName: string;
    extraHeaderValue: string;
    siteAccessMode: SiteAccessMode;
    siteAccessOrigin: string;
    siteAccessHttpUsername: string;
    siteAccessHttpPassword: string;
  };
  savedAt: string;
}

export interface RunStepSnapshot {
  step_number: number;
  step_instructions: string;
  status: UiStepStatus;
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
