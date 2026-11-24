import type { ThemeDocument } from "../../themes/themeTypes.ts";
import { composeCompatibleCssLayers } from "../../themes/compatibleThemeCascade.ts";
import { materializeCompatibleVisualCss } from "../../themes/compatManagedCss.ts";
import { OPENLIVE_CAPABILITY, type OpenLiveRuntimeSettings } from "./theme.ts";
import { OPENLIVE_SOURCE_CSS } from "./source.ts";

export const OPENLIVE_ADAPTER_CSS = `
html, body, #app {
  background: transparent;
}
yt-live-chat-renderer {
  --yt-live-chat-background-color: transparent;
  background: transparent;
}
yt-live-chat-renderer #chat,
yt-live-chat-renderer #contents,
yt-live-chat-item-list-renderer,
yt-live-chat-item-list-renderer #item-scroller,
yt-live-chat-item-list-renderer #items {
  background: transparent;
}
yt-live-chat-item-list-renderer #item-scroller {
  scrollbar-color: rgba(125, 143, 137, .72) transparent;
  scrollbar-width: thin;
}
body[data-bb-host-managed="true"] #item-scroller.yt-live-chat-item-list-renderer { overflow-y: auto !important; justify-content: flex-start !important; }
body[data-bb-host-managed="true"] #item-offset.yt-live-chat-item-list-renderer { height: auto !important; flex: none !important; }
body[data-bb-host-managed="true"][data-bb-host-direction="bottom"] #item-offset.yt-live-chat-item-list-renderer { margin-top: auto; }
body[data-bb-host-managed="true"] #item-scroller.animated.yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer { position: relative !important; inset: auto !important; transform: none !important; flex: none !important; }
yt-live-chat-item-list-renderer #item-scroller::-webkit-scrollbar { width: 6px; height: 6px; }
yt-live-chat-item-list-renderer #item-scroller::-webkit-scrollbar-thumb { background: rgba(125, 143, 137, .72); border-radius: 3px; }
yt-live-chat-item-list-renderer #item-scroller::-webkit-scrollbar-track { background: transparent; }
body[data-bb-host-render-mode="output"] #item-scroller.yt-live-chat-item-list-renderer { scrollbar-width: none; }
body[data-bb-host-render-mode="output"] #item-scroller.yt-live-chat-item-list-renderer::-webkit-scrollbar { display: none; width: 0; height: 0; }
yt-live-chat-ticker-renderer { width: var(--bb-list-content-width, 100%) !important; max-width: 100%; }
yt-live-chat-ticker-renderer,
yt-live-chat-ticker-renderer > #container {
  background: transparent;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
yt-live-chat-ticker-renderer #items {
  width: max-content !important;
  min-width: 100%;
  overflow: visible !important;
}
yt-live-chat-ticker-renderer > #container::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
yt-live-chat-text-message-renderer #timestamp,
yt-live-chat-paid-message-renderer #timestamp,
yt-live-chat-membership-item-renderer #timestamp {
  display: var(--yt-live-chat-item-timestamp-display, none) !important;
  font-size: 11px;
  line-height: 11px;
}
:where(#chat-items > [data-event-motion]) { animation: none; }
`;

const NAMED_SKIN_MARKER = "/* Transparent background */";

export function materializeOpenLiveSourceCss(source: string, skin: "none" | "default" = "none"): string {
  const marker = source.indexOf(NAMED_SKIN_MARKER);
  if (marker < 0) return source;
  return skin === "default" ? source : source.slice(0, marker).trimEnd();
}

export function createOpenLiveAppearanceCss(document: ThemeDocument): string {
  const visual = materializeCompatibleVisualCss(document as ThemeDocument & { settings: OpenLiveRuntimeSettings }, OPENLIVE_CAPABILITY);
  const settings = document.settings as Partial<OpenLiveRuntimeSettings>;
  const visibility = [
    settings.showAvatar === false ? ':where(#author-photo){display:none!important}' : '',
    settings.showUsername === false ? ':where(#author-name){display:none!important}' : '',
    settings.showMedal === false ? ':where(yt-live-chat-author-medal-renderer){display:none!important}' : '',
    settings.showGuardBadge === false ? ':where(yt-live-chat-author-badge-renderer #image > img){display:none!important}' : '',
    settings.showModBadge === false ? ':where(yt-live-chat-author-badge-renderer #image > yt-icon){display:none!important}' : '',
    settings.showMedalLightenedOnly !== false ? '[data-openlive-medal-lighted="false"] :where(yt-live-chat-author-medal-renderer){display:none!important}' : '',
    settings.showMedalCurrentRoomOnly === true ? '[data-openlive-medal-current-room="false"] :where(yt-live-chat-author-medal-renderer){display:none!important}' : '',
  ].filter(Boolean).join('\n');
  return composeCompatibleCssLayers([[OPENLIVE_ADAPTER_CSS, "config"], [visual, "config"], [visibility, "config"]]);
}

export function createOpenLiveDocumentCss(document: ThemeDocument): { appearanceCss: string; css: string } {
  const overriddenBase = document.styles.baseCss && document.styles.baseCss !== OPENLIVE_SOURCE_CSS
    ? document.styles.baseCss
    : "";
  return {
    appearanceCss: createOpenLiveAppearanceCss(document),
    css: composeCompatibleCssLayers([[overriddenBase, "default"], [document.styles.customCss, "custom"]]),
  };
}

export function composeOpenLiveThemeCss(document: ThemeDocument): string {
  const settings = document.settings as Partial<OpenLiveRuntimeSettings>;
  const source = document.styles.baseCss && document.styles.baseCss !== OPENLIVE_SOURCE_CSS
    ? document.styles.baseCss
    : materializeOpenLiveSourceCss(OPENLIVE_SOURCE_CSS, settings.skin === "default" ? "default" : "none");
  return composeCompatibleCssLayers([[source, "default"], [createOpenLiveAppearanceCss(document), "config"], [document.styles.customCss, "custom"]]);
}
