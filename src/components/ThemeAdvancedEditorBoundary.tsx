import { Button } from "./shadcn/button";
import { uiText } from "../i18n/index.ts";
import { Component, type ReactNode } from "react";

export class ThemeAdvancedEditorBoundary extends Component<{
  children: ReactNode;
  onReturn: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="theme-editor-empty" role="alert">
      <p>{uiText("themeAdvancedEditorBoundary.render")}</p>
      <Button variant="outline" type="button" onClick={this.props.onReturn}>{uiText("themeAdvancedEditorBoundary.render2")}</Button>
    </div>;
  }
}
