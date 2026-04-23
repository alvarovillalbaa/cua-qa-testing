import { NextResponse } from "next/server";
import { saveUploadedAssets } from "@/lib/server/workspace-store";
import type { WorkspaceSelection } from "@/lib/workspace-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  const selection: WorkspaceSelection = {
    projectId: String(formData.get("projectId") || "default-project"),
    testCaseId: String(formData.get("testCaseId") || "default-test-case"),
  };

  const uploadedAssets = await saveUploadedAssets(
    selection,
    await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type,
        buffer: Buffer.from(await file.arrayBuffer()),
      }))
    )
  );

  return NextResponse.json({ assets: uploadedAssets });
}
