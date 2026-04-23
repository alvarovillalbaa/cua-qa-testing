import { Page } from "playwright";
import { ExtractorConfig, WorkspaceDocument } from "../lib/workspace-types";

export interface ExtractorArtifact {
  extractorId: string;
  extractorName: string;
  kind: string;
  source: "dom" | "network" | "vision" | "events" | "hybrid";
  confidence: number;
  output: unknown;
  updatedAt: string;
}

export interface ExtractorContext {
  page: Page;
  workspace: WorkspaceDocument;
  runId: string;
  projectId: string;
  eventsPath: string;
  artifactsRoot: string;
  extractsRoot: string;
  latestScreenshotPublicPath: string | null;
  latestScreenshotLocalPath: string | null;
  latestDomSnapshotPath: string | null;
  networkEvents: Array<Record<string, unknown>>;
  transcript: Array<Record<string, unknown>>;
}

export interface ExtractorHandler {
  supports(config: ExtractorConfig): boolean;
  run(config: ExtractorConfig, context: ExtractorContext): Promise<ExtractorArtifact | null>;
}
