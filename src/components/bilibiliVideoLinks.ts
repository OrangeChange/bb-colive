export type BilibiliVideoTextPart =
  | { type: "text"; value: string }
  | { type: "video"; value: string; href: string };

const BILIBILI_VIDEO_ID_RE = /(?<![0-9A-Za-z])((?:av\d+|bv[0-9A-Za-z]{10}))(?![0-9A-Za-z])/gi;

function videoHref(value: string): string {
  const prefix = value.slice(0, 2).toLowerCase();
  const id = prefix === "av" ? `av${value.slice(2)}` : `BV${value.slice(2)}`;
  return `https://www.bilibili.com/video/${id}`;
}
/** 将正文拆成普通文本和可打开的 B 站视频号，保留原文顺序。 */
export function splitBilibiliVideoText(text: string): BilibiliVideoTextPart[] {
  const parts: BilibiliVideoTextPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(BILIBILI_VIDEO_ID_RE)) {
    const value = match[1];
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ type: "text", value: text.slice(lastIndex, index) });
    parts.push({ type: "video", value, href: videoHref(value) });
    lastIndex = index + value.length;
  }

  if (lastIndex < text.length) parts.push({ type: "text", value: text.slice(lastIndex) });
  return parts;
}
