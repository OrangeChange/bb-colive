import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
} from "react";
import type { LiveEmoticon } from "../protocol/danmakuSendingModel";
export interface DanmakuInputHandle {
  focus(): void;
  insert(emoticon: LiveEmoticon): void;
}
/** 图片保留平台触发词，复制和发送均使用相同文本。 */
export function danmakuInputText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof HTMLImageElement) return node.dataset.token ?? "";
  if (node instanceof HTMLBRElement) return "\n";
  const children = Array.from(node.childNodes);
  return children
    .map((child, i) =>
      child instanceof HTMLBRElement &&
      i === children.length - 1 &&
      (i === 0 || children[i - 1] instanceof HTMLBRElement)
        ? ""
        : (i > 0 &&
          child instanceof HTMLElement &&
          /^(DIV|P)$/.test(child.tagName)
            ? "\n"
            : "") + danmakuInputText(child),
    )
    .join("");
}
export const DanmakuRichInput = forwardRef<
  DanmakuInputHandle,
  {
    id: string;
    value: string;
    emoticons: Record<string, LiveEmoticon>;
    readOnly: boolean;
    invalid: boolean;
    label: string;
    statusId: string;
    onChange(text: string): void;
    onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  }
>(function DanmakuRichInput(
  {
    id,
    value,
    emoticons,
    readOnly,
    invalid,
    label,
    statusId,
    onChange,
    onKeyDown,
  },
  ref,
) {
  const root = useRef<HTMLDivElement>(null);
  const selection = useRef<Range | null>(null);
  const composing = useRef(false);
  const history = useRef([value]);
  const historyIndex = useRef(0);
  const restoring = useRef(false);
  const publish = (text: string) => {
    if (!composing.current && history.current[historyIndex.current] !== text) {
      history.current = history.current.slice(0, historyIndex.current + 1);
      history.current.push(text);
      if (history.current.length > 100) history.current.shift();
      historyIndex.current = history.current.length - 1;
    }
    onChange(text);
  };
  const image = (emote: LiveEmoticon) => {
    const img = document.createElement("img");
    img.src = emote.url;
    img.alt = emote.text;
    img.title = emote.text;
    img.dataset.token = emote.text;
    img.contentEditable = "false";
    img.draggable = false;
    img.className = "inline-block h-6 w-6 align-middle object-contain";
    return img;
  };
  const remember = () => {
    const current = window.getSelection();
    if (
      current?.rangeCount &&
      root.current?.contains(current.anchorNode) &&
      root.current.contains(current.focusNode)
    )
      selection.current = current.getRangeAt(0).cloneRange();
  };
  const makeFragment = (text: string) => {
    const fragment = document.createDocumentFragment();
    const keys = Object.keys(emoticons)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    let plain = "";
    for (let i = 0; i < text.length;) {
      const token = keys.find((k) => text.startsWith(k, i));
      if (token) {
        if (plain) {
          fragment.append(plain);
          plain = "";
        }
        fragment.append(image(emoticons[token]));
        i += token.length;
      } else {
        plain += text[i];
        i++;
      }
    }
    if (plain) fragment.append(plain);
    return fragment;
  };
  const insert = (node: Node) => {
    const el = root.current;
    if (!el || readOnly) return;
    el.focus();
    const range =
      selection.current &&
      el.contains(selection.current.commonAncestorContainer)
        ? selection.current
        : document.createRange();
    if (!selection.current || !el.contains(range.commonAncestorContainer)) {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    const caretNode = node instanceof DocumentFragment ? node.lastChild : node;
    if (!caretNode) return;
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(caretNode);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    remember();
    publish(danmakuInputText(el));
  };
  useImperativeHandle(ref, () => ({
    focus: () => root.current?.focus(),
    insert: (emote) => insert(image(emote)),
  }));
  useLayoutEffect(() => {
    const el = root.current;
    if (
      !el ||
      composing.current ||
      (danmakuInputText(el) === value && (value || !el.childNodes.length))
    )
      return;
    const fragment = makeFragment(value);
    el.replaceChildren(fragment);
    selection.current = null;
    if (restoring.current) {
      restoring.current = false;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      remember();
    } else if (history.current[historyIndex.current] !== value) {
      history.current = [value];
      historyIndex.current = 0;
    }
  }, [value, emoticons]);
  return (
    <div
      ref={root}
      id={id}
      role="textbox"
      aria-label={label}
      aria-multiline="true"
      aria-describedby={statusId}
      aria-invalid={invalid || undefined}
      aria-readonly={readOnly}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck={false}
      tabIndex={0}
      className="min-h-20 max-h-40 w-full overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-bg px-2.5 py-2 text-sm text-t1 outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring aria-invalid:border-destructive"
      onKeyDown={(event) => {
        if (
          !readOnly &&
          !event.nativeEvent.isComposing &&
          (event.ctrlKey || event.metaKey) &&
          ["z", "y"].includes(event.key.toLowerCase())
        ) {
          event.preventDefault();
          const redo = event.key.toLowerCase() === "y" || event.shiftKey;
          const next = historyIndex.current + (redo ? 1 : -1);
          if (next >= 0 && next < history.current.length) {
            historyIndex.current = next;
            restoring.current = true;
            onChange(history.current[next]);
          }
          return;
        }
        if (
          !readOnly &&
          !event.nativeEvent.isComposing &&
          (event.key === "Backspace" || event.key === "Delete")
        ) {
          const current = window.getSelection();
          if (current?.rangeCount && current.isCollapsed) {
            const r = current.getRangeAt(0),
              back = event.key === "Backspace";
            let adjacent: Node | null = null;
            if (r.startContainer.nodeType === Node.TEXT_NODE) {
              if (back && r.startOffset === 0)
                adjacent = r.startContainer.previousSibling;
              if (
                !back &&
                r.startOffset === (r.startContainer.textContent?.length ?? 0)
              )
                adjacent = r.startContainer.nextSibling;
            } else
              adjacent =
                r.startContainer.childNodes[r.startOffset - (back ? 1 : 0)] ??
                null;
            if (
              adjacent instanceof HTMLImageElement &&
              adjacent.dataset.token
            ) {
              event.preventDefault();
              r.setStartBefore(adjacent);
              r.collapse(true);
              adjacent.remove();
              remember();
              if (root.current) publish(danmakuInputText(root.current));
              return;
            }
          }
        }
        onKeyDown(event);
      }}
      onKeyUp={remember}
      onMouseUp={remember}
      onBlur={remember}
      onInput={() => {
        remember();
        if (root.current) publish(danmakuInputText(root.current));
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        if (root.current) publish(danmakuInputText(root.current));
      }}
      onPaste={(e) => {
        e.preventDefault();
        insert(makeFragment(e.clipboardData.getData("text/plain")));
      }}
      onDrop={(e) => e.preventDefault()}
      onCopy={(e) => {
        const s = window.getSelection();
        if (
          s?.rangeCount &&
          root.current?.contains(s.anchorNode) &&
          root.current.contains(s.focusNode)
        ) {
          e.preventDefault();
          e.clipboardData.setData(
            "text/plain",
            danmakuInputText(s.getRangeAt(0).cloneContents()),
          );
        }
      }}
    />
  );
});
