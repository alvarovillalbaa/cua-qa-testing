import { NextResponse } from "next/server";
import { loadRunDetail } from "@/lib/server/workspace-store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const { searchParams } = new URL(request.url);
  const { runId } = await context.params;
  const projectId = searchParams.get("projectId") || "default-project";
  const payload = await loadRunDetail(projectId, runId);
  return NextResponse.json(payload);
}
