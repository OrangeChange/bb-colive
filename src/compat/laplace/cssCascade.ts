import { composeCompatibleCssLayers } from "../../themes/compatibleThemeCascade.ts";
import postcss from "postcss";

export const LAPLACE_LAYER_ORDER = "@layer default, config, custom;";

/** Keep the source's named layers and unlayered rules in their original order. */
export function laplaceSourceLayer(css: string): string {
  return css.trim() ? `@layer default {\n${css}\n}` : "";
}

const sourcePartsCache = new Map<string, { imports: string; rules: string }>();

function rememberSourceParts(css: string, parts: { imports: string; rules: string }) {
  if (sourcePartsCache.size === 4) sourcePartsCache.delete(sourcePartsCache.keys().next().value!);
  sourcePartsCache.set(css, parts);
  return parts;
}

function sourceParts(css: string): { imports: string; rules: string } {
  const cached = sourcePartsCache.get(css);
  if (cached) return cached;
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch {
    // Catalog CSS also contains browser-recoverable declarations.
    return rememberSourceParts(css, { imports: "", rules: css });
  }
  const imports: string[] = [];
  for (const node of [...root.nodes]) {
    if (node.type !== "atrule" || node.name.toLowerCase() !== "import") continue;
    node.params = node.params.replace(/\blayer\(([^)]+)\)/i, (_, name: string) => `layer(default.${name})`);
    imports.push(`${node.toString()};`);
    node.remove();
  }
  return rememberSourceParts(css, { imports: imports.join("\n"), rules: root.toString() });
}

export function composeLaplaceCssLayers(source: string, base: string, config: string, custom: string) {
  const parts = [source, base].map(sourceParts);
  return {
    cloud: [composeCompatibleCssLayers(parts.map(part => [part.imports, "default"])), laplaceSourceLayer(parts.map(part => part.rules).filter(Boolean).join("\n\n"))].filter(Boolean).join("\n\n"),
    remote: "",
    custom: composeCompatibleCssLayers([[config, "config"], [custom, "custom"]]),
  };
}

export function composeLaplaceExportCss(source: string, base: string, config: string, custom: string): string {
  const parts = [source, base].map(sourceParts);
  const root = postcss.parse(composeCompatibleCssLayers([
    ...parts.map(part => [part.imports, "default"] as [string, "default"]),
    [config, "config"],
    [custom, "custom"],
  ]));
  const prelude: string[] = [];
  for (const node of [...root.nodes]) {
    if (node.type === "comment") continue;
    if (node.type !== "atrule" || !(node.name.toLowerCase() === "import" || node.name.toLowerCase() === "layer" && !node.nodes)) break;
    prelude.push(`${node.toString()};`);
    node.remove();
  }
  return [...prelude, laplaceSourceLayer(parts.map(part => part.rules).filter(Boolean).join("\n\n")), root.toString()].filter(Boolean).join("\n\n");
}

/** Host presentation rules arrive after the already layered theme CSS. */
export function composeLaplaceFrameCustomCss(css: string): string {
  return composeCompatibleCssLayers([[css, "default"]]);
}
