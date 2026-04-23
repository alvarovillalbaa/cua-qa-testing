import { create } from "zustand";
import type {
  AnalyticsSummary,
  LearningSummary,
  ProjectListItem,
  RunSummary,
  TestCaseListItem,
  WorkspaceDocument,
  WorkspaceSelection,
} from "@/lib/workspace-types";

interface WorkspaceStoreState {
  selection: WorkspaceSelection | null;
  projects: ProjectListItem[];
  testCases: TestCaseListItem[];
  workspace: WorkspaceDocument | null;
  savedWorkspace: WorkspaceDocument | null;
  runs: RunSummary[];
  analytics: AnalyticsSummary | null;
  learning: LearningSummary | null;
  loading: boolean;
  error: string | null;
  dirty: boolean;
  setWorkspaceData: (
    selection: WorkspaceSelection,
    projects: ProjectListItem[],
    testCases: TestCaseListItem[],
    workspace: WorkspaceDocument,
    runs: RunSummary[],
    analytics: AnalyticsSummary,
    learning: LearningSummary
  ) => void;
  updateWorkspace: (workspace: WorkspaceDocument) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  markSaved: () => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>()((set) => ({
  selection: null,
  projects: [],
  testCases: [],
  workspace: null,
  savedWorkspace: null,
  runs: [],
  analytics: null,
  learning: null,
  loading: true,
  error: null,
  dirty: false,
  setWorkspaceData: (selection, projects, testCases, workspace, runs, analytics, learning) =>
    set({
      selection,
      projects,
      testCases,
      workspace,
      savedWorkspace: workspace,
      runs,
      analytics,
      learning,
      loading: false,
      error: null,
      dirty: false,
    }),
  updateWorkspace: (workspace) => set({ workspace, dirty: true }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  markSaved: () =>
    set((state) => ({
      dirty: false,
      savedWorkspace: state.workspace,
    })),
}));

export default useWorkspaceStore;
