export function parseLaplaceObsScene(name: string): { sceneName?: string; dark: boolean } {
  const sceneName = name.match(/\[\s*scene\s*:\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*\]/)?.[1];
  return { ...(sceneName ? { sceneName } : {}), dark: name.includes('[dark]') };
}
export function subscribeLaplaceObsScene(target: Window, notify: (scene: ReturnType<typeof parseLaplaceObsScene>) => void): () => void {
  const api = (target as Window & { obsstudio?: { getControlLevel(callback: (level: number) => void): void; getCurrentScene(callback: (scene: {name?: string}) => void): void } }).obsstudio;
  if (!api?.getCurrentScene) return () => {};
  let disposed = false, changed = false;
  const receive = (scene: {name?: string}) => { if (!disposed && typeof scene?.name === 'string') notify(parseLaplaceObsScene(scene.name)); };
  const listener = (event: Event) => { changed = true; receive((event as CustomEvent).detail); };
  try {
    api.getControlLevel(level => {
      if (disposed || typeof level !== 'number' || level < 2) return;
      target.addEventListener('obsSceneChanged', listener);
      try { api.getCurrentScene(scene => { if (!changed) receive(scene); }); } catch { /* Keep the software presentation when permission is unavailable. */ }
    });
  } catch { /* Keep the software presentation when permission is unavailable. */ }
  return () => { disposed = true; target.removeEventListener('obsSceneChanged', listener); };
}
