export interface ThemeCssMetadata {
  title?: string;
  author?: string;
  version?: string;
  updated?: string;
}

export function parseThemeCssMetadata(css: string): ThemeCssMetadata {
  const header = css.match(/^(?:\s*\/\*[\s\S]*?\*\/)+/)?.[0] ?? '';
  const metadata: ThemeCssMetadata = {};
  for (const match of header.matchAll(/^\s*\*?\s*@(title|author|version|updated)\s+(.+)$/gm)) metadata[match[1] as keyof ThemeCssMetadata] = match[2].trim();
  return metadata;
}
