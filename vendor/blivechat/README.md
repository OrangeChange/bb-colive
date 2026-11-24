# Original blivechat isolated renderer

Pinned source: https://github.com/xfgryujk/blivechat commit `848409df78d2cca65d3cc8ffe938eb6b6f261b76`, v1.10.4. MIT license retained. `upstream/` files are unmodified upstream bytes; `source-manifest.json` records their SHA-256. This is a standalone Vue 2 document, not a React reimplementation of the original message components. BB does not depend on Vue.

## Build and test

From the application root:

1. `npm ci --prefix vendor/blivechat`
2. `npm run build:blivechat`
3. `npm run test:blivechat`
4. `npm run build:compat`

An existing original frontend dependency installation can be used with `ORIGINAL_NODE_MODULES=/absolute/path/to/frontend/node_modules`. The research checkout beside this application is an additional developer-only fallback. A separate `BLIVECHAT_JSDOM_MODULE=/absolute/path/to/jsdom` override is available for document tests. Missing compiled files or jsdom fail the document test suite rather than silently skipping it. The isolated lock includes exact installed build packages and jsdom 26.1.0; `npm ci --dry-run --offline --ignore-scripts` was validated against the lock. A fresh online install has not been executed in this restricted environment.

The build emits `public/blivechat/renderer.html`, JS/CSS, original SDK, original five local test emoticon images, fonts, license and `build-info.json`. The latter hashes current host/core/build sources and final artifacts; tests reject stale bundles. Upstream-relative Vue loader context preserves the original production scoped-style hash formula. The public custom-element names, classes, ids, attributes and `@layer yt` styles are unchanged. The compiler currently reports 13 unused external-style default-export warnings; emitted style bytes and executable document tests pass. This is not a claim that a different upstream build's entire DOM serialization or minified bundle is byte-identical.

## Trusted document protocol

Embed `/blivechat/renderer.html` in an iframe with `sandbox="allow-scripts allow-same-origin"`. This document contains trusted vendored code only. It accepts messages only from its direct parent with the exact same origin. Envelope:

`{ type: 'bb-blivechat', command, data }`

- `event`: `{method, payload, receivedAt?, replay?}`. Original Room callback methods: onAddText, onAddGift, onAddMember, onAddSuperChat, onDelSuperChat, onUpdateTranslation, onDebugMsg. Platform `contentParts` are accepted without exposing an editable custom keyword map.
- `config`: a typed patch containing the 16 retained Home fields. `lang` optionally selects original zh/en/ja strings. Invalid/removed fields are rejected, not silently clamped.
- `css`: `{css, presetCss?}`. Full custom CSS is copied exactly. `presetCss` is an explicit in-memory integration/test extension; ordinary preset use preserves `/custom_public/preset.css` as a stylesheet URL.
- `simulation`: `{playing, speed, types:{text,emoticon,gift,member,superChat}}`. Uses the unchanged upstream ChatClientTest and model constructors. The UI speed range is 0.2–11. Changing types alone does not restart the original main timer. Pause preserves already scheduled translation/deletion callbacks, like upstream. Reset disconnects all old callbacks and stops the old test client.
- `hydrate`: `{records:[{method,payload,receivedAt,...}], ...scope}`. Replaces the session from a bounded source snapshot without sending thousands of historical additions through the smoothing queue. Historical records preserve receive-time clocks and deterministic receipt ordering; past image-resolution completion times are unavailable in an intake snapshot. Hydration input and its waiting live tail are each capped at 10,000 callbacks / 16 MiB serialized UTF-8 with explicit rejection on overflow. Image probes settle before one final replacement; incoming live events wait behind the snapshot, and reset/new hydration invalidates old work.
- `reset`: new explicit preview session, clearing history and tombstones.
- `inspect`: posts a diagnostic snapshot (used by tests).

Outbound commands: `ready`, `status`, `snapshot`, `template-ready`, `error`. These are readiness/state reports, not proof of browser visual fidelity.

## Retention and clocks

No disk archive, live-room connection, authorization-code flow or server translation service is included.

- Raw callback journal: newest 10,000 callbacks, at most 16 MiB serialized UTF-8, at most two hours.
- Reprojection records: newest 5,000 additions, at most 16 MiB serialized UTF-8, at most two hours. Existing translation updates are retained as an overlay; original callback bytes are not mutated.
- Separate live-work reserve: at most 10,000 records and 32 MiB serialized UTF-8, retaining in-flight image parses, messages still queued/displayed, active original ticker entries and raw contributors to a still-live merged target. Old non-live records leave the reserve. Hitting this bound rejects new additions with an explicit error; it does not clear the original smoothing queue or discard an active SC. These are serialization budgets, not a promise that JavaScript heap usage equals those byte counts.
- Deletion tombstones: session-long, at most 20,000 ids and 2 MiB UTF-8. On overflow SC display fails closed until explicit reset, rather than forgetting a deletion and reviving an SC. Settings, late translations and duplicate additions cannot undo deletion.
- “Existing messages” for settings means retained reprojection records plus live-work reserve. Evicted, non-live history cannot be recovered by increasing maxNumber. The intake adapter's own bounded snapshot may be smaller; a newly opened host can only reconstruct what that adapter supplies.
- Normal additions use the original renderer's first acceptance time, captured once. Rebuilds retain it. Records hidden before first display use their original receive time. Explicit historical hydration/replay also preserves receive time, never granting an expired item a new lifetime.
- Original ticker duration tiers are unchanged: membership two minutes; price tiers 35/70/140/350/700 yuan correspond to 2/5/10/30/60 minutes. SC list rows do not expire merely because their ticker expires. Upstream's 100-paid-entry cap is retained.

