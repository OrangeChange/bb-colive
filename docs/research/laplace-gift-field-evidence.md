# LAPLACE 礼物字段依据

来源：本机安装的 `@laplace.live/internal` 包内 `src/namespaces/bilibili.d.ts`，原存于 danmu_tool/webview_verify/node_modules。本页保存金额调查实际使用的声明含义，不依赖读者安装旧验证环境。

## SEND_GIFT

- price：单价，金瓜子；盲盒为爆出礼物的虚拟价值。
- discount_price：通常与 price 一致。
- total_coin：包含折扣的用户实际消耗总金瓜子；盲盒按本体消费。
- coin_type：gold 为现金购买的金瓜子，silver 为兑换银瓜子。
- blind_gift.gift_tip_price：开出礼物单件价值，不是所有开出礼物总值。
- blind_gift.original_gift_price：盲盒本体单价。
- combo_total_coin：连击礼物价值，不能直接当作盲盒用户支付。
- batch_combo_id：连击事务关联，时间部分可能固定为首次连击，不能用它代替每条事件发送时间。

## 证据边界

这些说明覆盖 JSON SEND_GIFT，不证明 SEND_GIFT_V2 protobuf field 7 的语义。候选金额与可信支付的区分见[礼物金额调查](gift-price-fields-analysis.md)，产品显示与导出口径分别见[事件显示](../features/event-display.md#礼物与金额)、[数据导出](../features/data-export.md#列与金额)。

声明是第三方解释，需与真实原始样本对照；它不能保证所有折扣、批量或特殊礼物都按同一方式下发。
