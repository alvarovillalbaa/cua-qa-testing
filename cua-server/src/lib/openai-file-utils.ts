import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { WorkspaceDocument } from "./workspace-types";
import { getRepoRoot } from "./workspace-paths";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface OpenAIUploadedFileRef {
  assetId: string;
  name: string;
  relativePath: string;
  fileId?: string;
  inlineData?: string;
  mode: "uploaded" | "inline" | "skipped";
}

export interface OpenAIResponseInputFile {
  type: "input_file";
  file_id?: string;
  file_data?: string;
  file_url?: string;
}

export function sanitizeResponseInput(input: any[]) {
  return input.map((item) => {
    if (!Array.isArray(item?.content)) {
      return item;
    }

    return {
      ...item,
      content: item.content.map((contentItem: any) => {
        if (contentItem?.type !== "input_file") {
          return contentItem;
        }

        const cleaned = { ...contentItem };
        delete cleaned.filename;

        const fileKeys = ["file_id", "file_data", "file_url"].filter(
          (key) => Boolean(cleaned[key])
        );

        if (fileKeys.length !== 1) {
          throw new Error(
            `Invalid input_file item. Expected exactly one of file_id/file_data/file_url, got ${fileKeys.join(", ") || "none"}.`
          );
        }

        return cleaned;
      }),
    };
  });
}

export function getWorkspaceAssetPaths(workspace: WorkspaceDocument) {
  return workspace.testCase.assets.map((asset) => ({
    assetId: asset.id,
    name: asset.name,
    relativePath: asset.relativePath,
    absolutePath: path.join(getRepoRoot(), asset.relativePath),
  }));
}

export async function prepareOpenAIFileInputs(workspace: WorkspaceDocument) {
  const refs: OpenAIUploadedFileRef[] = [];
  const inputFiles: OpenAIResponseInputFile[] = [];

  for (const asset of getWorkspaceAssetPaths(workspace)) {
    if (!fs.existsSync(asset.absolutePath)) {
      refs.push({
        assetId: asset.assetId,
        name: asset.name,
        relativePath: asset.relativePath,
        mode: "skipped",
      });
      continue;
    }

    if (!process.env.OPENAI_API_KEY) {
      refs.push({
        assetId: asset.assetId,
        name: asset.name,
        relativePath: asset.relativePath,
        mode: "skipped",
      });
      continue;
    }

    try {
      const uploaded = await openai.files.create({
        file: fs.createReadStream(asset.absolutePath),
        purpose: "assistants",
      });
      refs.push({
        assetId: asset.assetId,
        name: asset.name,
        relativePath: asset.relativePath,
        fileId: uploaded.id,
        mode: "uploaded",
      });
      inputFiles.push({
        type: "input_file",
        file_id: uploaded.id,
      });
    } catch {
      const inlineData = fs.readFileSync(asset.absolutePath).toString("base64");
      refs.push({
        assetId: asset.assetId,
        name: asset.name,
        relativePath: asset.relativePath,
        inlineData,
        mode: "inline",
      });
      inputFiles.push({
        type: "input_file",
        file_data: inlineData,
      });
    }
  }

  return {
    refs,
    inputFiles,
  };
}
