import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useSourcePreviewPolicy } from "../../src/preview/useSourcePreviewPolicy.ts";
import { DEFAULT_STYLE_PREVIEW_POLICY } from "../../src/preview/stylePreviewPolicy.ts";
import { createBlivechatFixedPreviewRecords } from "../../src/compat/blivechat/previewRecords.mjs";

const now = Date.now();
const record = structuredClone(
  createBlivechatFixedPreviewRecords("blivechat").find(
    (row) => row.method === "onAddGift",
  )!,
);
record.payload = record.payload ?? record.data;
record.receivedAt = now - 2000;
Object.assign(record.payload, {
  id: "pinned-gift",
  time: now - 2000,
  timestamp: (now - 2000) / 1000,
  num: 1,
  price: 100,
  totalCoin: 100000,
  coinType: "gold",
});
const frame = {
  epoch: 1,
  now,
  records: [record],
  mainEventIds: [],
  presentation: {
    messages: [],
    paidMessages: [{ id: "pinned-gift", price: 100, num: 1 }],
  },
};
const settings = {
  ...DEFAULT_STYLE_PREVIEW_POLICY,
  stickySettings: {
    ...DEFAULT_STYLE_PREVIEW_POLICY.stickySettings,
    enabled: true,
    obsEnabled: true,
    giftThreshold: 0,
  },
};

function Fixture() {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  useSourcePreviewPolicy(ref, ready, "bb-blivechat", frame, undefined, {
    settings,
    target: "obs",
    mode: "simulation",
    displayAll: true,
    thumbnail: false,
    direction: "bottom",
    alignment: "top",
    restart: 1,
  });
  return (
    <iframe
      ref={ref}
      onLoad={() => setReady(true)}
      srcDoc={
        '<script>window.commands=[];addEventListener("message",e=>window.commands.push(e.data))</script>'
      }
    />
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
