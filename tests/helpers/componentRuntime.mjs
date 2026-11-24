import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

// 用于组件事件和状态回归的独立运行环境。
export function componentRuntime(path, ports = {}, extraExports = []) {
  const slots = [], effects = [];
  let index = 0;
  const hooks = {
    createContext: require("react").createContext,
    memo: require("react").memo,
    Fragment: require("react").Fragment,
    useContext: (context) => context._currentValue,
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], (next) => { slots[slot] = typeof next === "function" ? next(slots[slot]) : next; }];
    },
    useRef(current) {
      const slot = index++;
      return slots[slot] ??= { current };
    },
    useEffect(effect, deps) {
      const slot = index++;
      const previous = slots[slot];
      if (!previous || !deps || deps.some((value, n) => value !== previous.deps[n])) {
        effects.push(() => { previous?.cleanup?.(); slots[slot] = { deps, cleanup: effect() }; });
      }
    },
    useMemo: (fn) => fn(),
    useCallback(fn, deps) {
      const slot = index++;
      const previous = slots[slot];
      if (!previous || !deps || deps.some((value, n) => value !== previous.deps[n])) {
        slots[slot] = { deps, callback: fn };
      }
      return slots[slot].callback;
    },
    useId: () => "test",
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  };
  hooks.useLayoutEffect = hooks.useEffect;
  let source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  for (const name of extraExports) source = source.replace(`function ${name}(`, `export function ${name}(`);
  const code = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }, transformers: { before: [(context) => {
    const visit = (node) => ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword
      ? ts.factory.createIdentifier("testImportMeta")
      : ts.visitEachChild(node, visit, context);
    return (node) => ts.visitNode(node, visit);
  }] } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "testImportMeta", code)((id) => {
    if (id === "react") return hooks;
    if (id === "react/jsx-runtime") return require(id);
    if (id === "react-dom") return { createPortal: (children) => children };
    return ports[id] ?? {};
  }, module, module.exports, ports["import.meta"] ?? {});
  return {
    exports: module.exports,
    render(name, props) { index = 0; return module.exports[name](props); },
    effects() { effects.splice(0).forEach((effect) => effect()); },
    close() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

export function findElement(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  return [tree.props?.children].flat(Infinity).map((child) => findElement(child, predicate)).find(Boolean) ?? null;
}

export function keyEvent(key, overrides = {}) {
  return { key, nativeEvent: {}, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides };
}
