import { useEffect, useRef, useState } from "react";
import { ImagePreviewOverlay } from "./ImagePreviewOverlay";
import { loadSessionCover, readRecoveryCover } from '../cloudSync/recoveryCoverDisplay';

export type ArchiveCoverThumbnailSize = "session-list" | "session-header";

export interface ArchiveCoverThumbnailProps {
  url?: string | null;
  alt: string;
  size: ArchiveCoverThumbnailSize;
  cloudSessionId?: string;
  previewEnabled?: boolean;
}

const sizeClass: Record<ArchiveCoverThumbnailSize, string> = {
  "session-list": "archive-cover-thumbnail--session-list",
  "session-header": "archive-cover-thumbnail--session-header",
};

export function ArchiveCoverThumbnail({ url, alt, size, cloudSessionId, previewEnabled = true }: ArchiveCoverThumbnailProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const holderRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [retry, setRetry] = useState(0);
  const [localImage, setLocalImage] = useState<{key: string; value: string | null; failed: boolean} | null>(null);
  const normalizedUrl = url?.trim() || null;
  const cloud = Boolean(cloudSessionId || normalizedUrl?.startsWith('cloud-cover://'));
  const imageKey = cloudSessionId ?? normalizedUrl ?? '';
  const imageUrl = cloud ? (localImage?.key === imageKey ? localImage.value : null) : normalizedUrl;
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl;
  const failed = cloud && localImage?.key === imageKey && localImage.failed;

  useEffect(() => {
    if (!cloud || !holderRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(holderRef.current);
    return () => observer.disconnect();
  }, [cloud, imageKey]);

  useEffect(() => {
    if (!cloud || !visible) return;
    let active = true;
    setLocalImage(null);
    setFailedUrl(null);
    void (async () => {
      try {
        const reference = cloudSessionId ? await loadSessionCover(cloudSessionId) : normalizedUrl;
        const value = reference ? await readRecoveryCover(reference, Boolean(cloudSessionId) || retry > 0) : null;
        if (active) setLocalImage({ key: imageKey, value, failed: false });
      } catch {
        if (active) setLocalImage({ key: imageKey, value: null, failed: true });
      }
    })();
    return () => { active = false; };
  }, [cloud, visible, imageKey, cloudSessionId, normalizedUrl, retry]);
  const thumbnailClass = [
    "archive-cover-thumbnail",
    sizeClass[size],
    "aspect-[16/9]",
    "shrink-0",
    "overflow-hidden",
    "rounded-md",
    "border",
    "border-line",
    "bg-raised",
  ].join(" ");

  return (
    <span ref={holderRef} className="inline-flex shrink-0">
      {showImage && !previewEnabled ? (
        <span className={thumbnailClass}><img src={imageUrl!} alt={alt} className="size-full object-cover" onError={() => setFailedUrl(imageUrl)} /></span>
      ) : showImage ? (
        <button
          ref={triggerRef}
          type="button"
          className={`${thumbnailClass} cursor-zoom-in p-0 text-left transition-[border-color,box-shadow] hover:border-accent/70 hover:shadow-lg hover:shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring`}
          aria-label={`查看${alt}`}
          title="查看封面预览"
          onClick={() => setPreviewOpen(true)}
        >
          <img
            src={imageUrl ?? undefined}
            alt={alt}
            loading={size === "session-list" ? "lazy" : "eager"}
            referrerPolicy="no-referrer"
            className="size-full object-cover"
            onError={() => setFailedUrl(imageUrl)}
          />
        </button>
      ) : failed ? (
        <button type="button" className={`${thumbnailClass} ui-type-micro text-t3 hover:text-t1 focus-visible:ring-2 focus-visible:ring-accent-ring`}
          title="封面未能加载，请检查服务器连接后重试" onClick={() => setRetry(value => value + 1)}>重试封面</button>
      ) : (
        <span
          className={thumbnailClass}
          role="img"
          aria-label={alt + "（暂无封面）"}
        >
          <span className="flex size-full items-center justify-center px-1 text-center ui-type-meta text-t3">{cloud && visible && localImage === null ? '加载封面…' : '暂无封面'}</span>
        </span>
      )}
      {showImage && imageUrl && previewEnabled && (
        <ImagePreviewOverlay
          open={previewOpen}
          src={imageUrl}
          alt={alt}
          label={`${alt}预览`}
          closeLabel="关闭封面预览"
          variant="cover"
          restoreFocusRef={triggerRef}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </span>
  );
}
