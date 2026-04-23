import { randomUUID } from "crypto";
import {
  PASSWORD,
  TEST_APP_URL,
  TEST_CASE,
  USER_INFO,
  USERNAME,
} from "@/lib/constants";
import type { WorkspaceDocument } from "@/lib/workspace-types";

export const DEFAULT_PROJECT_ID = "default-project";
export const DEFAULT_TEST_CASE_ID = "default-test-case";

interface DefaultWorkspaceOptions {
  projectId?: string;
  projectName?: string;
  testCaseId?: string;
  testCaseName?: string;
  baseUrl?: string;
}

function createDefaultMetric() {
  return {
    id: randomUUID(),
    name: "Primary evaluator",
    description:
      "Default evaluator derived from the test description when no explicit metrics are configured.",
    systemPrompt:
      "Evaluate the run using the test description, the captured evidence, and the configured thresholds. Return a structured pass/fail decision with rationale.",
    enabled: true,
  };
}

export function createDefaultWorkspace(
  options: DefaultWorkspaceOptions = {}
): WorkspaceDocument {
  const defaultMetric = createDefaultMetric();
  const projectId = options.projectId || DEFAULT_PROJECT_ID;
  const testCaseId = options.testCaseId || DEFAULT_TEST_CASE_ID;
  const projectName = options.projectName || "Iberia QA Workspace";
  const testCaseName = options.testCaseName || "Iberia chatbot evaluator";
  const baseUrl = options.baseUrl || TEST_APP_URL;
  return {
    schemaVersion: "1.0",
    project: {
      id: projectId,
      name: projectName,
      description:
        "Persistent local workspace for configurable CUA-driven QA runs.",
      tags: ["chatbot", "localhost", "playwright"],
      baseUrl,
      analyticsViews: [],
    },
    testCase: {
      id: testCaseId,
      name: testCaseName,
      teamCollaboration:
        "Team collaboration is persisted in the repo-backed workspace files and reused across runs.",
      testDescription: TEST_CASE,
      additionalContext:
        "Use deterministic evidence first. Capture exact transcripts when testing chatbots and preserve exact outputs for later file generation.",
      metrics: [defaultMetric],
      thresholds: [
        {
          id: randomUUID(),
          metricId: defaultMetric.id,
          operator: "contains",
          value: "pass",
        },
      ],
      prompts: {
        shared:
          "You are a UI QA architect running evidence-first browser evaluations. Prefer exact extraction over summaries. Preserve exact values, messages, and visible failures.",
        loginOverlay:
          "When login is required, complete the authentication flow before evaluating the rest of the task. Reuse the shared system prompt and add only the login-specific guidance.",
        preprocessing:
          "Inspect uploaded inputs, infer useful structure, and prepare a resolved run input bundle. Prefer extracting exact headers, columns, and sample rows.",
        postprocessing:
          "Given the persisted run artifacts, produce the final structured output requested by the user. Prefer exact facts and annotate assumptions clearly.",
        spl: "Persist insights from prior runs here. This block is expected to change over time based on the learning loop.",
        personalization: "",
      },
      messages: {
        system: [
          {
            id: randomUUID(),
            role: "system",
            content:
              "Use the resolved run config, the evidence bundle, and the per-metric instructions to produce structured evaluator results.",
            variables: ["test_description", "metric_name", "spl"],
          },
        ],
        user: [
          {
            id: randomUUID(),
            role: "user",
            content:
              "Run the configured evaluation against {{website}} and return the requested output schema using the persisted evidence.",
            variables: ["website", "response_format", "personalization"],
          },
        ],
      },
      extractors: [
        {
          id: randomUUID(),
          name: "Chat transcript",
          kind: "chat_transcript",
          enabled: true,
          sourcePriority: ["dom", "events", "vision"],
          selectors: [
            "[role='log']",
            "[data-testid*='chat']",
            ".ibot-message",
            "textarea",
            "[contenteditable='true']",
          ],
          schemaPrompt:
            "Extract exact user/assistant turns with timestamps and visible metadata.",
        },
        {
          id: randomUUID(),
          name: "Error banners",
          kind: "ui_entities",
          enabled: true,
          sourcePriority: ["dom", "vision"],
          selectors: [".alert", "[role='alert']", ".error", ".toast"],
          schemaPrompt:
            "Extract visible error states and preserve exact text when available.",
        },
      ],
      output: {
        responseFormat: JSON.stringify(
          {
            type: "object",
            properties: {
              verdict: { type: "string" },
              summary: { type: "string" },
              transcript: { type: "array" },
            },
          },
          null,
          2
        ),
        fileTargets: [],
      },
      assets: [],
    },
    runDefaults: {
      trigger: "Manual trigger from localhost:3000",
      loginRequired: true,
      website: baseUrl,
      additionalContextOverride: "",
      headers: [
        {
          id: randomUUID(),
          name: "x-extra-header",
          value: "",
          secret: true,
        },
      ],
      username: USERNAME,
      password: PASSWORD,
      userInfo: {
        name: USER_INFO.name,
        email: USER_INFO.email,
        address: USER_INFO.address,
      },
      outputInstructions:
        "Render the structured output in the UI and make it available for file generation.",
      uploadedAssetIds: [],
    },
    secrets: {
      openaiApiKey: "",
      cuaModel: "gpt-5.4",
      extraHeaderName: "",
      extraHeaderValue: "",
      siteAccessMode: "none",
      siteAccessOrigin: baseUrl,
      siteAccessHttpUsername: "",
      siteAccessHttpPassword: "",
    },
    savedAt: new Date().toISOString(),
  };
}
