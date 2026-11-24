import type { ReactNode } from "react";
export function ThemeVisualScope({
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  return <div className="native-scope-panel">{children}</div>;
}
