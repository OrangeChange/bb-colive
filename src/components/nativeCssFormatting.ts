import { uiText } from "../i18n/index.ts";
export async function commitFormattedCss<TLayer extends string>(
  layer: TLayer,
  source: string,
  format: (source: string) => Promise<string>,
  write: (layer: TLayer, formatted: string) => void,
): Promise<void> {
  write(layer, await format(source));
}

type CssErrorPosition = { line: number; column: number };

function getCssErrorPosition(error: unknown): CssErrorPosition | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { line?: unknown; column?: unknown; loc?: { start?: { line?: unknown; column?: unknown } } };
  const line = value.loc?.start?.line ?? value.line;
  const column = value.loc?.start?.column ?? value.column;
  if (typeof line !== "number" || typeof column !== "number" || line < 1 || column < 1) return null;
  return { line, column };
}

export function handleCssFormatError<TLayer extends string>(layer: TLayer, error: unknown, goToPosition: (layer: TLayer, line: number, column: number) => void): string {
  const position = getCssErrorPosition(error);
  if (position) goToPosition(layer, position.line, position.column);
  return error instanceof Error ? error.message : uiText("nativeCssFormatting.handleCssFormatError");
}
