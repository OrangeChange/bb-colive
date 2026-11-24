import approved from '../../blivechat/approvedPreviewSamples.json' with { type: 'json' };

/** 动态预览与已审核的开放版静态样例共用资料。 */
export function createOpenLiveSimulation({ random = Math.random, now = Date.now } = {}) {
  const pool = approved['blivechat-open'].static;
  const pick = values => values[Math.min(values.length - 1, Math.floor(random() * values.length))];
  let sequence = 0;
  return {
    next({ types = { text: true, emoticon: true, gift: true, superChat: true, member: true }, gifts, prices, guards } = {}) {
      const candidates = pool.filter(record => {
        const payload = record.payload ?? record.data;
        if (record.method === 'onAddText') return types[payload.emoticon ? 'emoticon' : 'text'];
        if (record.method === 'onAddGift') return types.gift && (!gifts || gifts.length > 0);
        if (record.method === 'onAddSuperChat') return types.superChat && (!prices || prices.length > 0);
        return record.method === 'onAddMember' && types.member && (!guards || guards.includes(payload.privilegeType));
      });
      if (!candidates.length) return null;
      const source = pick(candidates);
      const payload = structuredClone(source.payload ?? source.data);
      const time = now();
      Object.assign(payload, { id: `openlive-preview-${++sequence}`, time, timestamp: time / 1000 });
      if (source.method === 'onAddGift' && gifts) Object.assign(payload, pick(gifts));
      if (source.method === 'onAddGift' && payload.coinType === 'silver') {
        payload.totalFreeCoin = payload.totalCoin;
        payload.totalCoin = 0;
        payload.price = 0;
      }
      if (source.method === 'onAddSuperChat' && prices) payload.price = pick(prices);
      return { method: source.method, payload, receivedAt: time };
    },
  };
}
