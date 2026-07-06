import { create } from "zustand";
import type { Artifact } from "@/types";

interface ArtifactState {
  artifact: Artifact | null;
  open: (artifact: Artifact) => void;
  close: () => void;
}

export const useArtifactStore = create<ArtifactState>((set) => ({
  artifact: null,
  open: (artifact: Artifact) => set({ artifact }),
  close: () => set({ artifact: null }),
}));
