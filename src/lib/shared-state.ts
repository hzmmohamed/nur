import { atom, createStore } from "jotai";
import { atomWithStorage } from "jotai/utils";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export type ProjectMetadata = {
  id: string;
  name: string;
  canvasHeight: number;
  canvasWidth: number;
  fps: number;
  framesCount: number;
  lastUpdatedAt: string;
};

export const store = createStore();
export const projectsAtom = atomWithStorage<Record<string, ProjectMetadata>>(
  "nur-project-metadata",
  {}
);

export const currentTimeSecondsAtom = atom<number>(0);

export const updateCurrentTimeSecondsAtom = atom(
  (get) => get(currentTimeSecondsAtom),
  (get, set, updated: number) => {
    set(currentTimeSecondsAtom, clamp(updated, 0, 30));
  }
);
