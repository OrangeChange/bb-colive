const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const SMALL_UNITS = ["", "十", "百", "千"];
const LARGE_UNITS = ["", "万", "亿", "兆", "京"];

function formatGroup(value: number, useLiangForUnit = false, omitLeadingOneForTen = false): string {
  let result = "";
  let pendingZero = false;

  for (let position = 3; position >= 0; position -= 1) {
    const digit = Math.floor(value / (10 ** position)) % 10;
    if (digit === 0) {
      if (result) pendingZero = true;
      continue;
    }

    if (pendingZero) {
      result += "零";
      pendingZero = false;
    }

    const isLeadingTen = omitLeadingOneForTen && position === 1 && digit === 1 && result === "";
    const useLiang = digit === 2 && (position >= 2 || (position === 0 && useLiangForUnit));
    if (!isLeadingTen) result += useLiang ? "两" : DIGITS[digit];
    result += SMALL_UNITS[position];
  }

  return result;
}

/**
 * 将事件中的整数数量转换成适合中文语音播报的数位读法。
 * 百位及以上的最高位 2 使用“两”，20~29 仍使用“二十”。
 */
export function formatChineseSpeechNumber(value: number | string): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) return String(value);
  if (numeric === 0) return "零";
  if (numeric === 2) return "两";

  const groups: number[] = [];
  let remaining = numeric;
  while (remaining > 0) {
    groups.push(remaining % 10000);
    remaining = Math.floor(remaining / 10000);
  }

  let result = "";
  let pendingZero = false;
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group === 0) {
      if (result) pendingZero = true;
      continue;
    }

    if (result && (pendingZero || group < 1000)) result += "零";
    result += formatGroup(group, index > 0, index === groups.length - 1) + (LARGE_UNITS[index] ?? "");
    pendingZero = false;
  }

  return result;
}
