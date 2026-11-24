import { currentMonitor, primaryMonitor } from "@tauri-apps/api/window";
import type { MonitorWorkArea } from "./eventWindowLayout";

/** 读取物理工作区与缩放比例；创建窗口时由布局模块转换为逻辑像素。 */
export async function readCurrentMonitorWorkArea(): Promise<MonitorWorkArea | null> {
  try {
    const monitor = await currentMonitor() ?? await primaryMonitor();
    if (!monitor) return null;
    return {
      x: monitor.workArea.position.x,
      y: monitor.workArea.position.y,
      width: monitor.workArea.size.width,
      height: monitor.workArea.size.height,
      scaleFactor: monitor.scaleFactor,
    };
  } catch {
    return null;
  }
}
