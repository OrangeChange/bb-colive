import { getLaplaceInputSnapshot, subscribeLaplaceInput } from './inputBus.ts';
import { createLaplaceProductSession, laplaceProductClock, type LaplaceProductClock, type LaplaceProductSource } from './productSession.ts';
import { createLaplaceProductSimulationSource } from './productSimulationSource.ts';
import type { LaplaceAdmissionSettings, LaplaceRetentionPolicy } from './types.ts';

export type LaplacePreviewOwnerSlot = 'live-preview' | 'simulation-preview';
export interface LaplacePreviewOwner {
  identity: string;
  session: ReturnType<typeof createLaplaceProductSession>;
  simulation: ReturnType<typeof createLaplaceProductSimulationSource> | null;
}
/** Exactly two genuine consumer slots per realm. No implicit last-mounted
 * settings authority and no hypothetical production-output integration. */
export function createLaplacePreviewOwnerRegistry({ clock = laplaceProductClock,
  liveSource = { getSnapshot: getLaplaceInputSnapshot, subscribe: subscribeLaplaceInput }, simulationPolicy,
}: { clock?: LaplaceProductClock; liveSource?: LaplaceProductSource; simulationPolicy?: LaplaceRetentionPolicy } = {}) {
  const slots = new Map<LaplacePreviewOwnerSlot, LaplacePreviewOwner>();
  const authorities = new Map<LaplacePreviewOwnerSlot, object>();
  const validate = (slot: LaplacePreviewOwnerSlot) => {
    if (slot !== 'live-preview' && slot !== 'simulation-preview') throw new Error('Unsupported LAPLACE product owner slot');
  };
  const dispose = (slot?: LaplacePreviewOwnerSlot) => {
    if (slot !== undefined) validate(slot);
    for (const [key, owner] of slots) if (slot === undefined || slot === key) {
      owner.session.dispose(); owner.simulation?.dispose(); slots.delete(key); authorities.delete(key);
    }
  };
  const activate = (slot: LaplacePreviewOwnerSlot, identity: string, settings: LaplaceAdmissionSettings, authority?: object): LaplacePreviewOwner => {
    validate(slot);
    if (!identity) throw new Error('Explicit LAPLACE owner identity required');
    if (authorities.has(slot) && authorities.get(slot) !== authority) throw new Error('Conflicting LAPLACE settings authority');
    const previous = slots.get(slot);
    if (previous) {
      if (previous.identity !== identity) throw new Error(`Conflicting LAPLACE ${slot} owner; use explicit replacement`);
      if (authority) authorities.set(slot, authority);
      previous.session.configure(settings); return previous;
    }
    const simulation = slot === 'simulation-preview' ? createLaplaceProductSimulationSource(identity, clock, simulationPolicy) : null;
    const session = createLaplaceProductSession({ source: simulation ?? liveSource, settings, clock, resolveScFact: simulation?.resolveScFact, nativePaidSticky: slot === 'live-preview' });
    const owner = { identity, session, simulation }; slots.set(slot, owner);
    if (authority) authorities.set(slot, authority);
    return owner;
  };
  return { activate, dispose, release(slot: LaplacePreviewOwnerSlot, authority: object) {
    if (authorities.get(slot) === authority) authorities.delete(slot);
  }, replace(slot: LaplacePreviewOwnerSlot, identity: string, settings: LaplaceAdmissionSettings, authority?: object) {
    if (authorities.has(slot) && authorities.get(slot) !== authority) throw new Error('Conflicting LAPLACE settings authority');
    dispose(slot); return activate(slot, identity, settings, authority);
  } };
}
// Lifetime is the application realm, not an editor/iframe effect. Application
// teardown or explicit session replacement may dispose; reader cleanup must not.
export const laplacePreviewOwners = createLaplacePreviewOwnerRegistry();
