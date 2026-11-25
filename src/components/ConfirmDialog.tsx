import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "./shadcn/alert-dialog";
import { Button } from "./shadcn/button";
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

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmTone = "accent",
  errorMessage = uiText("confirmDialog.ConfirmDialog"),
  children,
  confirmDisabled = false,
  cancelAriaLabel = uiText("common.cancel"),
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useUiLanguage();
  const cancel = useRef<HTMLButtonElement>(null);
  const previous = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const confirm = async () => {
    if (busy || confirmDisabled) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onCancel();
    } catch (cause) {
      setError(
        typeof errorMessage === "function" ? errorMessage(cause) : errorMessage,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogContent
        className="settings-confirm-dialog"
        onBackdropClick={() => { if (!busy) onCancel(); }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          previous.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children && (
          <div className="mt-3 min-w-0" inert={busy || undefined}>
            {children}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 ui-type-control text-danger">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <Button
            ref={cancel}
            variant="outline"
            aria-label={cancelAriaLabel}
            disabled={busy}
            onClick={onCancel}
          >
            {uiText("common.cancel")}
          </Button>
          <Button
            variant={confirmTone === "danger" ? "destructive" : "default"}
            disabled={busy || confirmDisabled}
            onClick={() => void confirm()}
          >
            {busy ? uiText("confirmDialog.ConfirmDialog2") : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
