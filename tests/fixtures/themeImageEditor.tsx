import { ThemeImageEditingContext } from "../../src/components/ThemeImagePreview.tsx";
import {
  imageBackgroundCss,
  type ImageBackgroundDraft,
} from "../../src/components/themeImageValue.ts";
import { ThemeDecorationField } from "../../src/components/ThemeDecorationField.tsx";
import {
  renderThemeImageDecorations,
  type ThemeDecoration,
} from "../../src/themes/themeImageDecorations.ts";
import { ThemeImageBorderField } from "../../src/components/ThemeImageBorderField.tsx";
import { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ThemeVisualPropertyField } from "../../src/components/ThemeVisualPropertyField.tsx";
import { ThemeImageAssetsContext } from "../../src/components/ThemeImageAssets.tsx";
const url =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="teal"/></svg>',
  );
function Fixture() {
  const [previewRoot, setPreviewRoot] = useState<HTMLDivElement | null>(null);
  const [imported, setImported] = useState(false);
  const [importReady, setImportReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [images, setImages] = useState<ThemeDecoration[]>([]);
  const [avatarImages, setAvatarImages] = useState<ThemeDecoration[]>([]);
  const [previewAvatars, setPreviewAvatars] = useState<
    ThemeDecoration[] | null
  >(null);
  const [previewImages, setPreviewImages] = useState<ThemeDecoration[] | null>(
    null,
  );
  const [previewValue, setPreviewValue] = useState<
    string | ImageBackgroundDraft | null
  >(null);
  const [border, setBorder] = useState("none");
  const [previewBorder, setPreviewBorder] = useState<string | null>(null);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    let style = doc.getElementById("decorations");
    if (!style) {
      style = doc.createElement("style");
      style.id = "decorations";
      doc.body.append(style);
    }
    style.textContent =
      renderThemeImageDecorations(
        { example: previewImages ?? images },
        () => ".host",
      ) +
      renderThemeImageDecorations(
        { "common|all|all|avatarFrame": previewAvatars ?? avatarImages },
        () => ".avatar-host",
      );
  }, [images, previewImages, avatarImages, previewAvatars]);

  const [value, setValue] = useState<string | ImageBackgroundDraft>(
    "linear-gradient(red, blue) center / cover no-repeat rgb(1, 2, 3)",
  );
  return (
    <ThemeImageAssetsContext.Provider
      value={{
        images: [
          { path: "assets/example.svg", name: "示例", url },
          ...(imported
            ? [
                {
                  path: "assets/imported.svg",
                  name: "导入图片",
                  url: importReady ? url : "assets/not-ready.svg",
                  ready: importReady,
                },
              ]
            : []),
        ],
        add: async () => {
          setImported(true);
          setTimeout(() => setImportReady(true), 100);
          return "assets/imported.svg";
        },
      }}
    >
      <ThemeImageEditingContext.Provider
        value={{
          root: previewRoot,
          selector: ".host",
          scope: "普通礼物 · 所有用户 · 用户信息 · 浅色",
        }}
      >
        <div
          ref={setPreviewRoot}
          className="native-preview-stage"
          style={{
            backgroundColor: "rgb(234, 226, 218)",
            backgroundImage:
              "linear-gradient(45deg, #ddd 25%, transparent 25%)",
          }}
        >
          <iframe
            ref={frame}
            title="装饰目标"
            srcDoc={
              '<style>.clip{height:60px;overflow:hidden}.host{position:relative;width:400px;min-height:100px}.avatar-host{width:24px;height:24px;overflow:hidden;border-radius:50%}</style><div class="clip"><div class="event" style="background:rgb(200,0,0)"><div class="host">示例正文</div></div></div><div class="avatar-host"><img></div>'
            }
          />
        </div>
        <ThemeDecorationField
          root={previewRoot}
          selector=".host"
          images={images}
          onChange={setImages}
          onPreviewChange={setPreviewImages}
          onPreviewCancel={() => setPreviewImages(null)}
        />
        <output id="decor-count">{images.length}</output>
        <ThemeDecorationField
          avatarFrame
          root={previewRoot}
          selector=".avatar-host"
          images={avatarImages}
          onChange={setAvatarImages}
          onPreviewChange={setPreviewAvatars}
          onPreviewCancel={() => setPreviewAvatars(null)}
        />
        <ThemeVisualPropertyField
          property="background"
          status="继承主题"
          missing={previewValue !== null}
          fontFamilyOptions={[]}
          onOpenFonts={() => {}}
          value={value}
          onChange={(next) => setValue(next as string | ImageBackgroundDraft)}
          onPreviewChange={(next) =>
            setPreviewValue(next as string | ImageBackgroundDraft)
          }
          onPreviewCancel={() => setPreviewValue(null)}
        />
        <ThemeImageBorderField
          value={border}
          onChange={setBorder}
          onPreviewChange={setPreviewBorder}
          onPreviewCancel={() => setPreviewBorder(null)}
        />
        <output id="border-output">{border}</output>
        <output id="value">{imageBackgroundCss(value)}</output>
        <div
          id="sample"
          style={{
            width: 400,
            height: 160,
            background: imageBackgroundCss(previewValue ?? value),
            borderImage: previewBorder ?? border,
          }}
        />
      </ThemeImageEditingContext.Provider>
    </ThemeImageAssetsContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
