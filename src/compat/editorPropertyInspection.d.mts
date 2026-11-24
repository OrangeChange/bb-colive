export function inspectEditorProperty<T extends { mixed?: boolean }>(nodes: Element[], property: string, current?: T): T & { mixed?: boolean; applicable?: boolean };
