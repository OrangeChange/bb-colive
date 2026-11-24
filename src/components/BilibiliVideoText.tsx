import { openUrl } from "@tauri-apps/plugin-opener";
import { splitBilibiliVideoText } from "./bilibiliVideoLinks";

export function BilibiliVideoText({ text }: { text: string }) {
  return (
    <>
      {splitBilibiliVideoText(text).map((part, index) => part.type === "video" ? (
        <a
          key={`${part.href}-${index}`}
          href={part.href}
          className="bilibili-video-link text-accent-text underline decoration-accent/60 underline-offset-2 hover:decoration-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-ring"
          title="在默认浏览器打开 B 站视频"
          onClick={(event) => {
            event.preventDefault();
            void openUrl(part.href).catch(() => {});
          }}
        >
          {part.value}
        </a>
      ) : (
        <span key={`${part.value}-${index}`}>{part.value}</span>
      ))}
    </>
  );
}
