import postcss from "postcss";
import type { ImagePosition } from "../components/themeImageValue.ts";
import {
  imagePositionCss,
  scaleImageLengthCss,
} from "../components/themeImageValue.ts";

export interface ThemeDecoration extends ImagePosition {
  avatarClipRadius?: string;
  avatarRatio?: { width: number; height: number };
  depth?: "front" | "back";
  localReference?: boolean;
  basis?: { variable: string; value: number };
  id: string;
  source: string;
  width: number;
  height: number;
  slot: "before" | "after";
  visible: boolean;
}
export type ThemeImageDecorations = Record<string, ThemeDecoration[]>;
export function clearThemeImageDecorations(
  model: ThemeImageDecorations | undefined,
  key: string,
): ThemeImageDecorations {
  const next = { ...model };
  delete next[key];
  return next;
}
export function imageEventParents(
  event: string,
  groups: Record<string, readonly string[]> = {},
): string[] {
  return Object.entries(groups)
    .filter(([name, members]) => name !== event && members.includes(event))
    .sort((a, b) => a[1].length - b[1].length)
    .map(([name]) => name);
}

export function resolveThemeImageDecorations(
  model: ThemeImageDecorations | undefined,
  key: string,
  parents: readonly string[] = [],
  skipCurrent = false,
): ThemeDecoration[] {
  const [scheme, event, identity, ...target] = key.split("|");
  const schemes = scheme === "common" ? [scheme] : [scheme, "common"];
  const events = [...new Set([event, ...parents, "all"])];
  for (const layer of schemes)
    for (const role of [...new Set([identity, "all"])])
      for (const scope of events) {
        const candidate = [layer, scope, role, ...target].join("|");
        if (skipCurrent && candidate === key) continue;
        if (model && Object.prototype.hasOwnProperty.call(model, candidate))
          return model[candidate];
      }
  return [];
}

function groupAxis(images: ThemeDecoration[], axis: number) {
  const values = images.map((image) => {
    const size = axis === 0 ? image.width : image.height;
    const anchor = image.anchor[axis];
    const move = image.move[axis];
    const percent =
      image.alignment[axis] + (move.unit === "%" ? move.value : 0);
    const pixels =
      (move.unit === "px" ? move.value : 0) +
      (image.compensation?.[axis] ?? 0) -
      (anchor.unit === "%" ? (size * anchor.value) / 100 : anchor.value);
    const length = (value: number) =>
      scaleImageLengthCss(`${Number(value.toFixed(6))}px`, image.basis);
    return {
      percent,
      pixels: length(pixels),
      end: length(pixels + size),
      size: length(size),
    };
  });
  const start = Math.min(0, ...values.map((value) => value.percent));
  const span = Math.max(100, ...values.map((value) => value.percent)) - start;
  const minimum = `min(0px, ${values.map((value) => value.pixels).join(", ")})`;
  const maximum = `max(0px, ${values.map((value) => value.end).join(", ")})`;
  return {
    start: `calc(${start}% + ${minimum})`,
    size: `calc(${span}% + ${maximum} - ${minimum})`,
    positions: values.map((value) => {
      const ratio = (value.percent - start) / span;
      return `calc(${Number((ratio * 100).toFixed(6))}% + ${value.pixels} - ${minimum} - (${maximum} - ${minimum} - ${value.size}) * ${Number(ratio.toFixed(6))})`;
    }),
  };
}

