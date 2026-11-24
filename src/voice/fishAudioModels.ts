export interface FishReferenceVoice {
  id: string;
  name: string;
  author?: string;
  languages?: string[];
}

export const DEFAULT_FISH_REFERENCE_VOICES: FishReferenceVoice[] = [
  { id: "b255ca2902514f69bc22243436a94e4f", name: "曼波" },
  { id: "33f931ec7a8749c88cda37f1100a4809", name: "豆包" },
  { id: "eacc56f8ab48443fa84421c547d3b60e", name: "派蒙" },
  { id: "b4f70fdef5f943c2bf43db00e80ad680", name: "高松灯（企鹅）" },
  { id: "4ca68a299cb24ae599dbb828dc31a73c", name: "井芹仁菜" },
  { id: "434587bd27be4faabee6aa26cb721678", name: "塔菲" },
];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null
);

export function normalizeFishReferenceVoice(value: unknown): FishReferenceVoice | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const id = value.id.trim();
  if (!id) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const author = typeof value.author === "string" && value.author.trim() ? value.author.trim() : undefined;
  const languages = Array.isArray(value.languages)
    ? value.languages.filter((language): language is string => typeof language === "string" && language.trim().length > 0).map((language) => language.trim())
    : undefined;
  return {
    id,
    name: name || "未命名音色",
    ...(author ? { author } : {}),
    ...(languages && languages.length > 0 ? { languages } : {}),
  };
}

export function normalizeFishReferenceVoices(value: unknown): FishReferenceVoice[] {
  if (!Array.isArray(value)) return [];
  const result: FishReferenceVoice[] = [];
  for (const item of value) {
    const voice = normalizeFishReferenceVoice(item);
    if (!voice || result.some((current) => current.id === voice.id)) continue;
    result.push(voice);
  }
  return result;
}

export function upsertFishReferenceVoice(voices: FishReferenceVoice[], voice: FishReferenceVoice): FishReferenceVoice[] {
  const normalized = normalizeFishReferenceVoice(voice);
  if (!normalized) return voices;
  const index = voices.findIndex((current) => current.id === normalized.id);
  if (index < 0) return [...voices, normalized];
  return voices.map((current, currentIndex) => currentIndex === index ? normalized : current);
}

export function removeFishReferenceVoice(voices: FishReferenceVoice[], id: string): FishReferenceVoice[] {
  const normalizedId = id.trim();
  return voices.filter((voice) => voice.id !== normalizedId);
}