## Behavior-preserving changes and explicit extensions

Original Vue renderer templates, event-row CSS, smooth queue/scroll methods, ticker transitions, money formatting, original dictionaries, images and SDK are vendored. Live text waits for its original-style asynchronous image-size probe before merge/enqueue; a pending translation is delivered add-then-update. Original live merges use the renderer's actual pending/buffer/displayed recent-five search, including its merge-before-minimum-price behavior.

Immediate config changes are an approved extension; original Room reloads configuration through its URL. Rebuilds refilter/remerge raw retained messages, preserve stable source ids and asynchronous delivery ordering, reconcile the original Vue component in place and keep clocks/tombstones. Reconstruction uses recorded delivery/acceptance timing to distinguish queued from capped displayed messages; newly eligible or newly split retained records use deterministic immediate acceptance for reconstruction. They do not create a fictitious public upstream hot-config API.

Removed settings: blockKeywords, blockUsers, relayMessagesByServer, autoTranslate, giftUsernamePronunciation, editable emoticons keyword→URL configuration. Existing translations and official/platform image data remain supported. No translation service is called. The five original fixture image URLs are remapped only for the captured fixture origin or current host; other platform URLs remain unchanged. The original fallback avatar still uses its original remote URL. Remote asset availability and OS-installed font differences require real-browser validation.

Default renderer CSS remains opaque exactly as upstream. The parent checkerboard is visible where custom CSS makes the renderer/document transparent; the checkerboard toggle does not silently alter renderer styles.

The optional original `/custom_public/preset.css` is deployment/user-provided, not present in the original repository. The default renderer uses a link, preserving relative url()/@import bases and original cascade placement. Missing preset availability is reported. It is never replaced by an invented preset.

## Arbitrary template SDK boundary

User templates are a separate nested iframe, `sandbox="allow-scripts"` only, with no same-origin access, top navigation, popup, form, or native BB bridge grant. Only that exact frame with opaque origin `null` can send `blcTemplateConnect`. Outgoing messages use the original `blcInit`, `blcAddMsg`, `blcUpdateMsg`, `blcDelMsgs`, `blcInjectCss` protocol. SDK-reported parent version stays 1.0.1 as original Room; bundled SDK source is 1.0.3 as upstream. Original template configuration exposes four fields (showGiftName, mergeSimilarDanmaku, mergeGift, maxNumber). Templates own their own merging.

Only CSS containing `blc-inject-into-template` is injected as custom CSS. Preset injection uses the original absolute URL array, preserving relative resources. A handshake/replay barrier prevents duplicate additions if a new event arrives while initializing. Replay includes visible messages and still-active paid entries outside the visible cap with original addTime metadata.

The original SDK has no hot-config or CSS-replacement method. To make retained settings and full replacement CSS apply without a manual refresh, only the nested custom-template frame is automatically recreated and reconnected. Arbitrary template code/state therefore restarts. The default original Vue renderer stays mounted. A template may ignore incoming timestamps or implement incompatible behavior; its arbitrary scripts cannot be certified by default-renderer tests. Network/CORS, frame-ancestors/X-Frame-Options, sandbox compatibility and third-party font/image restrictions remain site-specific. No arbitrary template has been represented as visually accepted.

## Evidence boundary

`runtime/tests/core.test.mjs`: retained-setting and lifecycle unit tests, including the exact 8,294-callback original capture.

`runtime/tests/document.test.mjs`: executes the compiled renderer in jsdom, covering source/origin rejection, public DOM hooks, exact CSS, URL preset behavior, keyed DOM updates, clocks, source merging, safe SDK lifecycle/barrier, original random-client pause/reset and hydration. This is DOM/protocol evidence, not layout/pixel evidence.

`tests/blivechat-independent-audit.test.mjs`: independent original-source oracle, including original callbacks, async ordering, every price tier, both visible and paid output comparisons, and retention regressions. Its explicit deterministic image probes/queue draining and retention conditions are documented there.

Cloud browser access to the earlier local preview URL was blocked. No bypass, external deployment or user-computer use was attempted. Actual browser layout, visual comparison with identical CSS, OS font differences and three-platform visual acceptance remain unverified.
