import test from "node:test";
import assert from "node:assert/strict";
import { createTerminalOutcomeGate, createGiftEffectTerminalCallbacks } from "../src/windows/giftEffectPlayer.ts";
import { readFile } from "node:fs/promises";

test("gift effects and windows record lifecycle diagnostics", async () => {
  const player = await readFile(new URL("../src/windows/giftEffectPlayer.ts", import.meta.url), "utf8");
  const floating = await readFile(new URL("../src/windows/FloatingEventWindow.tsx", import.meta.url), "utf8");
  const display = await readFile(new URL("../src/windows/FloatingEventWindow.tsx", import.meta.url), "utf8");
  for (const phase of ["matched", "resource-missing", "download-failure", "player-init-failure", "play-start", "play-complete", "play-cancel"]) {
    assert.match(player, new RegExp(`record\\(\\"${phase}\\"`));
  }
  assert.match(player, /play\(resource: GiftEffectResource, container: HTMLElement, eventId\?: string\)/);
  assert.match(player, /onLoadError: \(\) => \{ if \(token !== generation\) return;/);
  assert.match(player, /createGiftEffectTerminalCallbacks/);
  assert.match(player, /player\.once\("ended", terminalCallbacks\.onEnded\)/);
  for (const source of [floating, display]) {
    assert.match(source, /recordWindowDiagnostic/);
    assert.match(source, /useEffect\(\(\) => \{/);
  }
});

test("gift effect terminal outcome is recorded only once", () => {
  for (const outcomes of [["success", "failure"], ["failure", "success"]]) {
    const gate = createTerminalOutcomeGate();
    let completed = 0;
    for (const outcome of outcomes) if (gate.tryFinish(outcome)) completed += 1;
    assert.equal(completed, 1);
    assert.equal(gate.outcome, outcomes[0]);
  }
});

test("real terminal callbacks notify and complete only once, while stale generations are ignored", () => {
  const records = [];
  const notifications = [];
  const callbacks = createGiftEffectTerminalCallbacks({
    gate: createTerminalOutcomeGate(),
    isCurrent: (token) => token === 2,
    recordComplete: (outcome) => records.push(outcome),
    notify: (event) => notifications.push(event),
    token: 2,
  });

  callbacks.onError();
  callbacks.onEnded();
  callbacks.onEnded();
  assert.deepEqual(records, ["failure"]);
  assert.deepEqual(notifications, ["error"]);

  const stale = createGiftEffectTerminalCallbacks({
    gate: createTerminalOutcomeGate(),
    isCurrent: () => false,
    recordComplete: (outcome) => records.push(`stale:${outcome}`),
    notify: (event) => notifications.push(`stale:${event}`),
    token: 1,
  });
  stale.onEnded();
  stale.onError();
  assert.deepEqual(records, ["failure"]);
  assert.deepEqual(notifications, ["error"]);
});
