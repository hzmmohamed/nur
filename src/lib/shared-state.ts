import { atom } from "jotai";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export const framesAtom = atom<ImageBitmap[]>([]);
export const fpsAtom = atom(24);

export const timelineLengthSecondsAtom = atom(
  (get) => get(framesAtom).length / get(fpsAtom)
);

export const currentTimeSecondsAtom = atom<number>(0);

export const updateCurrentTimeSecondsAtom = atom(
  (get) => get(currentTimeSecondsAtom),
  (get, set, updated: number) => {
    set(
      currentTimeSecondsAtom,
      clamp(updated, 0, get(timelineLengthSecondsAtom))
    );
  }
);
export const currentFrameIndexAtom = atom((get) =>
  Math.floor(get(currentTimeSecondsAtom) * get(fpsAtom))
);
