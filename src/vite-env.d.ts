/// <reference types="vite/client" />

declare const __DANMU_BUILD_ID__: string;

declare module "video-animation-player" {
  interface VapOptions {
    container: HTMLElement;
    src: string;
    config: string | Record<string, unknown>;
    width?: number;
    height?: number;
    loop: boolean;
    mute?: boolean;
    precache?: boolean;
    accurate: boolean;
    onLoadError?: (error: ErrorEvent) => void;
  }

  interface VapPlayer {
    once(event: "ended", listener: () => void): VapPlayer;
    destroy(): void;
  }

  const createVapPlayer: (options?: VapOptions) => VapPlayer;
  export default createVapPlayer;
}
