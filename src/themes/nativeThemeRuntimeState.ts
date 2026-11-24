import { create } from "zustand";
import type { NativeThemeProjection } from "./nativeThemeProjection.ts";

interface NativeThemeRuntimeState {
  live: NativeThemeProjection | null;
  setLive(projection: NativeThemeProjection): void;
}

export const useNativeThemeRuntimeState = create<NativeThemeRuntimeState>((set) => ({
  live: null,
  setLive: live => set({ live }),
}));

export const setLiveNativeThemeProjection = (projection: NativeThemeProjection): void => {
  useNativeThemeRuntimeState.getState().setLive(projection);
};
