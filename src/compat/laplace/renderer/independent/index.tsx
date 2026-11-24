import { MessageEvent } from './message';
import type { EventProps } from './primitives';
import { GiftEvent, SuperchatEvent, ToastEvent } from './paid';
import { ActivityResult, LotteryStart, RedEnvelopeStart } from './activities';
import { EffectMessage, InteractionEvent, SystemEvent } from './otherEvents';
// @ts-expect-error Host-owned rendering context.
import { defaultOptions as options } from '../runtime-context.mjs';
export { LaplaceRenderContext } from './primitives';
export const defaultOptions = Object.freeze({ ...options, showCurrentRank: false, showGiftHighlightAbove: 30, classicElementScope: false });
export const supportsProductElements = true;
export const implementation = 'independent';
export function LaplaceEventRenderer(props: EventProps) {
  switch (props.data.type) {
    case 'message': return <MessageEvent {...props} />;
    case 'gift': return <GiftEvent {...props} />;
    case 'superchat': return <SuperchatEvent {...props} />;
    case 'toast': return <ToastEvent {...props} />;
    case 'effect-message': return <EffectMessage {...props} />;
    case 'interaction': case 'like-click': return <InteractionEvent {...props} />;
    case 'red-envelope-start': return <RedEnvelopeStart {...props} />;
    case 'lottery-start': return <LotteryStart {...props} />;
    case 'red-envelope-result': case 'lottery-result': return <ActivityResult {...props} />;
    default: return <SystemEvent {...props} />;
  }
}
