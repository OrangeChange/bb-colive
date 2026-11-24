import { Columns2 } from "lucide-react";
import type { SceneLayoutMode } from "./sceneLayout";

export function SceneLayoutIcon({ mode, size = 16 }: { mode: SceneLayoutMode; size?: number }) {
  return <Columns2 size={size} strokeWidth={2} aria-hidden="true">
    {mode === "partition" && <>
      <path d="M3 12h9" />
      <path d="M12 9h9" />
      <path d="M12 15h9" />
    </>}
  </Columns2>;
}
