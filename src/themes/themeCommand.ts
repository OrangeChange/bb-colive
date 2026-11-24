import { invoke } from "@tauri-apps/api/core";
import { UiMessageError } from "../i18n/index.ts";

/** 主题存储错误使用稳定代码传递，显示文案由界面统一提供。 */
export async function invokeThemeCommand<T>(command: string, args?: Parameters<typeof invoke>[1]): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (cause) {
    if (cause === "theme-file-conflict") throw new UiMessageError("themes.fileConflict");
    if (typeof cause === "string" && cause.startsWith("theme-directory-unwritable:")) {
      throw new UiMessageError("backend.theme_store.program_style_write_error", {
        error: cause.slice("theme-directory-unwritable:".length),
      });
    }
    throw cause;
  }
}
