import approved from './approvedPreviewSamples.json' with { type: 'json' };

const genericAvatar = "//static.hdslb.com/images/member/noface.gif";
const localGenericAvatar = "/media/noface.gif";

export function prepareBlivechatPreviewRecord(record) {
  if (record?.method === "onUpdateTranslation") return null;
  const key = record?.payload ? "payload" : record?.data ? "data" : null;
  if (!key) return record;
  const source = record[key];
  if (record.method === "onAddGift" && source.blindGiftName) return null;
  const avatarUrl = source.avatarUrl === genericAvatar ? localGenericAvatar : source.avatarUrl;
  if (!("translation" in source) && avatarUrl === source.avatarUrl) return record;
  const { translation: _translation, ...withoutTranslation } = source;
  const content = { ...withoutTranslation, ...(avatarUrl !== undefined ? { avatarUrl } : {}) };
  return { ...record, [key]: content };
}

export function prepareBlivechatPreviewRecords(records) {
  return records.map(prepareBlivechatPreviewRecord).filter(record => record !== null);
}

export function blivechatPreviewMethodForEvent(eventType) {
  if (eventType === "danmaku") return "onAddText";
  if (["gift", "gift-normal"].includes(eventType)) return "onAddGift";
  if (eventType === "superchat") return "onAddSuperChat";
  if (eventType === "guard") return "onAddMember";
  if (eventType === "like" || eventType === "interaction") return "onAddLike";
  return null;
}

export function filterBlivechatPreviewRecords(records, displayAll, eventType) {
  const prepared = prepareBlivechatPreviewRecords(records);
  if (displayAll || !eventType || eventType === "all") return prepared;
  const method = blivechatPreviewMethodForEvent(eventType);
  if (!method) return prepared;
  return prepared.filter(record => {
    if (record.method !== method) return false;
    const data = record.payload ?? record.data ?? {};
    return true;
  });
}

export function createBlivechatFixedPreviewRecords(mode, previewMode = "static") {
  return prepareBlivechatPreviewRecords(structuredClone(approved[mode][previewMode === "design" ? "design" : "static"]));
}

export function orderBlivechatDesignRecords(records) { return [...records]; }
