import { uiText } from "../i18n/index.ts";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, ImageUp } from "lucide-react";
import { UiSelect } from "./ui/Select.tsx";
import {
  useThemeImageAssets,
  type ThemeImageAsset,
} from "./ThemeImageAssets.tsx";

export function ThemeImagePicker({
  label,
  onChoose,
  onReplace,
  single = false,
}: {
  label: string;
  onChoose: (asset: ThemeImageAsset) => void;
  onReplace?: (asset: ThemeImageAsset) => void;
  single?: boolean;
}) {
  const assets = useThemeImageAssets();
  const [path, setPath] = useState("");
  const [pending, setPending] = useState<{
    path: string;
    replace: boolean;
  } | null>(null);
  const callbacks = useRef({ onChoose, onReplace });
  callbacks.current = { onChoose, onReplace };
  useEffect(() => {
    const asset = assets?.images.find((item) => item.path === pending?.path);
    if (asset && asset.ready !== false && pending) {
      setPath(asset.path);
      setPending(null);
      (pending.replace
        ? callbacks.current.onReplace
        : callbacks.current.onChoose)?.(asset);
    }
  }, [assets?.images, pending]);
  const importImage = async (replace = false) => {
    const added = await assets?.add();
    if (added) setPending({ path: added, replace });
  };
  const selected = assets?.images.find((item) => item.path === path);
  const useImage = (replace: boolean) => {
    if (!path) {
      void importImage(replace);
      return;
    }
    if (!selected || selected.ready === false) return;
    (replace ? onReplace : onChoose)?.(selected);
  };
  return (
    <div className="theme-image-assets theme-image-picker">
      <UiSelect
        ariaLabel={label}
        value={path}
        onValueChange={setPath}
        options={[
          { value: "", label: uiText("themeImagePicker.options.label") },
          ...(assets?.images.map((asset) => ({
            value: asset.path,
            label: asset.name,
          })) ?? []),
        ]}
      />
      <button
        type="button"
        disabled={!assets || Boolean(path && selected?.ready === false)}
        onClick={() => useImage(single && Boolean(onReplace))}
      >
        <ImagePlus size={18} />
        {single
          ? path
            ? uiText("themeImagePicker.ThemeImagePicker")
            : onReplace
              ? uiText("themeImagePicker.ThemeImagePicker2")
              : uiText("themeImagePicker.ThemeImagePicker3")
          : uiText("themeImagePicker.ThemeImagePicker4")}
      </button>
      {!single && onReplace && (
        <button
          type="button"
          disabled={Boolean(path && selected?.ready === false)}
          onClick={() => useImage(true)}
        >
          <ImageUp size={18} />
          {uiText("themeImagePicker.ThemeImagePicker2")}</button>
      )}
    </div>
  );
}
