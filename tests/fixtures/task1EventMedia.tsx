import { useRef, useState } from 'react';
import { StylePreviewArea } from '../../src/components/StylePreviewArea';
import { createDefaultEventStyleSettings } from '../../src/eventStyleSettings';
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from '../../src/eventDisplaySettings';
import type { GuardMilestone } from '../../src/protocol/types';
import type { StylePreviewMode } from '../../src/components/stylePreviewContext';
import { getNativeEventSample } from './nativeEventSamples';

const contexts = ['live', 'review', 'window-chat', 'window-pay'] as const;
const missing = '/__native-event-fixture__/missing-image.png';

export function Task1MediaFixture() {
  const root = useRef<HTMLElement>(null);
  const [size, setSize] = useState(24);
  const [narrow, setNarrow] = useState(false);
  const [display, setDisplay] = useState({ ...DEFAULT_EVENT_DISPLAY_PREFERENCES });
  const [mode, setMode] = useState<StylePreviewMode>('current');
  const [milestone, setMilestone] = useState<GuardMilestone>('standard');
  const [failed, setFailed] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [result, setResult] = useState('{}');
  const settings = { ...createDefaultEventStyleSettings(), avatarSize: size, reviewAvatarSize: size };
  const events = ([undefined, 'standard', 'thousand', 'tenThousand'] as const).flatMap((tier, tierIndex) =>
    ([1, 2, 3] as const).flatMap(level => ['text', 'normal-gift'].map(key => {
      const ev = getNativeEventSample(key);
      ev.id = `${key}-${tierIndex}-${level}`;
      ev.user = { ...ev.user!, uname: `${tier ?? '旧档案'} ${level}`, guardLevel: level, guardMilestone: tier, avatar: failed ? missing : '/media/noface.gif' };
      if (ev.gift) { ev.gift.webp = missing; ev.gift.gif = `${missing}?gif`; ev.gift.icon = `${missing}?icon`; }
      return ev;
    })));
  const late = getNativeEventSample('text'); late.id = 'late-profile';
  late.user = { ...late.user!, uname: '晚到档位', guardLevel: 1, guardMilestone: milestone, avatar: '/media/noface.gif' };
  const blind = getNativeEventSample('blind-gift'); blind.id = 'fallback-blind';
  blind.user!.avatar = missing;
  blind.gift = { ...blind.gift!, webp: missing, gif: undefined, icon: undefined, blindWebp: missing, blindGif: undefined, blindIcon: undefined };
  const emotes = ['mixed-emote', 'big-emote', 'banner-emote'].map(key => {
    const ev = getNativeEventSample(key);
    if (ev.user) ev.user.avatar = '/media/noface.gif';
    if (ev.emoticon) ev.emoticon.url = failed ? missing : '/media/blind-box-fallback.webp';
    if (ev.emotes) for (const emote of Object.values(ev.emotes)) emote.url = failed ? missing : '/media/blind-box-fallback.webp';
    return ev;
  });
  const read = () => {
    const areas = [...root.current!.querySelectorAll<HTMLElement>('[data-task1-context]')];
    const measured = areas.map(area => ({
      context: area.dataset.task1Context,
      rows: [...area.querySelectorAll<HTMLElement>('.event-row-slot')].map(row => {
        const avatar = row.querySelector<HTMLElement>('.avatar-wrap');
        const frame = row.querySelector<HTMLImageElement>('.avatar-frame');
        const image = row.querySelector<HTMLImageElement>('.avatar');
        const event = row.querySelector<HTMLElement>('.event')!;
        return { id: row.dataset.eventId, avatarSize: avatar ? [avatar.getBoundingClientRect().width, avatar.getBoundingClientRect().height] : null,
          frameSize: frame ? [frame.getBoundingClientRect().width, frame.getBoundingClientRect().height] : null,
          frame: frame?.getAttribute('src') ?? null, level: frame?.dataset.level ?? null,
          avatar: image?.getAttribute('src') ?? null, avatarLoaded: image ? image.complete && image.naturalWidth > 0 : null,
          gifts: [...row.querySelectorAll<HTMLImageElement>('.gift-icon,.blind-gift-icon')].map(img => ({ src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 })),
          overflow: event.scrollWidth > event.clientWidth, text: event.textContent };
      }),
    }));
    const checks = measured.flatMap(area => area.rows.flatMap(row => {
      const close = (actual: number, expected: number) => Math.abs(actual - expected) < .05;
      return [
        ...(row.avatarSize ? [{ check: `${area.context}/${row.id} 头像尺寸`, pass: row.avatarSize.every(value => close(value, size)), actual: row.avatarSize, expected: [size, size] }] : []),
        ...(row.frameSize ? [{ check: `${area.context}/${row.id} 框尺寸`, pass: row.frameSize.every(value => close(value, size * 1.2)), actual: row.frameSize, expected: [size * 1.2, size * 1.2] }] : []),
        { check: `${area.context}/${row.id} 无横向溢出`, pass: !row.overflow, actual: row.overflow, expected: false },
      ];
    }));
    setResult(JSON.stringify({ size, narrow, mode, display, milestone, total: checks.length, failed: checks.filter(check => !check.pass), checks, areas: measured }));
  };
  return <section ref={root} data-task1-fixture>
    <h2>阶段1 媒体与头像框</h2>
    <div className="flex flex-wrap gap-2">
      {[16, 24, 40].map(value => <button key={value} onClick={() => setSize(value)}>头像{value}</button>)}
      <button onClick={() => setNarrow(value => !value)}>{narrow ? '宽区域' : '窄区域240'}</button>
      <button onClick={() => setDisplay(value => ({ ...value, showAvatar: !value.showAvatar }))}>切换头像</button>
      <button onClick={() => setDisplay(value => ({ ...value, showAvatarFrame: !value.showAvatarFrame }))}>切换头像框</button>
      <button onClick={() => setDisplay(value => ({ ...value, showGuardIdentity: !value.showGuardIdentity }))}>切换大航海标记</button>
      <button onClick={() => setDisplay(value => ({ ...value, guardIdentityDisplayMode: value.guardIdentityDisplayMode === 'icon' ? 'text' : 'icon' }))}>切换身份图文</button>
      <button onClick={() => setDisplay(value => ({ ...value, showGiftImage: !value.showGiftImage }))}>切换礼物图片</button>
      <button onClick={() => setMode(value => value === 'current' ? 'all' : 'current')}>当前设置／全部部件</button>
      <button onClick={() => setFailed(true)}>头像与表情失败</button>
      <button onClick={() => root.current!.querySelectorAll('.avatar-frame').forEach(img => img.dispatchEvent(new Event('error')))}>框加载失败</button>
      <button onClick={() => setMilestone('thousand')}>晚到千舰</button>
      <button onClick={() => setMilestone('tenThousand')}>晚到万舰</button>
      <button onClick={() => { setFailed(false); setEpoch(value => value + 1); setDisplay({ ...DEFAULT_EVENT_DISPLAY_PREFERENCES }); }}>恢复媒体与设置</button>
      <button onClick={read}>读取媒体结果</button>
    </div>
    <output data-task1-media-results>{result}</output>
    <div key={epoch} style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {contexts.map(context => <div key={context} data-task1-context={context} style={{ width: narrow ? 240 : 520, maxWidth: '100%', height: 560, display: 'flex', flexDirection: 'column' }}>
        <h3>{context}</h3>
        <StylePreviewArea context={context} mode={mode} events={[late, ...events, blind, ...emotes]} eventStyleSettings={settings}
          displayPreferences={display} eventFontSize={16} windowEventFontSize={16} />
      </div>)}
    </div>
  </section>;
}
