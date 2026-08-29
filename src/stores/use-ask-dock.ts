import { create } from "zustand";

/**
 * Open/closed state + the backing thread for the study Ask dock (the
 * CRM AskPanel pattern): a store, not component state, so the floating
 * button, the Ctrl/Cmd+J hotkey, and any future entry point drive the
 * same dock, and the conversation survives closing/reopening within a
 * session (the dock stays mounted and hidden — its StudyChat keeps its
 * local transcript; the thread itself is persisted server-side anyway).
 */
interface AskDockState {
  isOpen: boolean;
  /** The persisted study thread the dock chats in; null until first open. */
  threadId: string | null;
  openDock: () => void;
  closeDock: () => void;
  toggleDock: () => void;
  setThreadId: (threadId: string | null) => void;
}

export const useAskDock = create<AskDockState>((set) => ({
  isOpen: false,
  threadId: null,
  openDock: () => set({ isOpen: true }),
  closeDock: () => set({ isOpen: false }),
  toggleDock: () => set((s) => ({ isOpen: !s.isOpen })),
  setThreadId: (threadId) => set({ threadId }),
}));
