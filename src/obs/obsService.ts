import { invoke } from "@tauri-apps/api/core";
export interface ObsServiceStatus {
  port: number;
  running: boolean;
  error?: string;
  clients: number;
}
export const obsServiceStatus = () =>
  invoke<ObsServiceStatus>("obs_service_status");
export const obsOutputUrl = (
  port: number,
  config: { id: string; roomId: string; themeId: string },
) =>
  `http://127.0.0.1:${port}/obs?${new URLSearchParams({ config: config.id })}`;
export async function startObsHost(): Promise<() => void> {
  return (await import("./obsHost.ts")).startObsHost();
}
export async function refreshObsConfigurations() {
  const { emit } = await import("@tauri-apps/api/event");
  await emit("obs:configurations-changed");
}
