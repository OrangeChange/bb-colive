import { useEffect, useRef } from 'react';
import { createStylePreviewPlayback } from './stylePreviewPlayback.ts';

export function useStylePreviewPlayback(options: {
  enabled: boolean; playing: boolean; speed: number; scope: string;
  reset(session: string): void;
  next(sequence: number, session: string): void;
}) {
  const latest = useRef(options); latest.current = options;
  const session = useRef('');
  const sequence = useRef(0);
  const playback = useRef<ReturnType<typeof createStylePreviewPlayback> | null>(null);
  useEffect(() => {
    if (!options.enabled) return;
    const key = crypto.randomUUID(); session.current = key; sequence.current = 0;
    latest.current.reset(key);
    return () => { session.current = ''; playback.current?.stop(); };
  }, [options.enabled, options.scope]);
  useEffect(() => {
    if (!options.enabled || !options.playing) return;
    const key = session.current;
    const controller = createStylePreviewPlayback(() => {
      if (session.current === key) latest.current.next(++sequence.current, key);
    });
    playback.current = controller;
    controller.start(latest.current.speed);
    return () => { controller.stop(); playback.current = null; };
  }, [options.enabled, options.playing, options.scope]);
  useEffect(() => { playback.current?.setSpeed(options.speed); }, [options.speed]);
}
