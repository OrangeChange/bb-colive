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
      <p>高级编辑加载失败。请返回保存当前修改，再重新打开程序。</p>
      <button type="button" onClick={this.props.onReturn}>返回基础设置</button>
    </div>;
  }
}
