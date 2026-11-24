import { uiText } from "../i18n/index.ts";
import { imageTargetNodes } from "./ThemeImagePreview.tsx";
import { ThemeImagePicker } from "./ThemeImagePicker.tsx";
import { ThemeImageDialog } from "./ThemeImageDialog.tsx";
import { UiSelect } from "./ui/Select.tsx";
import { ThemeNumberInput } from "./ThemeNumberInput.tsx";
import { Fragment, useState, useRef, useEffect } from "react";
import {
  ImagePlus,
  X,
  Eye,
  EyeOff,
  Link,
  Link2Off,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  GripVertical,
} from "lucide-react";
import {
  type ThemeImageAsset,
  useThemeImageAssets,
} from "./ThemeImageAssets.tsx";
import { inspectImageTarget } from "./themeImageTarget.ts";
import type { ThemeDecoration } from "../themes/themeImageDecorations.ts";

function targetNodes(
  root: HTMLElement | null | undefined,
  selector: string,
): HTMLElement[] {
  return imageTargetNodes(root, selector).sort(
    (a, b) =>
      Number(Boolean(a.closest(".event-sticky,.sticky"))) -
      Number(Boolean(b.closest(".event-sticky,.sticky"))),
  );
}
export function ThemeDecorationField({
  root,
  selector,
  images,
  onChange,
  onPreviewChange,
  onPreviewCancel,
  onInherit,
  onPreviewInherit,
  inherited = false,
  avatarFrame = false,
  scale,
}: {
  scale?: { variable: string; value: number };
  avatarFrame?: boolean;
  root?: HTMLElement | null;
  selector: string;
  images: ThemeDecoration[];
  onChange: (images: ThemeDecoration[]) => void;
  onPreviewChange?: (images: ThemeDecoration[]) => void;
  onPreviewCancel?: () => void;
  onInherit?: () => void;
  onPreviewInherit?: () => void;
  inherited?: boolean;
}) {
  const assets = useThemeImageAssets(),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState(0),
    [message, setMessage] = useState("");
  const highlighted = useRef<{
    node: HTMLElement;
    outline: string;
    offset: string;
  } | null>(null);
  const clearHighlight = () => {
    const previous = highlighted.current;
    if (previous) {
      previous.node.style.outline = previous.outline;
      previous.node.style.outlineOffset = previous.offset;
      highlighted.current = null;
    }
  };
  useEffect(() => {
    if (!open) clearHighlight();
    return clearHighlight;
  }, [open]);
  const showReference = () => {
    clearHighlight();
    const node = targetNodes(root, selector)[0];
    if (!node) return;
    const reference = (
      avatarFrame || item?.localReference
        ? node
        : inspectImageTarget(node).reference
    ) as HTMLElement | null;
    if (!reference) return;
    highlighted.current = {
      node: reference,
      outline: reference.style.outline,
      offset: reference.style.outlineOffset,
    };
    reference.style.outline = "2px dashed #30766c";
    reference.style.outlineOffset = "-2px";
  };
  const [reference, setReference] = useState("");
  const [referenceIsCurrent, setReferenceIsCurrent] = useState(false);
  const [clippingLabel, setClippingLabel] = useState("");
  const clippingTargets = useRef<HTMLElement[]>([]);
  const showClipping = () => {
    clearHighlight();
    const node = clippingTargets.current[0];
    if (!node) return;
    highlighted.current = {
      node,
      outline: node.style.outline,
      offset: node.style.outlineOffset,
    };
    node.style.outline = "2px dashed #30766c";
    node.style.outlineOffset = "-2px";
  };
  const [existing, setExisting] = useState<
    Array<{ slot: "before" | "after"; candidate?: ThemeDecoration }>
  >([]);
  const [draft, setDraft] = useState<ThemeDecoration[]>([]);
  const hiddenFrame = (): ThemeDecoration[] => [
    {
      id: crypto.randomUUID(),
      source: "",
      width: 1,
      height: 1,
      slot: "after",
      visible: false,
      flow: false,
      alignment: [50, 50],
      anchor: [
        { value: 50, unit: "%" },
        { value: 50, unit: "%" },
      ],
      move: [
        { value: 0, unit: "px" },
        { value: 0, unit: "px" },
      ],
    },
  ];
  const [avatarMode, setAvatarMode] = useState<"inherit" | "custom" | "hidden">(
    "inherit",
  );
  const callbacks = useRef({ onPreviewChange, onPreviewCancel });
  callbacks.current = { onPreviewChange, onPreviewCancel };
  const withAvatarRatios = (images: ThemeDecoration[]) => {
    const bounds = avatarFrame
      ? targetNodes(root, selector)[0]?.getBoundingClientRect()
      : undefined;
    return bounds && bounds.width > 0 && bounds.height > 0
      ? images.map((image) => ({
          ...image,
          avatarRatio: {
            width: image.width / bounds.width,
            height: image.height / bounds.height,
          },
        }))
      : images;
  };
  useEffect(() => {
    if (open && avatarFrame && avatarMode === "inherit") onPreviewInherit?.();
    else if (open)
      callbacks.current.onPreviewChange?.(
        avatarFrame && avatarMode === "hidden"
          ? hiddenFrame()
          : withAvatarRatios(draft),
      );
    else callbacks.current.onPreviewCancel?.();
  }, [open, draft, avatarMode]);
  useEffect(() => () => callbacks.current.onPreviewCancel?.(), []);
  const [locked, setLocked] = useState(true);

  const item = draft[selected];
  const update = (patch: Partial<ThemeDecoration>) =>
    setDraft((current) =>
      current.map((entry, index) =>
        index === selected ? { ...entry, ...patch } : entry,
      ),
    );
  const changeCoordinate = (
    group: "move" | "anchor",
    axis: number,
    value: number,
    unit = item[group][axis].unit,
  ) => {
    const next = structuredClone(item[group]);
    next[axis] = { value, unit };
    if (group === "move") {
      update({ move: next });
      return;
    }
    const dimension = axis === 0 ? item.width : item.height;
    const pixels = (coordinate: ThemeDecoration["anchor"][number]) =>
      coordinate.unit === "%"
        ? (coordinate.value * dimension) / 100
        : coordinate.value;
    const difference = pixels(next[axis]) - pixels(item.anchor[axis]);
    const move = structuredClone(item.move);
    const compensation: [number, number] = [...(item.compensation ?? [0, 0])];
    if (move[axis].unit === "px") move[axis].value += difference;
    else compensation[axis] += difference;
    update({ anchor: next, move, compensation });
  };
  const add = (asset: ThemeImageAsset, replace = false) => {
    const nodes = targetNodes(root, selector);
    if (!nodes.length) {
      setMessage(uiText("themeDecorationField.ThemeDecorationField.add"));
      return;
    }
    if (replace && item?.source) {
      update({ source: asset.path });
      setMessage("");
      return;
    }
    const contexts = nodes.map(inspectImageTarget);
    if (contexts.some((c) => !c.box || c.replaced)) {
      setMessage(uiText("themeDecorationField.ThemeDecorationField.add2"));
      return;
    }
    let slot =
      (avatarFrame
        ? images.find((image) => image.visible && image.source)?.slot
        : undefined) ??
      (["before", "after"] as const).find(
        (slot) =>
          !draft.some((i) => i.slot === slot) &&
          contexts.every((c) => !c[slot].occupied),
      );
    if (!slot && !avatarFrame)
      slot = (["before", "after"] as const).find(
        (slot) =>
          draft.some((image) => image.slot === slot) &&
          draft
            .filter((image) => image.slot === slot)
            .every((image) => !image.flow),
      );
    if (!slot) {
      setMessage(
        draft.filter((image) => image.flow).length === 2
          ? uiText("themeDecorationField.ThemeDecorationField.add3")
          : uiText("themeDecorationField.ThemeDecorationField.add4"),
      );
      return;
    }
    const image = new Image();
    image.onload = () => {
      setDraft((current) => [
        ...(avatarFrame ? [] : current),
        {
          id: crypto.randomUUID(),
          source: asset.path,
          basis: scale,
          ...(avatarFrame &&
          (images.some((image) => image.avatarClipRadius !== undefined) ||
            /hidden|clip/.test(getComputedStyle(nodes[0]).overflow))
            ? {
                avatarClipRadius:
                  images.find((image) => image.avatarClipRadius !== undefined)
                    ?.avatarClipRadius ??
                  getComputedStyle(nodes[0]).borderRadius,
              }
            : {}),
          width: avatarFrame
            ? nodes[0].getBoundingClientRect().width * 1.2
            : image.naturalWidth,
          height: avatarFrame
            ? (nodes[0].getBoundingClientRect().width *
                1.2 *
                image.naturalHeight) /
              image.naturalWidth
            : image.naturalHeight,
          slot: slot ?? draft[0]?.slot ?? "after",
          visible: true,
          flow: !avatarFrame && !draft.some((entry) => entry.slot === slot),
          alignment: avatarFrame ? [50, 50] : [0, 0],
          anchor: [
            { value: avatarFrame ? 50 : 0, unit: "%" },
            { value: avatarFrame ? 50 : 0, unit: "%" },
          ],
          move: [
            { value: 0, unit: "px" },
            { value: 0, unit: "px" },
          ],
        },
      ]);
      if (avatarFrame) setAvatarMode("custom");
      setSelected(avatarFrame ? 0 : draft.length);
      setMessage("");
    };
    image.onerror = () => setMessage(uiText("themeDecorationField.ThemeDecorationField.add5"));
    image.src = asset.url;
  };
  return (
    <div className="theme-image-field">
      <button
        type="button"
        onClick={() => {
          const nodes = targetNodes(root, selector);
          const ref = nodes[0] ? inspectImageTarget(nodes[0]).reference : null;
          const first = nodes[0];
          clippingTargets.current = nodes.flatMap(
            (node) => inspectImageTarget(node).clipping,
          ) as HTMLElement[];
          setClippingLabel(
            [
              ...new Set(
                clippingTargets.current.map((node) =>
                  node.matches(".event-list,#items")
                    ? uiText("themeDecorationField.onClick")
                    : node.matches(".event")
                      ? uiText("themeDecorationField.onClick2")
                      : node.matches(".event-area")
                        ? uiText("themeDecorationField.onClick3")
                        : uiText("themeDecorationField.onClick4"),
                ),
              ),
            ].join("、"),
          );
          setExisting(
            first
              ? (["before", "after"] as const).flatMap((slot) => {
                  if (
                    images.some((image) => image.visible && image.slot === slot)
                  )
                    return [];
                  const context = inspectImageTarget(first);
                  if (!context[slot].occupied) return [];
                  const style =
                    first.ownerDocument.defaultView!.getComputedStyle(
                      first,
                      `::${slot}`,
                    );
                  const match = /^url\(["']?(.*?)["']?\)$/.exec(
                    style.backgroundImage,
                  );
                  const width = parseFloat(style.width),
                    height = parseFloat(style.height);
                  const candidate =
                    match &&
                    style.animationName === "none" &&
                    style.transform === "none" &&
                    Number.isFinite(width) &&
                    Number.isFinite(height) &&
                    ['""', "''"].includes(style.content)
                      ? ({
                          id: crypto.randomUUID(),
                          source:
                            assets?.images.find(
                              (asset) => asset.url === match[1],
                            )?.path ?? match[1],
                          width,
                          height,
                          slot,
                          visible: true,
                          flow: style.position !== "absolute",
                          alignment: [0, 0],
                          anchor: [
                            { value: 0, unit: "%" },
                            { value: 0, unit: "%" },
                          ],
                          move: [
                            { value: parseFloat(style.left) || 0, unit: "px" },
                            { value: parseFloat(style.top) || 0, unit: "px" },
                          ],
                          basis: scale,
                        } as ThemeDecoration)
                      : undefined;
                  return [{ slot, candidate }];
                })
              : [],
          );
          setReferenceIsCurrent(ref === nodes[0]);
          setReference(
            ref
              ? ref === nodes[0]
                ? uiText("themeDecorationField.currentPart")
                : ref.matches(
                      ".event,yt-live-chat-text-message-renderer,yt-live-chat-paid-message-renderer,yt-live-chat-membership-item-renderer",
                    )
                  ? uiText("themeDecorationField.onClick5")
                  : ref.matches(".event-list,#items")
                    ? uiText("themeDecorationField.onClick")
                    : uiText("themeDecorationField.onClick4")
              : uiText("themeDecorationField.onClick6"),
          );
          setDraft(
            structuredClone(images).map((image) => {
              if ((!scale || !image.basis) && !image.avatarRatio) return image;
              const factor =
                scale && image.basis ? scale.value / image.basis.value : 1;
              return {
                ...image,
                basis: scale,
                compensation: image.compensation?.map(
                  (value) => value * factor,
                ) as [number, number] | undefined,
                width:
                  avatarFrame && image.avatarRatio && nodes[0]
                    ? nodes[0].getBoundingClientRect().width *
                      image.avatarRatio.width
                    : image.width * factor,
                height:
                  avatarFrame && image.avatarRatio && nodes[0]
                    ? nodes[0].getBoundingClientRect().height *
                      image.avatarRatio.height
                    : image.height * factor,
                anchor: image.anchor.map((v) =>
                  v.unit === "px" ? { ...v, value: v.value * factor } : v,
                ) as ThemeDecoration["anchor"],
                move: image.move.map((v) =>
                  v.unit === "px" ? { ...v, value: v.value * factor } : v,
                ) as ThemeDecoration["move"],
              };
            }),
          );
          setSelected(0);
          setLocked(true);
          setAvatarMode(
            inherited || !images.length
              ? "inherit"
              : images.every((image) => !image.visible)
                ? "hidden"
                : "custom",
          );
          setMessage("");
          setOpen(true);
        }}
      >
        <ImagePlus size={18} />
        {avatarFrame ? uiText("themeDecorationField.ThemeDecorationField") : uiText("themeDecorationField.ThemeDecorationField2")}
      </button>
      {open && (
        <ThemeImageDialog
          title={avatarFrame ? uiText("themeDecorationField.title") : uiText("themeDecorationField.title2")}
          onClose={() => setOpen(false)}
          actions={
            <>
              <button type="button" onClick={() => setOpen(false)}>
                {uiText("common.cancel")}</button>
              <button
                type="button"
                disabled={
                  avatarFrame &&
                  avatarMode === "custom" &&
                  !draft.some((image) => image.source)
                }
                onClick={() => {
                  if (avatarFrame && avatarMode === "inherit") onInherit?.();
                  else
                    onChange(
                      avatarFrame && avatarMode === "hidden"
                        ? hiddenFrame()
                        : withAvatarRatios(draft),
                    );
                  setOpen(false);
                }}
              >
                {uiText("themeDecorationField.actions")}</button>
            </>
          }
        >
          {avatarFrame && (
            <div
              className="theme-image-modes"
              role="group"
              aria-label={uiText("themeDecorationField.aria_label")}
            >
              {(
                [
                  ["inherit", uiText("themeDecorationField.ThemeDecorationField3")],
                  ["custom", uiText("themeDecorationField.ThemeDecorationField4")],
                  ["hidden", uiText("themeDecorationField.ThemeDecorationField5")],
                ] as const
              ).map(([mode, label]) => (
                <button
                  type="button"
                  key={mode}
                  aria-pressed={avatarMode === mode}
                  onClick={() => {
                    setAvatarMode(mode);
                    if (mode === "custom" && !draft[0]?.source) setDraft([]);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {(!avatarFrame || avatarMode === "custom") && (
            <>
              {!avatarFrame && onInherit && (
                <button
                  type="button"
                  onClick={() => {
                    onInherit();
                    setOpen(false);
                  }}
                >
                  {uiText("themeDecorationField.ThemeDecorationField6")}</button>
              )}
              <ThemeImagePicker
                label={uiText("themeDecorationField.label")}
                single={avatarFrame}
                onChoose={(asset) => add(asset, avatarFrame)}
                onReplace={
                  item?.source ? (asset) => add(asset, true) : undefined
                }
              />
              {message && <p role="status">{message}</p>}
              {clippingLabel && (
                <details className="theme-image-hint">
                  <summary>{uiText("themeDecorationField.ThemeDecorationField7")}{clippingLabel.split("、")[0]}</summary>
                  <p>{uiText("themeDecorationField.ThemeDecorationField8")}{clippingLabel.split("、")[0]}{uiText("themeDecorationField.ThemeDecorationField9")}</p>
                  {clippingLabel.includes("、") && (
                    <details>
                      <summary>{uiText("themeDecorationField.ThemeDecorationField10")}</summary>
                      {clippingLabel.split("、").slice(1).join("、")}
                    </details>
                  )}
                  <button
                    type="button"
                    onMouseEnter={showClipping}
                    onMouseLeave={clearHighlight}
                    onFocus={showClipping}
                    onBlur={clearHighlight}
                  >
                    {uiText("themeDecorationField.ThemeDecorationField11")}</button>
                </details>
              )}
              {existing.map((entry) => (
                <div key={entry.slot} className="theme-image-hint">
                  {uiText("themeDecorationField.ThemeDecorationField12")}{entry.slot === "before" ? uiText("themeDecorationField.ThemeDecorationField13") : uiText("themeDecorationField.ThemeDecorationField14")}：
                  {entry.candidate ? (
                    <button
                      type="button"
                      disabled={draft.some(
                        (image) => image.slot === entry.slot,
                      )}
                      onClick={() => {
                        setDraft((current) => [...current, entry.candidate!]);
                        setSelected(draft.length);
                      }}
                    >
                      {uiText("themeDecorationField.ThemeDecorationField15")}</button>
                  ) : (
                    <span>{uiText("themeDecorationField.ThemeDecorationField16")}</span>
                  )}
                </div>
              ))}
              {!avatarFrame && (
                <>
                  <p className="theme-image-hint">
                    {uiText("themeDecorationField.ThemeDecorationField17")}</p>
                  <div className="theme-image-layers">
                    {draft.map((entry, index) => (
                      <div
                        key={entry.id}
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData(
                            "application/x-decoration",
                            String(index),
                          )
                        }
                        onDragOver={(e) => {
                          if (
                            e.dataTransfer.types.includes(
                              "application/x-decoration",
                            )
                          )
                            e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const raw = e.dataTransfer.getData(
                            "application/x-decoration",
                          );
                          if (raw === "") return;
                          const from = Number(raw);
                          if (!draft[from]) return;
                          const next = [...draft];
                          const [image] = next.splice(from, 1);
                          next.splice(index, 0, image);
                          setDraft(next);
                          setSelected(index);
                        }}
                      >
                        <span className="theme-image-grip" title={uiText("themeDecorationField.title3")}>
                          <GripVertical size={18} />
                        </span>
                        <span
                          className="theme-image-thumbnail"
                          style={{
                            backgroundImage: `url(${JSON.stringify(assets?.images.find((asset) => asset.path === entry.source)?.url ?? entry.source)})`,
                          }}
                        />
                        <button
                          type="button"
                          className="theme-image-layer-name"
                          onClick={() => setSelected(index)}
                        >
                          {assets?.images.find((a) => a.path === entry.source)
                            ?.name ??
                            (entry.source.startsWith("data:")
                              ? uiText("themeDecorationField.ThemeDecorationField18")
                              : entry.source.split("/").pop()?.slice(0, 80) ||
                                uiText("themeDecorationField.ThemeDecorationField19"))}
                        </button>
                        <button
                          type="button"
                          aria-label={uiText("themeDecorationField.aria_label2")}
                          disabled={index === 0}
                          onClick={() => {
                            const next = [...draft];
                            [next[index], next[index - 1]] = [
                              next[index - 1],
                              next[index],
                            ];
                            setDraft(next);
                            setSelected(index - 1);
                          }}
                        >
                          <ArrowUp size={18} />
                        </button>
                        <button
                          type="button"
                          aria-label={uiText("themeDecorationField.aria_label3")}
                          disabled={index === draft.length - 1}
                          onClick={() => {
                            const next = [...draft];
                            [next[index], next[index + 1]] = [
                              next[index + 1],
                              next[index],
                            ];
                            setDraft(next);
                            setSelected(index + 1);
                          }}
                        >
                          <ArrowDown size={18} />
                        </button>
                        <button
                          type="button"
                          aria-label={uiText("themeDecorationField.aria_label4")}
                          onClick={() =>
                            setDraft((current) =>
                              current.map((i, n) =>
                                n === index ? { ...i, visible: !i.visible } : i,
                              ),
                            )
                          }
                        >
                          {entry.visible ? (
                            <Eye size={18} />
                          ) : (
                            <EyeOff size={18} />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={uiText("themeDecorationField.aria_label5")}
                          onClick={() => {
                            setDraft((current) =>
                              current.filter((_, n) => n !== index),
                            );
                            setSelected(0);
                          }}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {item && (!avatarFrame || item.source) && (
                <div className="theme-image-properties">
                  {!avatarFrame && (
                    <label>
                      {uiText("themeDecorationField.ThemeDecorationField20")}<UiSelect
                        ariaLabel={uiText("themeDecorationField.ariaLabel3")}
                        value={item.flow ? "flow" : "absolute"}
                        onValueChange={(selectedValue) =>
                          selectedValue === "flow" &&
                          draft.some(
                            (entry) =>
                              entry.id !== item.id && entry.slot === item.slot,
                          )
                            ? setMessage(
                                uiText("themeDecorationField.onValueChange"),
                              )
                            : update({ flow: selectedValue === "flow" })
                        }
                        options={[
                          { value: "flow", label: uiText("themeDecorationField.options.label") },
                          { value: "absolute", label: uiText("themeDecorationField.options.label2") },
                        ]}
                      />
                    </label>
                  )}
                  {!avatarFrame && (
                    <p className="theme-image-hint">
                      {item.flow
                        ? uiText("themeDecorationField.ThemeDecorationField21")
                        : uiText("themeDecorationField.ThemeDecorationField22")}
                    </p>
                  )}
                  {!item.flow && !avatarFrame && (
                    <label>
                      {uiText("themeDecorationField.ThemeDecorationField23")}<UiSelect
                        ariaLabel={uiText("themeDecorationField.ariaLabel4")}
                        value={item.depth ?? "front"}
                        onValueChange={(selectedValue) =>
                          setDraft((current) =>
                            current.map((entry) =>
                              entry.slot === item.slot
                                ? {
                                    ...entry,
                                    depth: selectedValue as "front" | "back",
                                  }
                                : entry,
                            ),
                          )
                        }
                        options={[
                          { value: "front", label: uiText("themeDecorationField.options.label3") },
                          { value: "back", label: uiText("themeDecorationField.options.label4") },
                        ]}
                      />
                    </label>
                  )}
                  <details
                    className="theme-image-slot"
                    open={item.flow}
                    hidden={avatarFrame}
                  >
                    <summary>{item.flow ? uiText("themeDecorationField.ThemeDecorationField24") : uiText("themeDecorationField.ThemeDecorationField25")}</summary>{" "}
                    <label>
                      {item.flow ? uiText("themeDecorationField.ThemeDecorationField24") : uiText("themeDecorationField.ThemeDecorationField25")}
                      <UiSelect
                        ariaLabel={uiText("themeDecorationField.ariaLabel5")}
                        value={item.slot}
                        onValueChange={(selectedValue) => {
                          const slot = selectedValue as "before" | "after";
                          const nodes = targetNodes(root, selector);
                          if (
                            draft.some(
                              (i) => i.id !== item.id && i.slot === slot,
                            ) ||
                            nodes.some(
                              (n) =>
                                inspectImageTarget(n)[slot].occupied &&
                                !images.some((i) => i.slot === slot),
                            )
                          ) {
                            setMessage(uiText("themeDecorationField.onValueChange2"));
                            return;
                          }
                          update({ slot });
                        }}
                        options={[
                          {
                            value: "before",
                            label: item.flow ? uiText("themeDecorationField.options.label5") : uiText("themeDecorationField.options.label6"),
                          },
                          {
                            value: "after",
                            label: item.flow ? uiText("themeDecorationField.options.label7") : uiText("themeDecorationField.options.label8"),
                          },
                        ]}
                      />
                    </label>
                  </details>
                  {!item.flow && (
                    <>
                      <p className="theme-image-hint">
                        {uiText("themeDecorationField.ThemeDecorationField26")}{avatarFrame
                          ? uiText("themeDecorationField.ThemeDecorationField27")
                          : item.localReference
                            ? uiText("themeDecorationField.currentPart")
                            : reference}
                        {uiText("themeDecorationField.ThemeDecorationField28")}</p>
                      {!avatarFrame && !referenceIsCurrent && (
                        <details>
                          <summary>{uiText("themeDecorationField.ThemeDecorationField29")}</summary>
                          <button
                            type="button"
                            onClick={() => {
                              update({ localReference: !item.localReference });
                              setMessage(
                                !item.localReference
                                  ? uiText("themeDecorationField.onClick7")
                                  : "",
                              );
                            }}
                          >
                            {item.localReference
                              ? uiText("themeDecorationField.ThemeDecorationField30")
                              : uiText("themeDecorationField.ThemeDecorationField31")}
                          </button>
                        </details>
                      )}
                      <button
                        type="button"
                        onMouseEnter={showReference}
                        onMouseLeave={clearHighlight}
                        onFocus={showReference}
                        onBlur={clearHighlight}
                      >
                        {uiText("themeDecorationField.ThemeDecorationField32")}</button>
                      <section>
                        <h4>{uiText("themeDecorationField.ThemeDecorationField33")}</h4>
                        <div className="theme-image-grid">
                          {Array.from({ length: 9 }, (_, i) => (
                            <button
                              type="button"
                              key={i}
                              aria-pressed={
                                item.alignment[0] === (i % 3) * 50 &&
                                item.alignment[1] === Math.floor(i / 3) * 50
                              }
                              className={
                                item.alignment[0] === (i % 3) * 50 &&
                                item.alignment[1] === Math.floor(i / 3) * 50
                                  ? "is-selected"
                                  : undefined
                              }
                              aria-label={uiText("themeDecorationField.aria_label6", { value: [uiText("themeDecorationField.aria_label.value"), uiText("themeDecorationField.aria_label.value2"), uiText("themeDecorationField.aria_label.value3"), uiText("themeDecorationField.aria_label.value4"), uiText("themeDecorationField.aria_label.value5"), uiText("themeDecorationField.aria_label.value6"), uiText("themeDecorationField.aria_label.value7"), uiText("themeDecorationField.aria_label.value8"), uiText("themeDecorationField.aria_label.value9")][i] })}
                              onClick={() =>
                                update({
                                  alignment: [
                                    (i % 3) * 50,
                                    Math.floor(i / 3) * 50,
                                  ],
                                  compensation: [0, 0],
                                  anchor: [
                                    { value: (i % 3) * 50, unit: "%" },
                                    {
                                      value: Math.floor(i / 3) * 50,
                                      unit: "%",
                                    },
                                  ],
                                })
                              }
                            >
                              <span className="theme-image-position-symbol">
                                <span
                                  style={{
                                    left: `${(i % 3) * 50}%`,
                                    top: `${Math.floor(i / 3) * 50}%`,
                                  }}
                                />
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                  {avatarFrame && (
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          alignment: [50, 50],
                          anchor: [
                            { value: 50, unit: "%" },
                            { value: 50, unit: "%" },
                          ],
                          move: [
                            { value: 0, unit: "px" },
                            { value: 0, unit: "px" },
                          ],
                          compensation: [0, 0],
                        })
                      }
                    >
                      <RotateCcw size={18} />
                      {uiText("themeDecorationField.ThemeDecorationField34")}</button>
                  )}
                  <section className="theme-image-size">
                    <div className="theme-image-dimensions">
                      {(["width", "height"] as const).map((key, index) => (
                        <Fragment key={key}>
                          {index === 1 && (
                            <button
                              type="button"
                              aria-label={locked ? uiText("themeDecorationField.aria_label7") : uiText("themeDecorationField.aria_label8")}
                              title={locked ? uiText("themeDecorationField.title4") : uiText("themeDecorationField.title5")}
                              onClick={() => setLocked(!locked)}
                            >
                              {locked ? (
                                <Link size={18} />
                              ) : (
                                <Link2Off size={18} />
                              )}
                            </button>
                          )}
                          <label>
                            {index ? uiText("themeDecorationField.ThemeDecorationField35") : uiText("themeDecorationField.ThemeDecorationField36")}
                            <ThemeNumberInput
                              label={uiText("themeDecorationField.label2", { value: index ? uiText("themeDecorationField.label.value") : uiText("themeDecorationField.label.value2") })}
                              value={Number(item[key])}
                              onChange={(next) =>
                                update(
                                  locked
                                    ? key === "width"
                                      ? {
                                          width: Math.max(1, next),
                                          height:
                                            (Math.max(1, next) * item.height) /
                                            item.width,
                                        }
                                      : {
                                          height: Math.max(1, next),
                                          width:
                                            (Math.max(1, next) * item.width) /
                                            item.height,
                                        }
                                    : { [key]: Math.max(1, next) },
                                )
                              }
                              onPreviewChange={(next) =>
                                update(
                                  locked
                                    ? key === "width"
                                      ? {
                                          width: Math.max(1, next),
                                          height:
                                            (Math.max(1, next) * item.height) /
                                            item.width,
                                        }
                                      : {
                                          height: Math.max(1, next),
                                          width:
                                            (Math.max(1, next) * item.width) /
                                            item.height,
                                        }
                                    : { [key]: Math.max(1, next) },
                                )
                              }
                              min={1}
                            />
                            px
                          </label>
                        </Fragment>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const asset = assets?.images.find(
                          (a) => a.path === item.source,
                        );
                        if (!asset) return;
                        const image = new Image();
                        image.onload = () => {
                          update({
                            height:
                              (item.width * image.naturalHeight) /
                              image.naturalWidth,
                          });
                          setLocked(true);
                        };
                        image.src = asset.url;
                      }}
                    >
                      <RotateCcw size={18} />
                      {uiText("themeDecorationField.ThemeDecorationField37")}</button>
                  </section>
                  {(["move", "anchor"] as const).map((group) => (
                    <section key={group} className="theme-image-coordinate">
                      <h4>{group === "move" ? uiText("themeDecorationField.ThemeDecorationField38") : uiText("themeDecorationField.ThemeDecorationField39")}</h4>
                      {[0, 1].map((axis) => (
                        <label key={axis}>
                          {axis ? uiText("themeDecorationField.ThemeDecorationField40") : uiText("themeDecorationField.ThemeDecorationField41")}
                          <ThemeNumberInput
                            label={
                              group === "move"
                                ? uiText("themeDecorationField.label3", { value: axis ? uiText("themeDecorationField.label.value3") : uiText("themeDecorationField.label.value4") })
                                : uiText("themeDecorationField.label4", { value: axis ? uiText("themeDecorationField.label.value5") : uiText("themeDecorationField.label.value6") })
                            }
                            value={Number(item[group][axis].value)}
                            onChange={(inputValue) =>
                              changeCoordinate(group, axis, inputValue)
                            }
                            onPreviewChange={(inputValue) =>
                              changeCoordinate(group, axis, inputValue)
                            }
                          />
                          <UiSelect
                            ariaLabel={
                              group === "move"
                                ? uiText("themeDecorationField.ariaLabel", { value: axis ? uiText("themeDecorationField.ariaLabel.value") : uiText("themeDecorationField.ariaLabel.value2") })
                                : uiText("themeDecorationField.ariaLabel2", { value: axis ? uiText("themeDecorationField.ariaLabel.value3") : uiText("themeDecorationField.ariaLabel.value4") })
                            }
                            value={item[group][axis].unit}
                            onValueChange={(selectedValue) => {
                              changeCoordinate(
                                group,
                                axis,
                                item[group][axis].value,
                                selectedValue as "px" | "%",
                              );
                            }}
                            options={["px", "%"].map((value) => ({
                              value,
                              label: value,
                            }))}
                          />
                        </label>
                      ))}
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
          {avatarFrame && avatarMode !== "custom" && (
            <p className="theme-image-hint">
              {avatarMode === "inherit"
                ? uiText("themeDecorationField.ThemeDecorationField42")
                : uiText("themeDecorationField.ThemeDecorationField43")}
            </p>
          )}
        </ThemeImageDialog>
      )}
    </div>
  );
}
