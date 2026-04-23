"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Database,
  FileUp,
  Globe,
  KeyRound,
  Layers3,
  Play,
  Plus,
  RefreshCw,
  Save,
  WandSparkles,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { emitTestCaseInitiated } from "@/components/SocketIOManager";
import useWorkspaceStore from "@/stores/useWorkspaceStore";
import useTaskStore from "@/stores/useTaskStore";
import type {
  RunDetailPayload,
  SaveWorkspaceResponse,
  SiteAccessMode,
  WorkspaceFilter,
  WorkspaceDocument,
  WorkspacePayload,
} from "@/lib/workspace-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface ConfigPanelProps {
  onSubmitted?: () => void;
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

const siteAccessModes: Array<{ value: SiteAccessMode; label: string }> = [
  { value: "none", label: "None" },
  { value: "headers", label: "Headers" },
  { value: "http_basic", label: "HTTP Basic" },
];

function RestartModal({
  open,
  onCancel,
  onConfirm,
  affectedKeys,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  affectedKeys: string[];
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 text-amber-600" />
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-slate-900">
              Restart required before these changes fully apply
            </h3>
            <p className="text-sm text-slate-600">
              The following environment-backed fields are changing and the CUA
              server may need a restart after saving:
            </p>
            <ul className="list-disc pl-5 text-sm text-slate-700">
              {affectedKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" onClick={onConfirm}>
                Save anyway
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConfigPanel({ onSubmitted }: ConfigPanelProps) {
  const selection = useWorkspaceStore((s) => s.selection);
  const projects = useWorkspaceStore((s) => s.projects);
  const testCases = useWorkspaceStore((s) => s.testCases);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const savedWorkspace = useWorkspaceStore((s) => s.savedWorkspace);
  const runs = useWorkspaceStore((s) => s.runs);
  const analytics = useWorkspaceStore((s) => s.analytics);
  const learning = useWorkspaceStore((s) => s.learning);
  const loading = useWorkspaceStore((s) => s.loading);
  const error = useWorkspaceStore((s) => s.error);
  const dirty = useWorkspaceStore((s) => s.dirty);
  const setWorkspaceData = useWorkspaceStore((s) => s.setWorkspaceData);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const setLoading = useWorkspaceStore((s) => s.setLoading);
  const setError = useWorkspaceStore((s) => s.setError);
  const clearRunState = useTaskStore((s) => s.clearRunState);

  const [metricsText, setMetricsText] = useState("[]");
  const [thresholdsText, setThresholdsText] = useState("[]");
  const [extractorsText, setExtractorsText] = useState("[]");
  const [systemMessagesText, setSystemMessagesText] = useState("[]");
  const [userMessagesText, setUserMessagesText] = useState("[]");
  const [headersText, setHeadersText] = useState("[]");
  const [fileTargetsText, setFileTargetsText] = useState("[]");
  const [savedViewsText, setSavedViewsText] = useState("[]");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartKeys, setRestartKeys] = useState<string[]>([]);
  const [runQuery, setRunQuery] = useState("");
  const [runStatusFilter, setRunStatusFilter] = useState<
    "all" | "running" | "pass" | "fail"
  >("all");
  const [activeMetricIds, setActiveMetricIds] = useState<string[]>([]);
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetailPayload | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);

  async function fetchWorkspacePayload(
    nextSelection?: { projectId?: string; testCaseId?: string },
    filter?: WorkspaceFilter
  ) {
    const params = new URLSearchParams();
    if (nextSelection?.projectId) params.set("projectId", nextSelection.projectId);
    if (nextSelection?.testCaseId) params.set("testCaseId", nextSelection.testCaseId);
    if (filter?.query) params.set("query", filter.query);
    if (filter?.status) params.set("status", filter.status);
    if (filter?.metricId) params.set("metricId", filter.metricId);
    if (filter?.onlyFailures) params.set("onlyFailures", "true");
    const response = await fetch(
      `/api/workspace${params.toString() ? `?${params.toString()}` : ""}`
    );
    if (!response.ok) throw new Error("Failed to load workspace");
    return (await response.json()) as WorkspacePayload;
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);
        const payload = await fetchWorkspacePayload();
        setWorkspaceData(
          payload.selection,
          payload.projects,
          payload.testCases,
          payload.workspace,
          payload.runs,
          payload.analytics,
          payload.learning
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load workspace");
      }
    }

    void bootstrap();
  }, [setError, setLoading, setWorkspaceData]);

  useEffect(() => {
    if (!workspace) return;
    setMetricsText(prettyJson(workspace.testCase.metrics));
    setThresholdsText(prettyJson(workspace.testCase.thresholds));
    setExtractorsText(prettyJson(workspace.testCase.extractors));
    setSystemMessagesText(prettyJson(workspace.testCase.messages.system));
    setUserMessagesText(prettyJson(workspace.testCase.messages.user));
    setHeadersText(prettyJson(workspace.runDefaults.headers));
    setFileTargetsText(prettyJson(workspace.testCase.output.fileTargets));
    setSavedViewsText(prettyJson(workspace.project.analyticsViews));
  }, [workspace]);

  const restartSensitiveChanges = useMemo(() => {
    if (!workspace || !savedWorkspace) return [];
    const current = workspace.secrets;
    const draft = savedWorkspace.secrets;
    const changed: string[] = [];
    if (current.openaiApiKey !== draft.openaiApiKey)
      changed.push("OPENAI_API_KEY");
    if (current.cuaModel !== draft.cuaModel) changed.push("CUA_MODEL");
    if (current.extraHeaderName !== draft.extraHeaderName)
      changed.push("EXTRA_HEADER_NAME");
    if (current.extraHeaderValue !== draft.extraHeaderValue)
      changed.push("EXTRA_HEADER_VALUE");
    if (current.siteAccessMode !== draft.siteAccessMode)
      changed.push("SITE_ACCESS_MODE");
    if (current.siteAccessOrigin !== draft.siteAccessOrigin)
      changed.push("SITE_ACCESS_ORIGIN");
    if (current.siteAccessHttpUsername !== draft.siteAccessHttpUsername)
      changed.push("SITE_ACCESS_HTTP_USERNAME");
    if (current.siteAccessHttpPassword !== draft.siteAccessHttpPassword)
      changed.push("SITE_ACCESS_HTTP_PASSWORD");
    return changed;
  }, [savedWorkspace, workspace]);

  function updateDraft(mutator: (draft: WorkspaceDocument) => WorkspaceDocument) {
    if (!workspace) return;
    updateWorkspace(mutator(workspace));
    setSaveMessage(null);
  }

  function parseDraft(): WorkspaceDocument {
    if (!workspace) {
      throw new Error("Workspace is not loaded yet");
    }

    return {
      ...workspace,
      project: {
        ...workspace.project,
        analyticsViews: JSON.parse(savedViewsText),
      },
      testCase: {
        ...workspace.testCase,
        metrics: JSON.parse(metricsText),
        thresholds: JSON.parse(thresholdsText),
        extractors: JSON.parse(extractorsText),
        messages: {
          system: JSON.parse(systemMessagesText),
          user: JSON.parse(userMessagesText),
        },
        output: {
          ...workspace.testCase.output,
          fileTargets: JSON.parse(fileTargetsText),
        },
      },
      runDefaults: {
        ...workspace.runDefaults,
        headers: JSON.parse(headersText),
      },
    };
  }

  async function refreshWorkspace() {
    const payload = await fetchWorkspacePayload(selection || undefined);
    setWorkspaceData(
      payload.selection,
      payload.projects,
      payload.testCases,
      payload.workspace,
      payload.runs,
      payload.analytics,
      payload.learning
    );
  }

  async function commitSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const parsedWorkspace = parseDraft();
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection, workspace: parsedWorkspace }),
      });
      if (!response.ok) {
        throw new Error("Failed to save workspace");
      }
      const payload = (await response.json()) as SaveWorkspaceResponse;
      setSaveMessage(
        payload.restartRequired
          ? `Saved. Restart required for: ${payload.envFilesChanged.join(", ")}`
          : `Saved ${payload.changedFiles.length} files to the codebase.`
      );
      await refreshWorkspace();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Failed to save workspace");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    try {
      parseDraft();
      if (restartSensitiveChanges.length > 0) {
        setRestartKeys(restartSensitiveChanges);
        setShowRestartModal(true);
        return;
      }

      await commitSave();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Invalid JSON in advanced fields");
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setSaveMessage(null);

    try {
      const formData = new FormData();
      if (selection) {
        formData.append("projectId", selection.projectId);
        formData.append("testCaseId", selection.testCaseId);
      }
      files.forEach((file) => formData.append("files", file));
      const response = await fetch("/api/workspace/assets", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Failed to upload files");
      await refreshWorkspace();
      setSaveMessage(`Uploaded ${files.length} asset(s) to the codebase.`);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Failed to upload files");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  function handleRun() {
    if (!workspace) return;
    if (dirty) {
      setSaveMessage("Save the workspace before starting a run.");
      return;
    }
    clearRunState();
    emitTestCaseInitiated({
      workspace,
    });
    onSubmitted?.();
  }

  async function selectWorkspace(nextSelection: {
    projectId: string;
    testCaseId?: string;
  }) {
    const payload = await fetchWorkspacePayload(nextSelection);
    setWorkspaceData(
      payload.selection,
      payload.projects,
      payload.testCases,
      payload.workspace,
      payload.runs,
      payload.analytics,
      payload.learning
    );
  }

  async function handleCreateProject() {
    const name = window.prompt("New project name");
    if (!name?.trim()) return;
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createProject", name: name.trim() }),
    });
    if (!response.ok) {
      setSaveMessage("Failed to create project.");
      return;
    }
    const payload = (await response.json()) as WorkspacePayload;
    setWorkspaceData(
      payload.selection,
      payload.projects,
      payload.testCases,
      payload.workspace,
      payload.runs,
      payload.analytics,
      payload.learning
    );
    setSaveMessage(`Created project '${name.trim()}'.`);
  }

  async function handleCreateTestCase() {
    if (!selection) return;
    const name = window.prompt("New test case name");
    if (!name?.trim()) return;
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "createTestCase",
        name: name.trim(),
        selection,
      }),
    });
    if (!response.ok) {
      setSaveMessage("Failed to create test case.");
      return;
    }
    const payload = (await response.json()) as WorkspacePayload;
    setWorkspaceData(
      payload.selection,
      payload.projects,
      payload.testCases,
      payload.workspace,
      payload.runs,
      payload.analytics,
      payload.learning
    );
    setSaveMessage(`Created test case '${name.trim()}'.`);
  }

  async function handleSelectRun(runId: string) {
    if (!selection) return;
    setSelectedRunId(runId);
    setRunDetailLoading(true);
    try {
      const response = await fetch(
        `/api/workspace/runs/${runId}?projectId=${encodeURIComponent(
          selection.projectId
        )}`
      );
      if (!response.ok) throw new Error("Failed to load run detail");
      setRunDetail((await response.json()) as RunDetailPayload);
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : "Failed to load run detail"
      );
    } finally {
      setRunDetailLoading(false);
    }
  }

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (runStatusFilter !== "all" && run.status !== runStatusFilter) return false;
      if (onlyFailures && run.status !== "fail") return false;
      if (
        activeMetricIds.length > 0 &&
        !activeMetricIds.some((metricId) => run.metricIds.includes(metricId))
      ) {
        return false;
      }
      if (!runQuery.trim()) return true;
      const haystack = [
        run.trigger,
        run.runId,
        ...run.metricNames,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(runQuery.toLowerCase());
    });
  }, [activeMetricIds, onlyFailures, runQuery, runStatusFilter, runs]);

  if (loading || !workspace) {
    return (
      <div className="w-full p-6 max-w-6xl mx-auto">
        <AppHeader />
        <Card>
          <CardContent className="py-8 text-slate-500">
            Loading persisted workspace...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 max-w-6xl mx-auto">
        <AppHeader />
        <Card>
          <CardContent className="py-8 text-rose-600">{error}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <RestartModal
        open={showRestartModal}
        affectedKeys={restartKeys}
        onCancel={() => setShowRestartModal(false)}
        onConfirm={() => {
          setShowRestartModal(false);
          void commitSave();
        }}
      />

      <div className="w-full p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <AppHeader />

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <Database size={18} />
                Persistent Workspace
              </span>
              <span className="text-sm font-normal text-slate-500">
                {dirty ? "Unsaved changes" : "Saved to repo"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto]">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Layers3 size={14} />
                  Project
                </Label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={selection?.projectId || ""}
                  onChange={(e) =>
                    void selectWorkspace({ projectId: e.target.value })
                  }
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Test case</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={selection?.testCaseId || ""}
                  onChange={(e) =>
                    selection &&
                    void selectWorkspace({
                      projectId: selection.projectId,
                      testCaseId: e.target.value,
                    })
                  }
                >
                  {testCases.map((testCase) => (
                    <option key={testCase.id} value={testCase.id}>
                      {testCase.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={handleCreateProject}>
                  <Plus className="mr-2" size={14} />
                  Project
                </Button>
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={handleCreateTestCase}>
                  <Plus className="mr-2" size={14} />
                  Test case
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Project name</Label>
                <Input
                  value={workspace.project.name}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      project: { ...draft.project, name: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Base URL</Label>
                <Input
                  value={workspace.runDefaults.website}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      project: { ...draft.project, baseUrl: e.target.value },
                      runDefaults: { ...draft.runDefaults, website: e.target.value },
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Project description</Label>
              <Textarea
                className="min-h-[90px]"
                value={workspace.project.description}
                onChange={(e) =>
                  updateDraft((draft) => ({
                    ...draft,
                    project: { ...draft.project, description: e.target.value },
                  }))
                }
              />
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Test case name</Label>
                <Input
                  value={workspace.testCase.name}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      testCase: { ...draft.testCase, name: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Team collaboration</Label>
                <Textarea
                  className="min-h-[120px]"
                  value={workspace.testCase.teamCollaboration}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      testCase: {
                        ...draft.testCase,
                        teamCollaboration: e.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Trigger</Label>
                <Input
                  value={workspace.runDefaults.trigger}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      runDefaults: { ...draft.runDefaults, trigger: e.target.value },
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Test description</Label>
                <Textarea
                  className="min-h-[260px]"
                  value={workspace.testCase.testDescription}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      testCase: {
                        ...draft.testCase,
                        testDescription: e.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Additional context</Label>
                <Textarea
                  className="min-h-[260px]"
                  value={
                    workspace.runDefaults.additionalContextOverride ||
                    workspace.testCase.additionalContext
                  }
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      testCase: {
                        ...draft.testCase,
                        additionalContext:
                          draft.runDefaults.additionalContextOverride
                            ? draft.testCase.additionalContext
                            : e.target.value,
                      },
                      runDefaults: {
                        ...draft.runDefaults,
                        additionalContextOverride: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Shared system prompt</Label>
                <Textarea
                  className="min-h-[180px]"
                  value={workspace.testCase.prompts.shared}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      testCase: {
                        ...draft.testCase,
                        prompts: {
                          ...draft.testCase.prompts,
                          shared: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Login overlay prompt</Label>
                <Textarea
                  className="min-h-[180px]"
                  value={workspace.testCase.prompts.loginOverlay}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      testCase: {
                        ...draft.testCase,
                        prompts: {
                          ...draft.testCase.prompts,
                          loginOverlay: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Pre-processing prompt</Label>
                <Textarea
                  className="min-h-[160px]"
                  value={workspace.testCase.prompts.preprocessing}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      testCase: {
                        ...draft.testCase,
                        prompts: {
                          ...draft.testCase.prompts,
                          preprocessing: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Post-processing prompt</Label>
                <Textarea
                  className="min-h-[160px]"
                  value={workspace.testCase.prompts.postprocessing}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      testCase: {
                        ...draft.testCase,
                        prompts: {
                          ...draft.testCase.prompts,
                          postprocessing: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>SPL block</Label>
                <Textarea
                  className="min-h-[150px]"
                  value={workspace.testCase.prompts.spl}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      testCase: {
                        ...draft.testCase,
                        prompts: { ...draft.testCase.prompts, spl: e.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Personalization</Label>
                <Textarea
                  className="min-h-[150px]"
                  value={workspace.testCase.prompts.personalization}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      testCase: {
                        ...draft.testCase,
                        prompts: {
                          ...draft.testCase.prompts,
                          personalization: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Run output instructions</Label>
              <Textarea
                className="min-h-[120px]"
                value={workspace.runDefaults.outputInstructions}
                onChange={(e) =>
                  updateDraft((draft) => ({
                    ...draft,
                    runDefaults: {
                      ...draft.runDefaults,
                      outputInstructions: e.target.value,
                    },
                  }))
                }
              />
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Requires login</Label>
                <div className="flex h-10 items-center gap-3 rounded-md border border-slate-200 px-3">
                  <Switch
                    checked={workspace.runDefaults.loginRequired}
                    onCheckedChange={(checked) =>
                      updateDraft((draft) => ({
                        ...draft,
                        runDefaults: {
                          ...draft.runDefaults,
                          loginRequired: checked,
                        },
                      }))
                    }
                  />
                  <span className="text-sm text-slate-600">
                    {workspace.runDefaults.loginRequired ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>CUA model</Label>
                <Input
                  value={workspace.secrets.cuaModel}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      secrets: { ...draft.secrets, cuaModel: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={workspace.runDefaults.username}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      runDefaults: { ...draft.runDefaults, username: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={workspace.runDefaults.password}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      runDefaults: { ...draft.runDefaults, password: e.target.value },
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>User name</Label>
                <Input
                  value={workspace.runDefaults.userInfo.name}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      runDefaults: {
                        ...draft.runDefaults,
                        userInfo: {
                          ...draft.runDefaults.userInfo,
                          name: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>User email</Label>
                <Input
                  value={workspace.runDefaults.userInfo.email}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      runDefaults: {
                        ...draft.runDefaults,
                        userInfo: {
                          ...draft.runDefaults.userInfo,
                          email: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>User address</Label>
                <Input
                  value={workspace.runDefaults.userInfo.address}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      runDefaults: {
                        ...draft.runDefaults,
                        userInfo: {
                          ...draft.runDefaults.userInfo,
                          address: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <KeyRound size={14} />
                  OpenAI API key
                </Label>
                <Input
                  type="password"
                  value={workspace.secrets.openaiApiKey}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      secrets: {
                        ...draft.secrets,
                        openaiApiKey: e.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Site access mode</Label>
                <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 p-2">
                  {siteAccessModes.map((mode) => {
                    const active = workspace.secrets.siteAccessMode === mode.value;
                    return (
                      <Button
                        key={mode.value}
                        type="button"
                        variant={active ? "default" : "outline"}
                        className="h-9"
                        onClick={() =>
                          updateDraft((draft) => ({
                            ...draft,
                            secrets: {
                              ...draft.secrets,
                              siteAccessMode: mode.value,
                            },
                          }))
                        }
                      >
                        {mode.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Site access origin</Label>
                <Input
                  placeholder="https://pre.iberia.com"
                  value={workspace.secrets.siteAccessOrigin}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      secrets: {
                        ...draft.secrets,
                        siteAccessOrigin: e.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Environment-backed extra header name</Label>
                <Input
                  value={workspace.secrets.extraHeaderName}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      secrets: {
                        ...draft.secrets,
                        extraHeaderName: e.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Environment-backed extra header value</Label>
                <Input
                  type="password"
                  value={workspace.secrets.extraHeaderValue}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      secrets: {
                        ...draft.secrets,
                        extraHeaderValue: e.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>HTTP Basic username</Label>
                <Input
                  value={workspace.secrets.siteAccessHttpUsername}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      secrets: {
                        ...draft.secrets,
                        siteAccessHttpUsername: e.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>HTTP Basic password</Label>
                <Input
                  type="password"
                  value={workspace.secrets.siteAccessHttpPassword}
                  onChange={(e) =>
                    updateDraft((draft) => ({
                      ...draft,
                      secrets: {
                        ...draft.secrets,
                        siteAccessHttpPassword: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Metrics JSON</Label>
                <Textarea
                  className="min-h-[220px] font-mono text-xs"
                  value={metricsText}
                  onChange={(e) => {
                    setMetricsText(e.target.value);
                    updateDraft((draft) => ({ ...draft }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Thresholds JSON</Label>
                <Textarea
                  className="min-h-[220px] font-mono text-xs"
                  value={thresholdsText}
                  onChange={(e) => {
                    setThresholdsText(e.target.value);
                    updateDraft((draft) => ({ ...draft }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Extractors JSON</Label>
                <Textarea
                  className="min-h-[220px] font-mono text-xs"
                  value={extractorsText}
                  onChange={(e) => {
                    setExtractorsText(e.target.value);
                    updateDraft((draft) => ({ ...draft }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Headers JSON</Label>
                <Textarea
                  className="min-h-[220px] font-mono text-xs"
                  value={headersText}
                  onChange={(e) => {
                    setHeadersText(e.target.value);
                    updateDraft((draft) => ({ ...draft }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>System messages JSON</Label>
                <Textarea
                  className="min-h-[220px] font-mono text-xs"
                  value={systemMessagesText}
                  onChange={(e) => {
                    setSystemMessagesText(e.target.value);
                    updateDraft((draft) => ({ ...draft }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>User messages JSON</Label>
                <Textarea
                  className="min-h-[220px] font-mono text-xs"
                  value={userMessagesText}
                  onChange={(e) => {
                    setUserMessagesText(e.target.value);
                    updateDraft((draft) => ({ ...draft }));
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Response format / output schema</Label>
              <Textarea
                className="min-h-[180px] font-mono text-xs"
                value={workspace.testCase.output.responseFormat}
                onChange={(e) =>
                  updateDraft((draft) => ({
                    ...draft,
                    testCase: {
                      ...draft.testCase,
                      output: {
                        ...draft.testCase.output,
                        responseFormat: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Output file targets JSON</Label>
              <Textarea
                className="min-h-[120px] font-mono text-xs"
                value={fileTargetsText}
                onChange={(e) => {
                  setFileTargetsText(e.target.value);
                  updateDraft((draft) => ({ ...draft }));
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Saved analytics views JSON</Label>
              <Textarea
                className="min-h-[140px] font-mono text-xs"
                value={savedViewsText}
                onChange={(e) => {
                  setSavedViewsText(e.target.value);
                  updateDraft((draft) => ({ ...draft }));
                }}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-medium text-slate-900">Assets</h3>
                  <p className="text-sm text-slate-500">
                    Upload CSV, XLSX, Markdown, or any other files to persist them
                    in the codebase.
                  </p>
                </div>
                <Label
                  htmlFor="asset-upload"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <FileUp size={16} />
                  {uploading ? "Uploading..." : "Upload files"}
                </Label>
                <input
                  id="asset-upload"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {workspace.testCase.assets.length === 0 ? (
                  <div className="text-sm text-slate-500">
                    No persisted assets yet.
                  </div>
                ) : (
                  workspace.testCase.assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="font-medium text-slate-900">{asset.name}</div>
                      <div className="text-xs text-slate-500">{asset.relativePath}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                {saveMessage || "Workspace changes are persisted to repo-backed files."}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={() => void refreshWorkspace()}>
                  <RefreshCw size={16} />
                  Refresh
                </Button>
                <Button type="button" variant="outline" onClick={() => void handleSave()} disabled={saving}>
                  <Save size={16} />
                  {saving ? "Saving..." : "Save to codebase"}
                </Button>
                <Button type="button" onClick={handleRun} disabled={dirty}>
                  <Play size={16} />
                  Run tests
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <WandSparkles size={18} />
                Saved Runs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
                <Input
                  value={runQuery}
                  onChange={(e) => setRunQuery(e.target.value)}
                  placeholder="Filter by trigger, run id, or metric"
                />
                <Button
                  type="button"
                  variant={runStatusFilter === "all" ? "default" : "outline"}
                  onClick={() => {
                    setRunStatusFilter("all");
                    setActiveMetricIds([]);
                    setOnlyFailures(false);
                  }}
                >
                  All
                </Button>
                <Button
                  type="button"
                  variant={runStatusFilter === "pass" ? "default" : "outline"}
                  onClick={() => setRunStatusFilter("pass")}
                >
                  Pass
                </Button>
                <Button
                  type="button"
                  variant={runStatusFilter === "fail" ? "default" : "outline"}
                  onClick={() => setRunStatusFilter("fail")}
                >
                  Fail
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {workspace.project.analyticsViews.map((view) => (
                  <Button
                    key={view.id}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRunQuery(view.query || "");
                      setRunStatusFilter(
                        view.statuses.length === 1 ? view.statuses[0] : "all"
                      );
                      setActiveMetricIds(view.metricIds || []);
                      setOnlyFailures(Boolean(view.onlyFailures));
                    }}
                  >
                    {view.name}
                  </Button>
                ))}
              </div>
              {filteredRuns.length === 0 ? (
                <div className="text-sm text-slate-500">
                  No runs match the active filters.
                </div>
              ) : (
                filteredRuns.slice(0, 12).map((run) => (
                  <div
                    key={run.runId}
                    className={`rounded-xl border px-4 py-3 ${
                      selectedRunId === run.runId
                        ? "border-sky-400 bg-sky-50"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">{run.trigger}</div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          run.status === "pass"
                            ? "bg-emerald-100 text-emerald-700"
                            : run.status === "fail"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {run.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {new Date(run.startedAt).toLocaleString()} • transcript turns:{" "}
                      {run.transcriptTurnCount}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Metrics: {run.metricNames.join(", ") || "Default"}
                    </div>
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleSelectRun(run.runId)}
                      >
                        Inspect output
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe size={18} />
                Analytics
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Total runs
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {analytics?.totalRuns || 0}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500">
                    Pass
                  </div>
                  <div className="mt-1 text-xl font-semibold text-emerald-700">
                    {analytics?.passRuns || 0}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500">
                    Fail
                  </div>
                  <div className="mt-1 text-xl font-semibold text-rose-700">
                    {analytics?.failRuns || 0}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Average transcript turns
                </div>
                <div className="mt-1 text-xl font-semibold text-slate-900">
                  {analytics?.averageTranscriptTurns || 0}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Learning memory
                </div>
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  <div>
                    Last updated:{" "}
                    {learning?.lastUpdated
                      ? new Date(learning.lastUpdated).toLocaleString()
                      : "Never"}
                  </div>
                  <div className="whitespace-pre-wrap text-xs text-slate-500">
                    {learning?.autoSpl || "No auto-generated SPL memory yet."}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Metric breakdown
                </div>
                <div className="mt-2 space-y-2">
                  {(analytics?.metricBreakdown || []).map((metric) => (
                    <div key={metric.metricId} className="text-sm text-slate-700">
                      {metric.metricName}: {metric.passCount} pass / {metric.failCount} fail
                    </div>
                  ))}
                  {(analytics?.metricBreakdown || []).length === 0 ? (
                    <div className="text-sm text-slate-500">
                      No metric history yet.
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Selected run output
                </div>
                {runDetailLoading ? (
                  <div className="mt-2 text-sm text-slate-500">Loading run output...</div>
                ) : runDetail ? (
                  <div className="mt-2 space-y-3">
                    <div className="text-sm text-slate-700">
                      Run: <span className="font-mono text-xs">{runDetail.runId}</span>
                    </div>
                    <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(runDetail.finalOutput, null, 2)}
                      </pre>
                    </div>
                    <div className="text-xs text-slate-500">
                      Evaluator artifacts: {runDetail.evaluators.length} • Extracts:{" "}
                      {runDetail.extracts.length}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-slate-500">
                    Select a saved run to inspect its final output and artifacts.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
