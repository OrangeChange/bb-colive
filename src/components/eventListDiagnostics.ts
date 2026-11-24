/** 读取事件行宿主节点上的稳定消息类型元数据。 */
export function readEventMsgType(dataset: { eventMsgType?: string } | undefined): number | undefined {
  const rawMsgType = dataset?.eventMsgType;
  const parsedMsgType = rawMsgType === undefined ? undefined : Number(rawMsgType);
  return parsedMsgType !== undefined && Number.isFinite(parsedMsgType) ? parsedMsgType : undefined;
}
