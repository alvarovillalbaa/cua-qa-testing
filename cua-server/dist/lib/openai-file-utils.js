"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeResponseInput = sanitizeResponseInput;
exports.getWorkspaceAssetPaths = getWorkspaceAssetPaths;
exports.prepareOpenAIFileInputs = prepareOpenAIFileInputs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const openai_1 = __importDefault(require("openai"));
const workspace_paths_1 = require("./workspace-paths");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
function sanitizeResponseInput(input) {
    return input.map((item) => {
        if (!Array.isArray(item?.content)) {
            return item;
        }
        return {
            ...item,
            content: item.content.map((contentItem) => {
                if (contentItem?.type !== "input_file") {
                    return contentItem;
                }
                const cleaned = { ...contentItem };
                delete cleaned.filename;
                const fileKeys = ["file_id", "file_data", "file_url"].filter((key) => Boolean(cleaned[key]));
                if (fileKeys.length !== 1) {
                    throw new Error(`Invalid input_file item. Expected exactly one of file_id/file_data/file_url, got ${fileKeys.join(", ") || "none"}.`);
                }
                return cleaned;
            }),
        };
    });
}
function getWorkspaceAssetPaths(workspace) {
    return workspace.testCase.assets.map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        relativePath: asset.relativePath,
        absolutePath: path_1.default.join((0, workspace_paths_1.getRepoRoot)(), asset.relativePath),
    }));
}
async function prepareOpenAIFileInputs(workspace) {
    const refs = [];
    const inputFiles = [];
    for (const asset of getWorkspaceAssetPaths(workspace)) {
        if (!fs_1.default.existsSync(asset.absolutePath)) {
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
                file: fs_1.default.createReadStream(asset.absolutePath),
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
        }
        catch {
            const inlineData = fs_1.default.readFileSync(asset.absolutePath).toString("base64");
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
