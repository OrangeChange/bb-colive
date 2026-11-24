export function migrateBrandStorage(storage: Storage): void {
  for (let index = 0; index < storage.length; index++) {
    const oldKey = storage.key(index);
    if (!oldKey?.startsWith('danmu-app')) continue;
    const newKey = oldKey.replace(/^danmu-app/, 'bb-colive');
    if (storage.getItem(newKey) === null) storage.setItem(newKey, storage.getItem(oldKey)!);
  }
}
if (typeof window !== 'undefined') {
  migrateBrandStorage(window.localStorage);
  migrateBrandStorage(window.sessionStorage);
}
