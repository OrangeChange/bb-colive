import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getUiLanguage, normalizeUiLanguage, setUiLanguage, subscribeUiLanguage, uiText, UI_LANGUAGE_STORAGE_KEY } from "./index.ts";

export async function changeUiLanguage(value: string): Promise<void> {
  const language = normalizeUiLanguage(value);
  if (isTauri()) await invoke("set_ui_language", { language });
  localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language);
  setUiLanguage(language);
}

export async function initializeUiLanguage(): Promise<void> {
  if (isTauri()) await listen<string>("ui-language-changed", event => { setUiLanguage(event.payload); });
  const language = isTauri()
    ? await invoke<string>("get_ui_language")
    : localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
  setUiLanguage(language);
  const updateDocument = () => {
    document.documentElement.lang = getUiLanguage();
    const kind = new URLSearchParams(window.location.search).get("window");
    const title = kind === "native-style-preview" ? uiText("nativeStylePreviewBridge.openNativeStylePreviewWindow.title")
      : kind === "display" ? uiText("displayBridge.openDisplayWindow.created.title")
      : kind === "gift" ? `${uiText("common.revenueWindow")} · BB CoLive`
      : kind === "gift-only" ? `${uiText("giftBridge.openGiftWindow.created.title3")} · BB CoLive`
      : kind === "superchat" ? `${uiText("giftBridge.openGiftWindow.created.title")} · BB CoLive`
      : kind === "guard" ? `${uiText("giftBridge.openGiftWindow.created.title2")} · BB CoLive` : undefined;
    if (title) {
      document.title = title;
      if (isTauri()) void getCurrentWindow().setTitle(title).catch(() => {});
    }
  };
  updateDocument();
  subscribeUiLanguage(updateDocument);
  window.addEventListener("storage", event => {
    if (event.key === UI_LANGUAGE_STORAGE_KEY) setUiLanguage(event.newValue);
  });
}
