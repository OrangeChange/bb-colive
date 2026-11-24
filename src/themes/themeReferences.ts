import type { ThemeBinding } from "./themeBindings.ts";
import type { ThemeDocument } from "./themeTypes.ts";
import { windowThemeLabel } from "./windowThemeTargets.ts";

export interface ThemeReference extends ThemeBinding {
  label: string;
}

function referenceLabel(binding: ThemeBinding): string {
  if (binding.targetKind === "live") return "现场";
  if (binding.targetKind === "windows") return binding.targetId === "windows" ? "副窗口" : windowThemeLabel(binding.targetId);
  return `OBS 配置 ${binding.targetId}`;
}

export function listThemeReferences(themeId: string, bindings: ThemeBinding[]): ThemeReference[] {
  return bindings
    .filter(binding => binding.themeId === themeId)
    .map(binding => ({ ...binding, label: referenceLabel(binding) }));
}

export async function saveThemeDocument(
  document: ThemeDocument,
  save: (document: ThemeDocument) => Promise<ThemeDocument | void>,
): Promise<ThemeDocument> {
  return await save(document) ?? document;
}

export async function saveAndUpdateThemeReferences(document: ThemeDocument, ports: {
  save(document: ThemeDocument): Promise<ThemeDocument>;
  bindings(): Promise<ThemeBinding[]>;
  publish(document: ThemeDocument, binding: ThemeBinding): Promise<void>;
}): Promise<ThemeDocument> {
  const saved = await ports.save(document);
  const references = listThemeReferences(saved.themeId, await ports.bindings());
  const failures: Array<{ binding: ThemeBinding; message: string }> = [];
  for (const reference of references) {
    try { await ports.publish(saved, reference); }
    catch (cause) { failures.push({ binding: reference, message: `${reference.label}：${cause instanceof Error ? cause.message : String(cause)}` }); }
  }
  if (failures.length) throw new ThemeReferenceUpdateError(saved, failures);
  return saved;
}

export class ThemeReferenceUpdateError extends Error {
  readonly saved: ThemeDocument;
  constructor(saved: ThemeDocument, readonly failures: Array<{ binding: ThemeBinding; message: string }>) {
    super(`主题已保存，但部分目标未更新。${failures.map(item => item.message).join("；")}。请重试更新。`);
    this.name = "ThemeReferenceUpdateError";
    this.saved = structuredClone(saved);
  }
}

export async function retryThemeReferences(previous: ThemeReferenceUpdateError, ports: {
  bindings(): Promise<ThemeBinding[]>;
  publish(document: ThemeDocument, binding: ThemeBinding): Promise<void>;
}): Promise<string[]> {
  const bindings = await ports.bindings();
  const failures: Array<{ binding: ThemeBinding; message: string }> = [];
  const skipped: string[] = [];
  for (const item of previous.failures) {
    const current = bindings.find(binding => binding.targetId === item.binding.targetId && binding.targetKind === item.binding.targetKind);
    if (!current || current.themeId !== previous.saved.themeId || (current.revision !== item.binding.revision && current.revision > previous.saved.revision)) { skipped.push(referenceLabel(item.binding)); continue; }
    try { await ports.publish(previous.saved, current); }
    catch (cause) { failures.push({ binding: current, message: `${referenceLabel(current)}：${cause instanceof Error ? cause.message : String(cause)}` }); }
  }
  if (failures.length) throw new ThemeReferenceUpdateError(previous.saved, failures);
  return skipped;
}
