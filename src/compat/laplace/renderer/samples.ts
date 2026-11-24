import sampleData from './sample-data.json' with {type:'json'};
const originalStaticSamples = sampleData.static as RendererEvent[];
const originalDesignSamples = sampleData.design as RendererEvent[];
import sourceAvatars from '../../../preview/laplace-preview-source-avatars.json' with {type:'json'};
import giftMedia from '../../../preview/laplace-preview-gifts.json' with {type:'json'};
import {laplacePreviewUserAvatar} from './eventMedia.ts';
import { pickLaplaceRendererEvent, type RendererEvent } from './bridge.ts';
const excludedSampleTypes = new Set(['notice', 'mvp', 'entry-effect', 'superchat-delete']);
function avatarFor(user: { uid?: unknown; avatar?: unknown; face?: unknown }): string {
  const supplied = user.avatar || user.face;
  const official = typeof supplied === 'string' ? (sourceAvatars as Record<string, string>)[supplied] : undefined;
  return official ?? (typeof supplied === 'string' && supplied ? supplied : laplacePreviewUserAvatar(user.uid));
}
function preparePreviewSample(sample: RendererEvent): RendererEvent {
  const prepared = pickLaplaceRendererEvent(sample);
  const gift = (giftMedia as Record<string, { image: string }>)[String(prepared.giftId)];
  if (prepared.type === 'gift' && gift) prepared.giftIcon = gift.image;
  if (Number(prepared.uid) > 0 || prepared.avatar) prepared.avatar = avatarFor({ uid: prepared.uid, avatar: prepared.avatar });
  for (const key of ['reply', 'receiver']) {
    const user = prepared[key] as any;
    if (user && (Number(user.uid) > 0 || user.avatar || user.face)) prepared[key] = { ...user, avatar: avatarFor(user) };
  }
  if ((prepared.type === 'red-envelope-result' || prepared.type === 'lottery-result') && Array.isArray(prepared.list)) {
    prepared.list = prepared.list.map((winner: any) => Array.isArray(winner) || !winner ? winner : { ...winner, avatar: avatarFor(winner), ...(winner.face !== undefined ? { face: avatarFor(winner) } : {}) });
  }
  return prepared;
}
export function getOriginalSamples(mode: 'static' | 'design', identity?: string, part?: string): RendererEvent[] {
  const samples: RendererEvent[] = (mode === 'design' ? originalDesignSamples : originalStaticSamples).filter(sample => !excludedSampleTypes.has(sample.type)).map(sample => preparePreviewSample(sample));
  if (mode === 'static') return samples;
  const userType = identity === 'streamer' ? 100 : identity === 'moderator' ? 1 : undefined;
  if (userType !== undefined && !samples.some(sample => sample.type === 'message' && sample.userType === userType)) {
    const source = samples.find(sample => sample.type === 'message');
    if (source) samples.push({ ...source, id: `editor-identity-${identity}`, originIdx: 700001, userType, guardType: 0 });
  }
  const supplement = (type: string, values: Record<string, unknown>) => {
    const source = samples.find(sample => sample.type === type);
    if (source) samples.push({ ...source, ...values, id: `editor-part-${part}-${type}`, originIdx: 700002 + samples.length });
  };
  if (part === 'smallEmote' || part === 'smallEmoteWrap') supplement('message', { message: '[小表情]', bmotes: { '[小表情]': { url: '/media/style-preview-small-emote.png' } } });
  if (part === 'spoiler') for (const type of ['message', 'superchat']) supplement(type, { message: '正文 ||剧透内容||' });
  if (part === 'deleted') supplement('superchat', { deleted: true });
  if (part === 'translation' && !samples.some(sample => sample.messageTrans)) supplement('superchat', { messageTrans: '平台提供的译文样例', transMark: 1 });
  if (part && ['guardSymbol', 'guardFigure', 'guardUnit'].includes(part)) supplement('toast', { toastAmount: 3, toastAmountUnit: '月' });
  if (part === 'winnerToggle') for (const type of ['red-envelope-result', 'lottery-result']) {
    const source = samples.find(sample => sample.type === type && Array.isArray(sample.list) && sample.list.length);
    if (source) supplement(type, { list: Array.from({ length: 20 }, (_, index) => (source.list as unknown[])[index % (source.list as unknown[]).length]) });
  }
  return samples;
}
export function originalSimulationCandidates(enabledTypes: Set<string>): RendererEvent[] {
  const aliases: Record<string, string> = { live: 'live-start', preparing: 'live-end' };
  return originalStaticSamples
    .filter((sample: RendererEvent) => enabledTypes.has(aliases[sample.type] ?? sample.type) && !excludedSampleTypes.has(sample.type))
    .map((sample: RendererEvent) => preparePreviewSample(structuredClone(sample)));
}
export function generateOriginalSimulationEvent(options: { enabledTypes: Set<string> }, dependencies: { random?: () => number; now?: () => number } = {}): RendererEvent | null {
  const candidates = originalSimulationCandidates(options.enabledTypes);
  if (!candidates.length) return null;
  const random = dependencies.random ?? Math.random, now = (dependencies.now ?? Date.now)();
  const event = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  return { ...event, id: `preview-${now}-${++simulationSequence}`, timestamp: now, timestampNormalized: now };
}
let simulationSequence = 0;
