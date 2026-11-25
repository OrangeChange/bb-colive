import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DanmakuComposer,
  DanmakuComposerTrigger,
} from "../../src/components/DanmakuComposer";
import { EventContextMenu } from "../../src/components/EventContextMenu";
import { useDanmakuComposer } from "../../src/stores/danmakuComposer";
import { useConnection } from "../../src/stores/connection";
import { useSession } from "../../src/stores/session";
import { setUiLanguage } from "../../src/i18n";
import "../../src/App.css";
import "../../src/shadcn.css";
useSession.setState({
  phase: "loggedIn",
  session: {
    mid: "1",
    cookie: "SESSDATA=test;bili_jct=test",
    savedAt: 1,
    refreshToken: "",
    uname: "发送账号",
  },
});
useConnection.setState({
  state: { status: "connected", roomId: 123, anchorName: "测试主播" },
});
Object.assign(window, {
  composer: useDanmakuComposer,
  connection: useConnection,
  language: setUiLanguage,
});
const event = {
  id: "local-not-platform",
  msgType: 0,
  roomId: 123,
  ts: Date.now(),
  text: "观众提问",
  user: { uid: "456", uname: "测试观众" },
};
function App() {
  const [hide, setHide] = useState(false);
  const room = useConnection((s) => s.state.roomId);
  const status = useConnection((s) => s.state.status);
  return (
    <DanmakuComposer>
      <main className="m-4 rounded border border-line">
        <header className="flex h-9 items-center gap-1 px-3">
          <h2>弹幕与互动</h2>
          {!hide && <DanmakuComposerTrigger />}
        </header>
        <div className="event-row-with-menu relative m-4 h-10">
          <span>观众提问</span>
          <EventContextMenu
            event={{ ...event, roomId: room ?? 0 }}
            shortcutActions={["reply"]}
            handlers={{
              regionKey: "test",
              onSpeakEvent() {},
              isFavorite: () => false,
              onToggleFavorite() {},
              canReplyUser: () => status === "connected",
              onReplyUser: (ev) =>
                useDanmakuComposer
                  .getState()
                  .show({ uid: ev.user!.uid, name: ev.user!.uname }),
            }}
          />
        </div>
        <button type="button" onClick={() => setHide((v) => !v)}>
          切换标题入口
        </button>
      </main>
    </DanmakuComposer>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
