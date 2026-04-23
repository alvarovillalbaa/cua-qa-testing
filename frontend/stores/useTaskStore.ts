// /stores/useTaskStore.ts
import { create } from "zustand";
import type {
  CurrentRunSnapshot,
  RunStepSnapshot,
} from "@/lib/workspace-types";

/* ───── Types ──────────────────────────────────────────────── */
type Status =
  | "idle"
  | "draft"
  | "pending"
  | "running"
  | "pass"
  | "fail"
  | "incomplete";

interface TaskStoreState {
  testCases: RunStepSnapshot[];
  testCaseUpdateStatus: Status;
  currentRunSnapshot: CurrentRunSnapshot | null;

  setTestCases: (steps: RunStepSnapshot[]) => void;
  updateTestScript: (steps: RunStepSnapshot[]) => void;
  setTestCaseUpdateStatus: (status: Status) => void;
  setCurrentRunSnapshot: (snapshot: CurrentRunSnapshot | null) => void;
  clearRunState: () => void;
}

export const useTaskStore = create<TaskStoreState>()((set) => ({
  testCases: [],
  testCaseUpdateStatus: "idle",
  currentRunSnapshot: null,

  setTestCases: (steps) => set({ testCases: steps }),
  updateTestScript: (steps) =>
    set((state) => {
      /* Build a map of existing steps by their step_number for quick lookup */
      const existingMap = new Map(
        state.testCases.map((s) => [s.step_number, { ...s }])
      );

      /* Merge each incoming step with the existing one (if any) */
      steps.forEach((incoming) => {
        const current = existingMap.get(incoming.step_number) || {};
        existingMap.set(incoming.step_number, {
          ...current,
          ...incoming,
        });
      });

      /* Preserve a stable ordering by step_number */
      const mergedSteps = Array.from(existingMap.values()).sort(
        (a, b) => a.step_number - b.step_number
      );

      return { testCases: mergedSteps };
    }),
  setTestCaseUpdateStatus: (status) => set({ testCaseUpdateStatus: status }),
  setCurrentRunSnapshot: (snapshot) =>
    set({
      currentRunSnapshot: snapshot,
      testCases: snapshot?.steps || [],
      testCaseUpdateStatus: snapshot?.status || "idle",
    }),
  clearRunState: () =>
    set({
      currentRunSnapshot: null,
      testCases: [],
      testCaseUpdateStatus: "idle",
    }),
}));

export default useTaskStore;
