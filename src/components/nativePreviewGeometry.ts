/** 预览只请求工作台改变宽度，不维护第二套面板尺寸。 */
export interface NativePreviewGeometry {
  readonly width: number;
  resizeBy(delta: number): void;
}
