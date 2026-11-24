// Original five ChatClientTest image bytes are bundled; no substitute samples.
const localNames = new Set(['233','miaoa','lipu','huangdou_xihuan','sakaban_jiayu_yutou']);
export function resourceUrl(url) {
  if (typeof url !== 'string') return '';
  let parsed; try { parsed = new URL(url, location.href); } catch { return url; }
  const match = parsed.pathname.match(/^\/static\/img\/emoticons\/([a-z0-9_]+)\.png$/);
  if (match && localNames.has(match[1]) && ['https://fixture.invalid', location.origin].includes(parsed.origin))
    return new URL(`static/img/emoticons/${match[1]}.png`, location.href).href;
  return url;
}
function imageSize(url) {
  return new Promise(resolve => {
    const img = document.createElement('img'); let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const size = { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
      resolve(size);
    };
    // Room.vue probes every message, including warm URLs, before delivery.
    const timer = setTimeout(finish, 5000); img.onload = finish; img.onerror = finish; img.src = url;
  });
}
export async function resolveContentParts(data) {
  let parts;
  if (Array.isArray(data.contentParts)) parts = data.contentParts.map(part => ({ ...part }));
  else if (data.emoticon) parts = [{ type: 1, text: data.content || '', url: data.emoticon, width: 0, height: 0 }];
  else parts = [{ type: 0, text: data.content || '' }];
  await Promise.all(parts.map(async part => {
    if (part.type !== 1) return;
    part.url = resourceUrl(part.url);
    if (!(part.width > 0 && part.height > 0)) Object.assign(part, await imageSize(part.url));
  }));
  return parts;
}
