import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { useCompatibleFeedNode, useLocalFeedReading, type LocalFeedReadingState } from '../../src/events/useLocalFeedReading.ts';

function Feed({ name, direction = 'bottom' }: { name: string; direction?: 'top' | 'bottom' }) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [rows, setRows] = useState(Array.from({ length: 50 }, (_, i) => i));
  const [version, setVersion] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  useLocalFeedReading(node, direction, true, resetKey, rows.map(String));
  return <section>
    <button onClick={() => setRows(r => [...r, r.at(-1)! + 1])}>追加{name}</button>
    <button onClick={() => setRows([])}>清空{name}</button>
    <button onClick={() => setRows(Array.from({ length: 40 }, (_, i) => 100 + i))}>重填{name}</button>
    <button onClick={() => { setRows(r => [-1, ...r]); setVersion(v => v + 1); }}>重建{name}</button>
    <button onClick={() => setExpanded(v => !v)}>调整{name}</button>
    <button onClick={() => setResetKey(v => v + 1)}>重播{name}</button>
    <button onClick={() => { setReloading(true); setTimeout(() => setReloading(false), 100); }}>载入{name}</button>
    <button onClick={() => { if (node) node.scrollTop = node.scrollHeight; }}>布局滚动{name}</button>
    <button onClick={() => { const row = node?.querySelector<HTMLElement>('[data-event-id="30"]'); if (row) row.style.transform = 'translateY(10px)'; }}>平移{name}</button>
    <button onClick={() => { const row = node?.querySelector<HTMLElement>('[data-event-id="30"]'); if (node && row) { row.removeAttribute('data-event-id'); node.scrollTop += 40; setTimeout(() => row.setAttribute('data-event-id', '30'), 100); } }}>恢复标识{name}</button>
    <div ref={setNode} id={name} style={{ height: 200, width: 300, overflow: 'auto', overflowAnchor: 'none' }}>
      {(direction === 'top' ? [...rows].reverse() : rows).filter(id => !reloading || id !== 30).map(id => <div key={`${version}-${id}`} data-event-id={id} style={{ height: expanded && id < 20 ? 42 : 40 }}>{id}</div>)}
    </div>
  </section>;
}
function LateFrame() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const node = useCompatibleFeedNode(container, true);
  return <div ref={setContainer}><span id="frame-status">{node ? '就绪' : '等待'}</span><iframe title="延迟滚动容器" srcDoc={'<script>setTimeout(() => { const node = document.createElement("div"); node.className = "scroll-area"; document.body.append(node); }, 200)</script>'}/></div>;
}
function SwitchFeed({ name }: { name: string }) {
  const [mode, setMode] = useState<'native' | 'compatible'>('native');
  const [native, setNative] = useState<HTMLDivElement | null>(null), [compatible, setCompatible] = useState<HTMLDivElement | null>(null);
  const reading = useRef<LocalFeedReadingState | null>(null);
  useLocalFeedReading(native, 'bottom', mode === 'native', undefined, undefined, reading);
  useLocalFeedReading(compatible, 'bottom', mode === 'compatible', undefined, undefined, reading);
  return <section><button onClick={() => setMode(value => value === 'native' ? 'compatible' : 'native')}>切换{name}</button>
    <div key={mode} ref={mode === 'native' ? setNative : setCompatible} id={`switch-${name}`} style={{ height: 200, width: 300, overflow: 'auto', overflowAnchor: 'none' }}>
      {Array.from({ length: 50 }, (_, id) => <div key={id} data-event-id={id} style={{ height: 40 }}>{id}</div>)}
    </div></section>;
}
createRoot(document.getElementById('root')!).render(<><Feed name="a"/><Feed name="b"/><Feed name="c" direction="top"/><Feed name="d" direction="top"/><LateFrame/><SwitchFeed name="x"/><SwitchFeed name="y"/></>);
