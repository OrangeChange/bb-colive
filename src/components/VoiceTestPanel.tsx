import { uiText } from "../i18n/index.ts";
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
      setError(uiText("voiceTestPanel.VoiceTestPanel.runTest"));
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
      setError(uiText("voiceTestPanel.VoiceTestPanel.runTest2", { value: cause instanceof Error ? cause.message : String(cause) }));
      setStatus("error");
    } finally {
      onBusyChange(false);
    }
  };

  return <section className="voice-test-panel" aria-label={uiText("voiceTestPanel.aria_label")}>
    <input id={id} aria-label={uiText("voiceTestPanel.aria_label2")} className={`${controlClass} voice-test-input`} value={text} disabled={status === "busy"}
      aria-invalid={status === "error" && !text.trim() || undefined} aria-describedby={`${id}-status`}
      onChange={event => { setText(event.target.value); setStatus("idle"); setError(""); }} />
      <button type="button" className={`${controlClass} voice-test-button`} aria-label={uiText("voiceTestPanel.aria_label")} disabled={status === "busy"} onClick={() => void runTest()}>
        <Play size={15} aria-hidden="true" />{status === "busy" ? uiText("voiceTestPanel.VoiceTestPanel") : uiText("voiceTestPanel.VoiceTestPanel2")}
      </button>
    <p id={`${id}-status`} role="status" className={`voice-test-status ui-type-meta ${status === "error" ? "text-danger" : "text-t3"}`}>{status === "ended" ? uiText("voiceTestPanel.VoiceTestPanel3") : status === "error" ? error : ""}</p>
  </section>;
}
