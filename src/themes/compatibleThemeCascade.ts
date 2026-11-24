import safeParse from "postcss-safe-parser";
import { assignNativeCssLayer } from "./nativeThemeCascade.ts";

const composedSources = new Map<string, { sources: string[]; css: string }>();

export function composeCompatibleCssLayers(sources: [string, "default" | "config" | "custom"][]): string {
  const key = sources.map(([, layer]) => layer).join(",");
  const previous = composedSources.get(key);
  if (previous && sources.every(([source], index) => source === previous.sources[index])) return previous.css;
  const prelude: string[] = [];
  const rules = sources.map(([source, layer]) => {
    const root = safeParse(assignNativeCssLayer(source, layer));
    let inPrelude = true;
    for (const node of [...root.nodes]) {
      const name = node.type === "atrule" ? node.name.toLowerCase() : "";
      if (name === "import" || inPrelude && node.type === "atrule" && name === "layer" && !node.nodes) {
        prelude.push(`${node.toString()};`);
        node.remove();
      } else if (node.type !== "comment" && name !== "charset") {
        inPrelude = false;
      }
    }
    return root.toString();
  });
  const css = ["@layer default, config, custom;", ...prelude, ...rules].filter(Boolean).join("\n\n");
  composedSources.set(key, { sources: sources.map(([source]) => source), css });
  return css;
}

