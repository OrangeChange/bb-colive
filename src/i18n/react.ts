import { useSyncExternalStore } from "react";
import { getUiLanguage, subscribeUiLanguage } from "./index.ts";

export function useUiLanguage() {
  return useSyncExternalStore(subscribeUiLanguage, getUiLanguage, getUiLanguage);
}
