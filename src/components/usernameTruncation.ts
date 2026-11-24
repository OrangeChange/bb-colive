const segmenter = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });

export function fitUsername(name: string, width: number, measure: (text: string) => number) {
  if (measure(name) <= width) return { text: name, truncated: false };
  const characters = [...segmenter.segment(name)].map(({ segment }) => segment);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(`${characters.slice(0, middle).join("")}...`) <= width) low = middle;
    else high = middle - 1;
  }
  return { text: characters.slice(0, low).join(""), truncated: true };
}
