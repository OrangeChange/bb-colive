import { Settings as LucideSettings } from "lucide-react";
export const railButton = "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";
export const railButtonIdle = `${railButton} text-t2 hover:bg-raised hover:text-t1`;
export const railButtonDisabled = `${railButton} text-t3 cursor-not-allowed`;

export function IconSettings() {
  return (
    <LucideSettings className="size-5" />
  );
}
