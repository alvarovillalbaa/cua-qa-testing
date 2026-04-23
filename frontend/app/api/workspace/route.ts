import { NextResponse } from "next/server";
import {
  createProject,
  createTestCase,
  loadWorkspace,
  saveWorkspace,
} from "@/lib/server/workspace-store";
import type {
  SaveWorkspacePayload,
  WorkspaceFilter,
  WorkspaceSelection,
} from "@/lib/workspace-types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const selection: Partial<WorkspaceSelection> = {
    projectId: searchParams.get("projectId") || undefined,
    testCaseId: searchParams.get("testCaseId") || undefined,
  };
  const filter: WorkspaceFilter = {
    query: searchParams.get("query") || undefined,
    status:
      (searchParams.get("status") as WorkspaceFilter["status"] | null) || undefined,
    metricId: searchParams.get("metricId") || undefined,
    onlyFailures: searchParams.get("onlyFailures") === "true",
  };
  const payload = await loadWorkspace(selection, filter);
  return NextResponse.json(payload);
}

export async function PUT(request: Request) {
  const body = (await request.json()) as SaveWorkspacePayload;
  const payload = await saveWorkspace(body.selection, body.workspace);
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const body = (await request.json()) as
    | { action: "createProject"; name: string }
    | { action: "createTestCase"; name: string; selection: WorkspaceSelection };

  if (body.action === "createProject") {
    const selection = await createProject(body.name);
    const payload = await loadWorkspace(selection);
    return NextResponse.json(payload);
  }

  const selection = await createTestCase(body.selection.projectId, body.name);
  const payload = await loadWorkspace(selection);
  return NextResponse.json(payload);
}
