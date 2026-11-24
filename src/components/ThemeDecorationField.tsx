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
      setMessage("当前样例没有此部件。");
      return;
    }
    if (replace && item?.source) {
      update({ source: asset.path });
      setMessage("");
      return;
    }
    const contexts = nodes.map(inspectImageTarget);
    if (contexts.some((c) => !c.box || c.replaced)) {
      setMessage("此部件不能承载独立装饰，请选择外层区域。");
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
          ? "此部件最多放两张随文图片；将一张改为自由定位后可继续添加。"
          : "此部件的装饰位置已被样式占用，请选择其他部件。",
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
    image.onerror = () => setMessage("图片未能载入，请重新选择。");
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
                    ? "事件列表"
                    : node.matches(".event")
                      ? "事件"
                      : node.matches(".event-area")
                        ? "事件区域"
                        : "上层区域",
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
          setReference(
            ref
              ? ref === nodes[0]
                ? "当前部件"
                : ref.matches(
                      ".event,yt-live-chat-text-message-renderer,yt-live-chat-paid-message-renderer,yt-live-chat-membership-item-renderer",
                    )
                  ? "当前事件"
                  : ref.matches(".event-list,#items")
                    ? "事件列表"
                    : "上层区域"
              : "页面",
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
        {avatarFrame ? "头像框" : "装饰图"}
      </button>
      {open && (
        <ThemeImageDialog
          title={avatarFrame ? "头像框" : "装饰图"}
          onClose={() => setOpen(false)}
          actions={
            <>
              <button type="button" onClick={() => setOpen(false)}>
                取消
              </button>
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
                完成设置
              </button>
            </>
          }
        >
          {avatarFrame && (
            <div
              className="theme-image-modes"
              role="group"
              aria-label="头像框显示方式"
            >
              {(
                [
                  ["inherit", "沿用主题"],
                  ["custom", "自定义"],
                  ["hidden", "不显示"],
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
                  恢复继承
                </button>
              )}
              <ThemeImagePicker
                label="装饰图片"
                single={avatarFrame}
                onChoose={(asset) => add(asset, avatarFrame)}
                onReplace={
                  item?.source ? (asset) => add(asset, true) : undefined
                }
              />
              {message && <p role="status">{message}</p>}
              {clippingLabel && (
                <details className="theme-image-hint">
                  <summary>裁切范围：{clippingLabel.split("、")[0]}</summary>
                  <p>超出{clippingLabel.split("、")[0]}的部分会被裁切。</p>
                  {clippingLabel.includes("、") && (
                    <details>
                      <summary>其他裁切范围</summary>
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
                    查看裁切区域
                  </button>
                </details>
              )}
              {existing.map((entry) => (
                <div key={entry.slot} className="theme-image-hint">
                  现有装饰位置{entry.slot === "before" ? "一" : "二"}：
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
                      编辑现有图片
                    </button>
                  ) : (
                    <span>由 CSS 控制</span>
                  )}
                </div>
              ))}
              {!avatarFrame && (
                <>
                  <p className="theme-image-hint">
                    同组图片越靠上越靠前；与文字的遮挡关系单独设置。
                  </p>
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
                        <span className="theme-image-grip" title="拖动排序">
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
                              ? "内嵌图片"
                              : entry.source.split("/").pop()?.slice(0, 80) ||
                                "图片")}
                        </button>
                        <button
                          type="button"
                          aria-label="上移装饰"
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
                          aria-label="下移装饰"
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
                          aria-label="显示或隐藏装饰"
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
                          aria-label="移除图片"
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
                      排列
                      <UiSelect
                        ariaLabel="装饰排列"
                        value={item.flow ? "flow" : "absolute"}
                        onValueChange={(selectedValue) =>
                          selectedValue === "flow" &&
                          draft.some(
                            (entry) =>
                              entry.id !== item.id && entry.slot === item.slot,
                          )
                            ? setMessage(
                                "同层多张图片共用自由定位。请先选择空闲装饰位置。",
                              )
                            : update({ flow: selectedValue === "flow" })
                        }
                        options={[
                          { value: "flow", label: "随文排列" },
                          { value: "absolute", label: "自由定位" },
                        ]}
                      />
                    </label>
                  )}
                  {!avatarFrame && (
                    <p className="theme-image-hint">
                      {item.flow
                        ? "图片参与排版，随文字换行。"
                        : "图片独立定位，不占文字空间。"}
                    </p>
                  )}
                  {!item.flow && !avatarFrame && (
                    <label>
                      遮挡关系
                      <UiSelect
                        ariaLabel="遮挡关系"
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
                          { value: "front", label: "内容上方" },
                          { value: "back", label: "内容下方" },
                        ]}
                      />
                    </label>
                  )}
                  <details
                    className="theme-image-slot"
                    open={item.flow}
                    hidden={avatarFrame}
                  >
                    <summary>{item.flow ? "部件前后" : "高级图层设置"}</summary>{" "}
                    <label>
                      {item.flow ? "部件前后" : "高级图层设置"}
                      <UiSelect
                        ariaLabel="装饰位置"
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
                            setMessage("这个装饰位置已占用。");
                            return;
                          }
                          update({ slot });
                        }}
                        options={[
                          {
                            value: "before",
                            label: item.flow ? "部件前" : "位置一",
                          },
                          {
                            value: "after",
                            label: item.flow ? "部件后" : "位置二",
                          },
                        ]}
                      />
                    </label>
                  </details>
                  {!item.flow && (
                    <>
                      <p className="theme-image-hint">
                        定位参照：
                        {avatarFrame
                          ? "头像"
                          : item.localReference
                            ? "当前部件"
                            : reference}
                        。移动百分比相对此区域。
                      </p>
                      {!avatarFrame && reference !== "当前部件" && (
                        <details>
                          <summary>更换定位参照</summary>
                          <button
                            type="button"
                            onClick={() => {
                              update({ localReference: !item.localReference });
                              setMessage(
                                !item.localReference
                                  ? "应用后，当前部件内的绝对定位内容也会跟随此部件。"
                                  : "",
                              );
                            }}
                          >
                            {item.localReference
                              ? "沿用现有参照"
                              : "改为跟随当前部件"}
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
                        查看定位区域
                      </button>
                      <section>
                        <h4>图片位置</h4>
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
                              aria-label={`装饰${["左上", "上中", "右上", "左中", "居中", "右中", "左下", "下中", "右下"][i]}`}
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
                      恢复居中
                    </button>
                  )}
                  <section className="theme-image-size">
                    <div className="theme-image-dimensions">
                      {(["width", "height"] as const).map((key, index) => (
                        <Fragment key={key}>
                          {index === 1 && (
                            <button
                              type="button"
                              aria-label={locked ? "解除比例" : "锁定比例"}
                              title={locked ? "解除比例" : "锁定比例"}
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
                            {index ? "高" : "宽"}
                            <ThemeNumberInput
                              label={`装饰${index ? "高度" : "宽度"}`}
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
                      恢复原图比例
                    </button>
                  </section>
                  {(["move", "anchor"] as const).map((group) => (
                    <section key={group} className="theme-image-coordinate">
                      <h4>{group === "move" ? "移动" : "图片锚点"}</h4>
                      {[0, 1].map((axis) => (
                        <label key={axis}>
                          {axis ? "上下" : "左右"}
                          <ThemeNumberInput
                            label={
                              group === "move"
                                ? `装饰${axis ? "上下" : "左右"}移动`
                                : `图片锚点${axis ? "纵向" : "横向"}`
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
                                ? `装饰${axis ? "上下" : "左右"}移动单位`
                                : `图片锚点${axis ? "纵向" : "横向"}单位`
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
                ? "使用主题原有头像框。"
                : "不显示头像框。"}
            </p>
          )}
        </ThemeImageDialog>
      )}
    </div>
  );
}
