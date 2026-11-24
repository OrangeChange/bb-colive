import postcss from "postcss";

export function scopeThemeCss(source: string, scope: string): string {
  if (!source.trim()) return "";
  const root = postcss.parse(source);
  const authoredScopes: postcss.AtRule[] = [];
  root.walkAtRules(/^scope$/i, node => {
    let ancestor = node.parent;
    while (ancestor && ancestor.type !== "root") {
      if (ancestor.type === "rule" || (ancestor.type === "atrule" && ancestor.name.toLowerCase() === "scope")) return;
      ancestor = ancestor.parent;
    }
    authoredScopes.push(node);
  });
  for (const node of authoredScopes) {
    node.params = node.params
      ? node.params
        .replace(/([(,])\s*(?:(?:html|:root))?(\.(?:dark|light))(?=\s|,|[)])/g, "$1:scope:where($2, $2 *)")
        .replace(/([(,])\s*(?:body|html|:root)(?=\s|,|[)])/g, "$1:scope")
      : "(:scope)";
    const start = postcss.list.space(node.params)[0];
    if (start?.startsWith("(") && start.endsWith(")")) {
      node.params = `(:is(:scope, :scope *):is(${start.slice(1, -1)}))${node.params.slice(start.length)}`;
    }
    const boundary = postcss.atRule({ name: "scope", params: `(${scope})` });
    node.replaceWith(boundary);
    boundary.append(node);
  }
  root.walkRules(rule => {
    let ancestor = rule.parent;
    while (ancestor && ancestor.type !== "root") {
      if (ancestor.type === "rule" || (ancestor.type === "atrule" && (ancestor.name.toLowerCase() === "scope" || /keyframes$/i.test(ancestor.name)))) return;
      ancestor = ancestor.parent;
    }
    const roots: string[] = [];
    const rootSelector = (selector: string, boundary: string) => {
      const index = selector.indexOf("::");
      const subject = index < 0 ? selector : selector.slice(0, index);
      const pseudo = index < 0 ? "" : selector.slice(index);
      return `${boundary}:is(${subject || "*"})${pseudo}`;
    };
    rule.selectors = rule.selectors.map(selector => {
      const trimmed = selector.trim();
      const boundary = `:where(${scope})`;
      const rootMatch = trimmed.match(/^(:root|html|body)(?=$|\s|::)(.*)$/);
      const mapped = rootMatch ? `${boundary}:is(${rootMatch[1]}, *)${rootMatch[2]}` : trimmed;
      if (rootMatch && !rootMatch[2].trim()) return mapped;
      const subject = rootSelector(mapped, "");
      roots.push(`${boundary}${subject}`);
      return `${boundary} ${subject}`;
    }).concat(roots);
  });
  return root.toString();
}

