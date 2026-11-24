import postcss from "postcss";

function scopeSelector(selector: string, scope: string): string {
  const value = selector.trim();
  if (value.startsWith(scope)) return value;
  if (/^(?::root|html|body)(?=$|[\s.#:\[])/.test(value)) return value.replace(/^(?::root|html|body)/, scope);
  return `${scope} ${value}`;
}

export function scopeBlivechatCss(css: string, scopeId: string): string {
  const escaped = scopeId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const scope = `[data-blivechat-scope="${escaped}"]`;
  const root = postcss.parse(css);
  const suffix = scopeId.replace(/[^a-z0-9_-]/gi, "-");
  const animations = new Map<string, string>();
  root.walkAtRules(atRule => {
    if (!/keyframes$/i.test(atRule.name)) return;
    const original = atRule.params.trim();
    const scoped = `${original}--${suffix}`;
    animations.set(original, scoped);
    atRule.params = scoped;
  });
  root.walkDecls(declaration => {
    if (declaration.prop === "animation-name") declaration.value = postcss.list.comma(declaration.value).map(value => animations.get(value.trim()) ?? value).join(", ");
    if (declaration.prop === "animation") {
      for (const [original, scoped] of animations) declaration.value = declaration.value.replace(new RegExp(`(^|\\s|,)${original.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?=\\s|,|$)`, "g"), `$1${scoped}`);
    }
  });
  root.walkRules(rule => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    rule.selector = postcss.list.comma(rule.selector).map(selector => scopeSelector(selector, scope)).join(",\n");
  });
  return root.toString();
}
