import test from "node:test";
import assert from "node:assert/strict";
test("图片和字体首次发送，纯配色修改复用资源，迟到连接仍得到完整资源", async () => {
  const { createPreviewResourceSender, createPreviewResourceReceiver } =
    await import("../src/preview/stylePreviewResources.ts");
  const send = createPreviewResourceSender(),
    receive = createPreviewResourceReceiver();
  const font = "data:font/woff2;base64," + "A".repeat(4000),
    image = "data:image/png;base64," + "B".repeat(4000);
  const state = {
    ownerId: "a",
    revision: 1,
    kind: "native",
    content: {
      previewCss: `@font-face{src:url("${font}")} .event{background:url(${image});color:red}`,
    },
    frame: { epoch: 0 },
  };
  const first = { type: "preview:replace", state };
  assert.deepEqual(receive(send(first)), first);
  const next = {
    type: "preview:replace",
    state: {
      ...state,
      revision: 2,
      content: {
        previewCss: state.content.previewCss.replace("color:red", "color:blue"),
      },
    },
  };
  const packed = send(next);
  assert(!JSON.stringify(packed).includes(font));
  assert(!JSON.stringify(packed).includes(image));
  assert.deepEqual(receive(packed), next);
  const lateReceive = createPreviewResourceReceiver();
  assert.deepEqual(lateReceive(send(next, true)), next);
});

test("配置更新传输保留资源引用而不夹带事件帧", async () => {
  const { createPreviewResourceSender, createPreviewResourceReceiver } =
    await import("../src/preview/stylePreviewResources.ts");
  const send = createPreviewResourceSender(),
    receive = createPreviewResourceReceiver();
  const state = {
    ownerId: "a",
    revision: 1,
    kind: "compatible",
    content: { css: "a{background:url(data:image/png;base64,AAAA)}" },
  };
  const input = { type: "preview:configure", state };
  assert.deepEqual(receive(send(input)), input);
  const repeated = send({ ...input, state: { ...state, revision: 2 } });
  assert.equal(repeated.resources, undefined);
  assert.equal(repeated.state.frame, undefined);
});


test("预览图片按当前站点解析，正文中的普通地址保持原样", async () => {
 const { createPreviewResourceReceiver } = await import("../src/preview/stylePreviewResources.ts");
 const receive = createPreviewResourceReceiver();
 const message = {type:"preview:frame", frame:{events:[{avatarUrl:"http://tauri.localhost/laplace/files/avatar.webp",text:"http://tauri.localhost/media/example.png",html:'<img src="http://tauri.localhost/blivechat/static/img/emoticons/233.png">'}]}};
 const result=receive(message);
 assert.equal(result.frame.events[0].avatarUrl,"/laplace/files/avatar.webp");
 assert.equal(result.frame.events[0].text,message.frame.events[0].text);
 assert.equal(result.frame.events[0].html,'<img src="/blivechat/static/img/emoticons/233.png">');
});
