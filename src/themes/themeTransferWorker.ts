import { zipSync } from "fflate";
import { decodeThemeImport, decodeThemePackage, themePackageError } from "./themePackageCodec.ts";

self.onmessage = (event: MessageEvent<
  | { kind: "zip"; entries: Record<string, Uint8Array>; level: number }
  | { kind: "import" | "import-many"; bytes: Uint8Array }
>) => {
  if (event.data.kind === "zip") {
    const bytes = zipSync(event.data.entries, { level: event.data.level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 });
    self.postMessage(bytes, { transfer: [bytes.buffer] });
    return;
  }
  try {
    self.postMessage({ ok: true, value: event.data.kind === "import-many" ? decodeThemeImport(event.data.bytes) : decodeThemePackage(event.data.bytes) });
  } catch (error) {
    self.postMessage({ ok: false, error: themePackageError(error) });
  }
};
