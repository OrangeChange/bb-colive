/** 网页重新连接后，主题资源使用当前本地服务地址。 */
export function rebaseThemeResourceOrigin<T>(value: T, origin: string): T {
  function visit(input: unknown, key = ""): unknown {
    if (typeof input === "string") return /css$/i.test(key)
      ? input.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+(\/theme-(?:(?:catalog\/assets|assets|resources)\/|remote\?))/g, `${origin}$1`)
      : input;
    if (Array.isArray(input)) return input.map(item => visit(item));
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([name, item]) => [name, visit(item, name)]));
    return input;
  }
  return visit(value) as T;
}