/** Each entry uses an existing theme selector; no render nodes are introduced. */
export function renderThemeImageDecorations(
  model: ThemeImageDecorations | undefined,
  selectorFor: (key: string) => string | null,
  parentsForEvent: (event: string) => readonly string[] = () => [],
  compareTargets?: (left: string, right: string) => number,
): string {
  return Object.entries(model ?? {})
    .sort(([left], [right]) => {
      const a = left.split("|"),
        b = right.split("|");
      const schemes = ["common", "light", "dark"];
      return (
        schemes.indexOf(a[0]) - schemes.indexOf(b[0]) ||
        (compareTargets
          ? compareTargets(a.slice(1).join("|"), b.slice(1).join("|"))
          : Number(a[2] !== "all") - Number(b[2] !== "all") ||
            (a[1] === "all" ? 0 : parentsForEvent(a[1]).length + 1) -
              (b[1] === "all" ? 0 : parentsForEvent(b[1]).length + 1))
      );
    })
    .flatMap(([key, images]) => {
      const selector = selectorFor(key);
      if (!selector) return [];
      const frame = key.endsWith("|avatarFrame");
      const inherited = resolveThemeImageDecorations(
        model,
        key,
        parentsForEvent(key.split("|")[1]),
        true,
      );
      const clearedSlots = [
        ...new Set(
          [...images, ...inherited]
            .filter((image) => image.source)
            .map((image) => image.slot),
        ),
      ].filter(
        (slot) => !images.some((image) => image.visible && image.slot === slot),
      );
      const hostDeclarations = [
        images.some((image) => image.visible && (image.localReference || frame))
          ? "position: relative;"
          : "",
        images.some((image) => image.visible && image.depth === "back")
          ? "isolation: isolate;"
          : "",
        frame &&
        images.some(
          (image) => image.visible && image.avatarClipRadius !== undefined,
        )
          ? "overflow: visible;"
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      const hostRule = hostDeclarations
        ? `${selector} { ${hostDeclarations} }`
        : "";
      const frameRule =
        frame && images.length
          ? `${postcss.list
              .comma(selector)
              .map((branch) => `${branch.trim()} .avatar-frame`)
              .join(",")} { display: none; }`
          : "";
      return [
        hostRule,
        frameRule,
        ...clearedSlots.map(
          (slot) =>
            `${postcss.list
              .comma(selector)
              .map((branch) => `${branch.trim()}::${slot}`)
              .join(
                ",",
              )} { content: none; display: none; background-image: none; }`,
        ),
        ...(frame
          ? images
              .filter(
                (image) =>
                  image.visible && image.avatarClipRadius !== undefined,
              )
              .slice(0, 1)
              .map(
                (image) =>
                  `${postcss.list
                    .comma(selector)
                    .map((branch) => `${branch.trim()} > img`)
                    .join(
                      ",",
                    )} { border-radius: ${scaleImageLengthCss(image.avatarClipRadius!, image.basis)}; }`,
              )
          : []),
        ...(["before", "after"] as const).flatMap((slot) => {
          const group = images.filter(
            (image) => image.visible && image.slot === slot,
          );
          if (!group.length) return [];
          const image = group[0];
          const positions = imagePositionCss(image);
          const length = (value: string) =>
            scaleImageLengthCss(value, image.basis);

          const rules = {
            content: '""',
            display: "inline-block",
            width: length(`${image.width}px`),
            height: length(`${image.height}px`),
            "background-image": `url(${JSON.stringify(image.source)})`,
            "background-size": "100% 100%",
            "background-repeat": "no-repeat",
            "pointer-events": "none",
            position: positions.position,
            left: length(positions.left),
            top: length(positions.top),
            "transform-box": "border-box",
            transform: length(positions.transform),
            "vertical-align": "middle",
            "z-index": String(
              image.depth === "back"
                ? -1
                : images.length - images.indexOf(image) + 1,
            ),
          };
          if (frame && image.avatarRatio)
            Object.assign(rules, {
              width: `${image.avatarRatio.width * 100}%`,
              height: `${image.avatarRatio.height * 100}%`,
            });
          if (group.length > 1) {
            const horizontal = groupAxis(group, 0),
              vertical = groupAxis(group, 1);
            const scaleLength = (entry: ThemeDecoration, text: string) =>
              scaleImageLengthCss(text, entry.basis);
            Object.assign(rules, {
              position: "absolute",
              left: horizontal.start,
              top: vertical.start,
              width: horizontal.size,
              height: vertical.size,
              transform: "none",
              "background-image": group
                .map((entry) => `url(${JSON.stringify(entry.source)})`)
                .join(", "),
              "background-size": group
                .map((entry) =>
                  scaleLength(entry, `${entry.width}px ${entry.height}px`),
                )
                .join(", "),
              "background-position": group
                .map(
                  (_, index) =>
                    `${horizontal.positions[index]} ${vertical.positions[index]}`,
                )
                .join(", "),
            });
          }
          return `${postcss.list
            .comma(selector)
            .map((branch) => `${branch.trim()}::${image.slot}`)
            .join(",\n")} {\n${Object.entries(rules)
            .map(([name, value]) => `  ${name}: ${value};`)
            .join("\n")}\n}`;
        }),
      ];
    })
    .join("\n\n");
}

export function stripThemeImageDecorations(css: string): string {
  return css.replace(
    /\/\* theme-image-decorations:start \*\/[\s\S]*?\/\* theme-image-decorations:end \*\//g,
    "",
  );
}
export function wrapThemeImageDecorations(css: string): string {
  return css
    ? `/* theme-image-decorations:start */\n${css}\n/* theme-image-decorations:end */`
    : "";
}
