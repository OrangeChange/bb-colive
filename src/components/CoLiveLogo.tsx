import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { useTheme } from '../theme';
import { resolveCoLiveColors, type CoLiveState } from '../coliveLogo';
import live from '../assets/colive/live.svg?raw';
import rest from '../assets/colive/rest.svg?raw';
import idle from '../assets/colive/idle.svg?raw';
import connecting from '../assets/colive/connecting.svg?raw';
import error from '../assets/colive/error.svg?raw';
import animation from '../assets/colive/about-animation.svg?raw';

const sources = { live, rest, idle, connecting, error };

export function CoLiveLogo({ state = 'live', animated = false, className = '' }: { state?: CoLiveState; animated?: boolean; className?: string }) {
  const instance = 'colive' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { palette, customColor } = useTheme();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  }, []);
  const colors = resolveCoLiveColors(palette === 'custom' ? customColor : palette === 'pine' ? '#4c9a8d' : '#fb7299', dark ? 'dark' : 'light');
  const markup = useMemo(() => {
    let source = animated && !reduced ? animation : sources[state];
    const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    for (const id of ids.sort((a, b) => b.length - a.length)) {
      source = source.split(`id="${id}"`).join(`id="${instance}-${id}"`)
        .split(`#${id}`).join(`#${instance}-${id}`).split(`${id}.click`).join(`${instance}-${id}.click`);
    }
    source = source.replace(/<style>([\s\S]*?)<\/style>/g, (_match, css: string) => `<style>${css.replace(/(^|})\s*([^{}]+)\{/g, '$1#' + instance + ' $2{')}</style>`);
    return source.replace(/ role="img"/, ' aria-hidden="true"');
  }, [animated, reduced, state, instance]);
  const svgContent = useMemo(() => ({ __html: markup }), [markup]);
  return <span id={instance} aria-hidden="true" className={`colive-logo ${className}`} style={{
    '--colive-frame-color': colors.frame, '--colive-character-color': colors.character, '--colive-face-color': colors.face,
  } as CSSProperties} dangerouslySetInnerHTML={svgContent} />;
}
