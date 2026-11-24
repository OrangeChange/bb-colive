import { uiText } from "../i18n/index.ts";
import valueParser from "postcss-value-parser";

export function fontFamilyPresentation(value: string): { label: string; title: string } {
  if (value.trim() === "inherit") return { label: uiText("fontFamilyPresentation.fontFamilyPresentation.label"), title: uiText("fontFamilyPresentation.fontFamilyPresentation.title") };
  const families: string[] = [];
  let current = "";
  for (const node of valueParser(value).nodes) {
    if (node.type === "div" && node.value === ",") {
      if (current.trim()) families.push(current.trim());
      current = "";
    } else current += node.type === "string" ? node.value : valueParser.stringify(node);
  }
  if (current.trim()) families.push(current.trim());
  const [first = value, ...fallbacks] = families;
  return {
    label: fallbacks.length ? uiText("fontFamilyPresentation.fontFamilyPresentation.label2", { first: first, length: fallbacks.length }) : first,
    title: uiText("fontFamilyPresentation.fontFamilyPresentation.title2", { first: first, value: fallbacks.length ? uiText("fontFamilyPresentation.fontFamilyPresentation.title.value", { value: fallbacks.join(" → ") }) : "" }),
  };
}
