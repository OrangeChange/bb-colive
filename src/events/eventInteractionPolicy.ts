export const EVENT_SHORTCUT_ACTIONS = ["speak", "filter", "favorite", "mark"] as const;
export const MAX_EVENT_SHORTCUT_ACTIONS = 3;
export type EventShortcutAction = (typeof EVENT_SHORTCUT_ACTIONS)[number];
export const DEFAULT_EVENT_SHORTCUT_ACTIONS: EventShortcutAction[] = ["speak", "favorite", "mark"];

export const normalizeEventShortcutActions = (value: unknown): EventShortcutAction[] => {
  if (!Array.isArray(value)) return [...DEFAULT_EVENT_SHORTCUT_ACTIONS];
  const result: EventShortcutAction[] = [];
  for (const action of value) {
    if (!EVENT_SHORTCUT_ACTIONS.includes(action as EventShortcutAction)) continue;
    if (result.includes(action as EventShortcutAction)) continue;
    result.push(action as EventShortcutAction);
    if (result.length === MAX_EVENT_SHORTCUT_ACTIONS) break;
  }
  return result;
};

