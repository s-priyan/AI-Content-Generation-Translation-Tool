import { create } from "zustand";

interface UiState {
  isStreaming: boolean;
  panelOpen: boolean;
  /** id of the message currently streaming, used to render cursor / disable resend */
  streamingMessageId: string | null;
  setStreaming: (v: boolean, id?: string | null) => void;
  setPanelOpen: (v: boolean) => void;
  togglePanel: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isStreaming: false,
  panelOpen: false,
  streamingMessageId: null,
  setStreaming: (v, id = null) => set({ isStreaming: v, streamingMessageId: v ? id : null }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
}));
