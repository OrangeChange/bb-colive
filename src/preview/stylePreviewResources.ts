import type { StylePreviewMessage } from "./stylePreviewProtocol.ts";
export type StylePreviewWireMessage = StylePreviewMessage & {
  resources?: Record<string, string>;
  resetResources?: boolean;
};
const dataUrl = /data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g;
function mapCss(
  value: unknown,
  replace: (css: string) => string,
  key = "",
): unknown {
  if (typeof value === "string")
    return key.toLowerCase().includes("css") ? replace(value) : value;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        mapCss(item, replace, name),
      ]),
    );
  return value;
}
export function createPreviewResourceSender() {
  const resources = new Map<string, string>();
  let owner: string | undefined;
  return (
    message: StylePreviewMessage,
    initial = false,
  ): StylePreviewWireMessage => {
    if (message.type === "preview:clear") {
      resources.clear();
      owner = undefined;
      return message;
    }
    if (
      message.type !== "preview:replace" &&
      message.type !== "preview:configure"
    )
      return message;
    const reset = initial || owner !== message.state.ownerId;
    if (reset) resources.clear();
    owner = message.state.ownerId;
    const added: Record<string, string> = {};
    const state = mapCss(message.state, (css) =>
      css.replace(dataUrl, (url) => {
        let id = resources.get(url);
        if (id === undefined) {
          id = String(resources.size);
          resources.set(url, id);
          added[id] = url;
        }
        return `data:application/x-style-preview,${id}`;
      }),
    ) as typeof message.state;
    return {
      ...message,
      state,
      ...(reset ? { resetResources: true } : {}),
      ...(Object.keys(added).length ? { resources: added } : {}),
    } as StylePreviewWireMessage;
  };
}
function normalizePreviewAssetUrls(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    const html = value.replace(
      /(src=["'])https?:\/\/tauri\.localhost(\/(?:blivechat|openlive|laplace|media)\/)/g,
      "$1$2",
    );
    return !/^(text|message|content|description)$/i.test(key)
      ? html.replace(
          /^https?:\/\/tauri\.localhost(\/(?:blivechat|openlive|laplace|media)\/)/,
          "$1",
        )
      : html;
  }
  if (Array.isArray(value))
    return value.map((item) => normalizePreviewAssetUrls(item, key));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        normalizePreviewAssetUrls(item, name),
      ]),
    );
  return value;
}
export function createPreviewResourceReceiver() {
  let resources: Record<string, string> = {};
  return (message: StylePreviewWireMessage): StylePreviewMessage => {
    message = normalizePreviewAssetUrls(message) as StylePreviewWireMessage;
    if (message.type === "preview:clear") {
      resources = {};
      return message;
    }
    if (
      message.type !== "preview:replace" &&
      message.type !== "preview:configure"
    )
      return message;
    if (message.resetResources) resources = {};
    Object.assign(resources, message.resources);
    const state = mapCss(message.state, (css) =>
      css.replace(
        /data:application\/x-style-preview,(\d+)/g,
        (value, id) => resources[id] ?? value,
      ),
    ) as typeof message.state;
    return { type: message.type, state } as StylePreviewMessage;
  };
}
