import valueParser from "postcss-value-parser";

export function fontFamilyPresentation(value: string): { label: string; title: string } {
  if (value.trim() === "inherit") return { label: "继承主题", title: "继承主题字体" };
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
    label: fallbacks.length ? `${first} · ${fallbacks.length} 个后备字体` : first,
    title: `首选：${first}${fallbacks.length ? `\n后备：${fallbacks.join(" → ")}` : ""}`,
  };
}
