import type { TemplateSegment } from "./voiceTypes.ts";

/** 返回调整了片段顺序的新模板，不修改当前模板数组。 */
export function moveTemplateSegment(segments: TemplateSegment[], from: number, to: number): TemplateSegment[] {
  if (from < 0 || from >= segments.length || to < 0 || to >= segments.length || from === to) return segments;
  const next = [...segments];
  const [segment] = next.splice(from, 1);
  if (!segment) return segments;
  next.splice(to, 0, segment);
  return next;
}

/**
 * 确保模板首尾以及相邻动态字段之间都有连续可编辑的文字区。
 * 文字区本身就是模板的一部分，因此用户无需点击额外按钮才能输入固定文案。
 */
export function ensureTemplateTextGaps(segments: TemplateSegment[], preserveAdjacentText = false): TemplateSegment[] {
  if (segments.length === 0) return [{ kind: "text", value: "" }];

  const next: TemplateSegment[] = [];
  if (segments[0]?.kind !== "text") next.push({ kind: "text", value: "" });

  for (const segment of segments) {
    const previous = next[next.length - 1];
    if (!preserveAdjacentText && previous?.kind === "text" && segment.kind === "text") {
      next[next.length - 1] = { kind: "text", value: previous.value + segment.value };
      continue;
    }
    if (previous?.kind === "field" && segment.kind === "field") next.push({ kind: "text", value: "" });
    next.push(segment);
  }

  if (next[next.length - 1]?.kind !== "text") next.push({ kind: "text", value: "" });
  return next;
}
