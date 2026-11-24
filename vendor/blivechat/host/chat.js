// No network client is linked into the isolated renderer.
export const DEFAULT_AVATAR_URL = '//static.hdslb.com/images/member/noface.gif';

export function getDefaultMsgHandler() {
  const ignore = () => {};
  return Object.fromEntries(['onAddText','onAddGift','onAddMember','onAddSuperChat','onDelSuperChat','onUpdateTranslation','onFatalError','onDebugMsg'].map(name => [name, ignore]));
}
