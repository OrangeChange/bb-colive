// Chrome headless entry: real BrowserOutput, loopback WebSocket and local VAP assets.
const group = process.argv.find(argument => argument.startsWith('--group='))?.slice(8) ?? 'smoke';
const scripts = {
  smoke: 'obs-browser-acceptance.mjs',
  summary: 'obs-browser-acceptance.mjs',
  websocket: 'obs-transport-acceptance.mjs',
  transport: 'obs-transport-acceptance.mjs',
  idle: 'obs-idle-acceptance.mjs',
};
if (!scripts[group]) throw new Error('Use --group=smoke, --group=summary, --group=websocket, --group=transport or --group=idle');
if (group === 'transport' && !process.env.OBS_RUST_PROXY_PORT) throw new Error('Run transport through the Rust Chrome integration test');
if (group === 'smoke' || group === 'summary') process.env.OBS_BROWSER_CASE = group;
await import(new URL(`./helpers/obsGiftEffects/${scripts[group]}`, import.meta.url));
