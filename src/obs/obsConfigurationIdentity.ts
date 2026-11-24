const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const isObsConfigurationId = (id: string) => /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/.test(id);

export function createObsConfigurationId(existing: Iterable<string> = []): string {
  const used = new Set(existing);
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let id = "";
    for (const byte of bytes) {
      if (byte >= Math.floor(256 / ALPHABET.length) * ALPHABET.length) continue;
      id += ALPHABET[byte % ALPHABET.length];
      if (id.length === 8) break;
    }
    if (id.length === 8 && !used.has(id)) return id;
  }
}

export type OutputScheme = "follow" | "light" | "dark";
export function resolveOutputScheme(software: "light" | "dark", configured: OutputScheme = "follow", override?: string, scene?: {dark:boolean}): "light" | "dark" {
  if (override === "light" || override === "dark") return override;
  if (configured !== "follow") return configured;
  return scene ? scene.dark ? "dark" : "light" : software;
}
