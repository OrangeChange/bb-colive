import type { ThemeDocument } from "../../themes/themeTypes.ts";
import { composeCompatibleCssLayers } from "../../themes/compatibleThemeCascade.ts";
import { materializeCompatibleVisualCss } from "../../themes/compatManagedCss.ts";
import { BLIVECHAT_CAPABILITY, createBlivechatBaseCss, type BlivechatRuntimeSettings } from "./theme.ts";

export function composeBlivechatThemeCss(document: ThemeDocument): string {
  const visual = materializeCompatibleVisualCss(document as ThemeDocument & { settings: BlivechatRuntimeSettings }, BLIVECHAT_CAPABILITY);
  return "@layer yt;\n" + composeCompatibleCssLayers([[document.styles.baseCss, "default"], [createBlivechatBaseCss(document.settings as BlivechatRuntimeSettings, document.styles.baseCss), "config"], [visual, "config"], [document.styles.customCss, "custom"]]) + `\n@layer yt { #message.yt-live-chat-text-message-renderer { line-height: ${16 / 13}; } }`;
}
