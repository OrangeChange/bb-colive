import { useId, useState } from "react";
import { Play } from "lucide-react";
import { controlClass } from "./voicePanelPrimitives";

export function VoiceTestPanel({ onTest, onBusyChange }: { onTest: (text: string) => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const id = useId();
  const [text, setText] = useState("这是一条测试语音");
  const [status, setStatus] = useState<"idle" | "busy" | "ended" | "error">("idle");
  const [error, setError] = useState("");
  const runTest = async () => {
    if (status === "busy") return;
    if (!text.trim()) {
      setError("请输入试听内容");
      setStatus("error");
      return;
    }
    setError("");
    setStatus("busy");
    onBusyChange(true);
    try {
      await onTest(text.trim());
      setStatus("ended");
    } catch (cause) {
      setError(`试听失败：${cause instanceof Error ? cause.message : String(cause)}。请检查网络及引擎配置后重试。`);
      setStatus("error");
    } finally {
      onBusyChange(false);
    }
  };

  return <section className="voice-test-panel" aria-label="试听">
    <input id={id} aria-label="试听内容" className={`${controlClass} voice-test-input`} value={text} disabled={status === "busy"}
      aria-invalid={status === "error" && !text.trim() || undefined} aria-describedby={`${id}-status`}
      onChange={event => { setText(event.target.value); setStatus("idle"); setError(""); }} />
      <button type="button" className={`${controlClass} voice-test-button`} aria-label="试听" disabled={status === "busy"} onClick={() => void runTest()}>
        <Play size={15} aria-hidden="true" />{status === "busy" ? "试听中…" : "试听"}
      </button>
    <p id={`${id}-status`} role="status" className={`voice-test-status ui-type-meta ${status === "error" ? "text-danger" : "text-t3"}`}>{status === "ended" ? "试听已结束" : status === "error" ? error : ""}</p>
  </section>;
}
