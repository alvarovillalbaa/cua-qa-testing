// /stores/useConversationStore.ts
import { create } from "zustand";
import { MessageItem } from "@/lib/assistant";
import type { RunStepSnapshot } from "@/lib/workspace-types";
  
/* ───── Types ──────────────────────────────────────────────── */
interface ConversationState {
  /* Chat  */
  chatMessages: MessageItem[];
  addChatMessage: (msg: MessageItem) => void;

  /* Raw “system” / user text (used by AgentMessages) */
  conversationItems: any[];
  addConversationItem: (item: any) => void;

  /* Test‑case steps coming from the backend  */
  testCases: RunStepSnapshot[];
  setTestCases: (steps: RunStepSnapshot[]) => void;
  updateTestScript: (steps: RunStepSnapshot[]) => void;
}

export const useConversationStore = create<ConversationState>()(
  (set) => ({
    /* Chat */
    chatMessages: [],
    addChatMessage: (msg: MessageItem) =>
      set((s) => ({ chatMessages: [...s.chatMessages, msg] })),

    /* Raw items */
    conversationItems: [],
    addConversationItem: (item) =>
      set((s) => ({ conversationItems: [...s.conversationItems, item] })),

    /* Test‑case steps */
    testCases: [],
    setTestCases: (steps) => set({ testCases: steps }),
    updateTestScript: (steps) => set({ testCases: steps }),
  })
);

export default useConversationStore;
