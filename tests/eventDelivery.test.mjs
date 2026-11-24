import test from "node:test";
import assert from "node:assert/strict";

test("新增事件按窗口、播报、特效顺序分发，连击更新只更新礼物和播报", async () => {
  const { createEventDelivery } = await import("../src/runtime/eventDelivery.ts");
  const calls = [];
  const delivery = createEventDelivery({
    display: (event) => { calls.push(`display:${event.id}`); return "delivered"; },
    gift: (event) => { calls.push(`gift:${event.id}`); return "window-not-ready"; },
    voice: (event) => calls.push(`voice:${event.id}`),
    effect: (event) => calls.push(`effect:${event.id}`),
    observe: (_event, region, result) => calls.push(`${region}:${result}`),
    switchRoom: (room) => calls.push(`room:${room}`),
    clearVoice: () => calls.push("clear-voice"),
  });
  const event = { id: "1", roomId: 10, msgType: 1, ts: 1 };
  delivery.append(event);
  assert.deepEqual(calls, ["display:1", "display:delivered", "gift:1", "gift:window-not-ready", "voice:1", "effect:1"]);
  calls.length = 0;
  delivery.updateGift(event);
  assert.deepEqual(calls, ["gift:1", "gift:window-not-ready", "voice:1"]);
  calls.length = 0;
  delivery.switchRoom(20);
  delivery.clearVoice();
  assert.deepEqual(calls, ["room:20", "clear-voice"]);
});
