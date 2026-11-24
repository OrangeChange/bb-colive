import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { accentSolidButtonClass, dangerSolidButtonClass } from "./actionButtonStyles";

export type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  confirmTone?: "accent" | "danger";
  errorMessage?: string | ((error: unknown) => string);
  children?: ReactNode;
  confirmDisabled?: boolean;
  cancelAriaLabel?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

/** 应用内的确认对话框：不调用浏览器原生 confirm，并保留焦点与 Escape 语义。 */
export function ConfirmDialog({ title, description, confirmLabel, confirmTone = "accent", errorMessage = "操作失败，请稍后重试。", children, confirmDisabled = false, cancelAriaLabel = "取消", onCancel, onConfirm }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const onConfirmRef = useRef(onConfirm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const descriptionId = useId();

  onCancelRef.current = onCancel;
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [busy]);

  const confirm = async () => {
    if (busy || confirmDisabled) return;
    setBusy(true);
    setError("");
    try {
      await onConfirmRef.current();
      onCancelRef.current();
    } catch (error) {
      setError(typeof errorMessage === "function" ? errorMessage(error) : errorMessage);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="ui-modal-overlay settings-confirm-overlay fixed inset-0 z-[100] flex items-center justify-center p-3" role="presentation">
      <button
        type="button"
        className="settings-confirm-backdrop absolute inset-0 h-full w-full border-0 bg-black/35"
        aria-label={cancelAriaLabel}
        disabled={busy}
        onClick={onCancel}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="ui-modal-surface settings-confirm-dialog relative z-10 w-[min(440px,calc(100vw-24px))] rounded-lg border border-line bg-surface p-4 shadow-2xl shadow-black/30"
      >
        <h3 id={titleId} className="ui-type-section-title font-medium text-t1">{title}</h3>
        <p id={descriptionId} className="mt-2 ui-type-control leading-5 text-t2">{description}</p>
        {children && <fieldset disabled={busy} className="mt-3 min-w-0 border-0 p-0">{children}</fieldset>}
        {error && <p role="alert" className="mt-2 ui-type-control text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 transition-colors enabled:hover:bg-raised enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-50"
          >取消</button>
          <button
            type="button"
            disabled={busy || confirmDisabled}
            onClick={() => void confirm()}
            className={confirmTone === "danger" ? dangerSolidButtonClass : accentSolidButtonClass}
          >{busy ? "处理中…" : confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
