import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useContext, type ReactNode } from "react";
import {
  ThemeImageEditingContext,
  ThemeImagePreview,
} from "./ThemeImagePreview.tsx";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./shadcn/dialog";

export function ThemeImageDialog({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
}) {
  useUiLanguage();
  const editing = useContext(ThemeImageEditingContext);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        asChild
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-w-none gap-0 p-0"
      >
        <section className="theme-image-dialog">
          <header>
            <div>
              <DialogTitle asChild>
                <h3>{title}</h3>
              </DialogTitle>
              {editing.scope && (
                <p className="theme-image-scope">{editing.scope}</p>
              )}
            </div>
            <Button size="icon-sm"
              variant="ghost"
              type="button"
              aria-label={uiText("themeImageDialog.aria_label", {
                title: title,
              })}
              title={uiText("common.close")}
              onClick={onClose}
            >
              <X size={18} aria-hidden="true" />
            </Button>
          </header>
          <div className="theme-image-dialog-content">
            <ThemeImagePreview />
            <div className="theme-image-dialog-body">{children}</div>
          </div>
          <footer>{actions}</footer>
        </section>
      </DialogContent>
    </Dialog>
  );
}
