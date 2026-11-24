declare module "*eventTransitions.mjs" {
  export const EVENT_TRANSITION_CSS: string;
  export function applyEventTransition(node: HTMLElement, animation?: { preset: string; durationMs: number }, removing?: boolean): void;
}
