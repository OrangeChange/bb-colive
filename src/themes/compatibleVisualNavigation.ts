import type {
  CompatiblePlacement,
  CompatibleVisualSelection,
  CompatibleThemeCapabilityMap,
} from "./compatThemeCapabilities.ts";
import type { CompatibleThemeMode } from "./compatThemeSettings.ts";

export interface CompatibleNavigationItem {
  id: string;
  label?: string;
  part?: string;
  placement: CompatiblePlacement;
  event?: string;
  global?: boolean;
  children?: readonly CompatibleNavigationItem[];
}
export interface CompatibleNavigationGroup {
  id: string;
  label: string;
  defaultExpanded: boolean;
  items: CompatibleNavigationItem[];
}

type PartInfo = {
  label?: string;
  placements?: readonly CompatiblePlacement[];
  events?: readonly string[];
};
type ItemSeed = Omit<CompatibleNavigationItem, "placement" | "children"> & {
  placement?: CompatiblePlacement;
  children?: readonly ItemSeed[];
};
type GroupSeed = Omit<CompatibleNavigationGroup, "items"> & {
  items: readonly ItemSeed[];
};
const item = (
  id: string,
  label: string,
  part?: string,
  children?: readonly ItemSeed[],
  extra: Partial<ItemSeed> = {},
): ItemSeed => ({ id, label, part, children, ...extra });

const commonGroups = (mode: CompatibleThemeMode): GroupSeed[] => {
  const eventChildren: ItemSeed[] =
    mode === "laplace"
      ? [
          item("all-events", "所有事件", "allEvents", undefined, {
            global: true,
          }),
          item(
            "main",
            "普通事件",
            "event",
            [
              item("content", "内容区域", "contentArea", [
                item("header", "头部", "header"),
                item("meta", "元信息区域", "meta", [
                  item("username-wrap", "用户名区域", "usernameWrap"),
                  item("timestamp-wrap", "时间区域", "timestampWrap"),
                ]),
              ]),
            ],
            { global: true },
          ),
          item(
            "sticky",
            "置顶事件",
            "event",
            [
              item(
                "sticky-content",
                "内容区域",
                "contentArea",
                [item("sticky-header", "头部", "header")],
                { placement: "sticky" },
              ),
              item("sticky-shared", "公共部件", undefined, [
                item("sticky-avatar-wrap", "头像区域", "avatarWrap", [
                  item("sticky-avatar-frame", "头像框", "avatarFrame"),
                  item("sticky-avatar-image-wrap", "头像图片区域", "avatarImageWrap", [item("sticky-avatar", "头像", "avatar")]),
                ]),
                item("sticky-action", "动作文字", "action"),
                item("sticky-event-icon", "事件图标", "eventIcon"),
                item("sticky-price", "价格", "amount", [item("sticky-currency", "货币符号", "priceCurrency"), item("sticky-figure", "金额数值", "priceFigure")]),
                item("sticky-gift-image-wrap", "礼物图片区域", "giftImageWrap", [item("sticky-gift-image", "礼物图片", "giftImage")], {event:"gift"}),
                item("sticky-guard-content", "大航海内容", "guardContent", undefined, {event:"guard"}),
              ]),
            ],
            { placement: "sticky", global: true },
          ),
        ]
      : [
          item(
            "main",
            "普通事件",
            "event",
            [
              ...(mode === "blivechat"
                ? [item("content", "内容区域", "contentArea")]
                : []),
              item("card-structure", "卡片结构", undefined, [
                item("card", "卡片", "card", [
                  ...(mode === "blivechat-open"
                    ? [
                        item("content", "内容区域", "contentArea", [
                          item(
                            "image-and-message",
                            "图文区域",
                            "imageAndMessage",
                          ),
                        ]),
                      ]
                    : []),
                  item("card-header", "头部", "cardHeader", [
                    item("header-content", "头部信息区", "cardHeaderContent", [
                      item("primary-column", "主信息列", "cardPrimaryColumn", [
                        item(
                          "membership-row",
                          "用户信息行",
                          "membershipInfoRow",
                        ),
                      ]),
                    ]),
                  ]),
                  
                ]),
              ]),
            ],
            { global: true },
          ),
          item(
            "sticky",
            "置顶事件",
            "event",
            [
              item(
                "ticker-item",
                "单项背景",
                "tickerItem",
                [
                  item(
                    "ticker-item-content",
                    "单项内容",
                    "tickerItemContent",
                    undefined,
                    { placement: "sticky" },
                  ),
                ],
                { placement: "sticky", global: true },
              ),
              item("ticker-summary", "摘要文字", "amount", undefined, {
                placement: "sticky",
              }),
              item(
                "ticker-user",
                "用户信息",
                undefined,
                [
                  item(
                    "ticker-avatar-wrap",
                    "头像区域",
                    "avatarWrap",
                    [
                      item("ticker-avatar", "头像", "avatar", undefined, {
                        placement: "sticky",
                      }),
                    ],
                    { placement: "sticky" },
                  ),
                ],
                { placement: "sticky" },
              ),
            ],
            { placement: "sticky", global: true },
          ),
        ];
  return [
    {
      id: "display",
      label: "显示区域",
      defaultExpanded: true,
      items: [
        item("event-area", "事件区", "eventArea", undefined, { global: true }),
        item("events", "事件", undefined, eventChildren),
        item("event-list", "事件列表", "eventList", undefined, {
          global: true,
        }),
        item(
          "ticker",
          "置顶栏",
          "ticker",
          [
            item("ticker-list", "横向项目列表", "tickerList", undefined, {
              placement: "sticky",
              global: true,
            }),
            ...(mode !== "laplace"
              ? [
                  item(
                    "details",
                    "展开详情",
                    undefined,
                    ["gift", "superchat", "guard"].map((event) =>
                      item(
                        `detail-${event}`,
                        event === "gift"
                          ? "礼物"
                          : event === "superchat"
                            ? "醒目留言"
                            : "大航海",
                        undefined,
                        [
                          item(`detail-card-${event}`, "卡片结构", undefined, [
                            item(`detail-card-root-${event}`, "卡片", "card", [
                              item(
                                `detail-header-${event}`,
                                "头部",
                                "cardHeader",
                                [
                                  item(
                                    `detail-header-content-${event}`,
                                    "头部信息区",
                                    "cardHeaderContent",
                                    [
                                      item(
                                        `detail-column-${event}`,
                                        "主信息列",
                                        "cardPrimaryColumn",
                                        event === "guard"
                                          ? [
                                              item(
                                                `detail-row-${event}`,
                                                "用户信息行",
                                                "membershipInfoRow",
                                              ),
                                            ]
                                          : undefined,
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              ...(event !== "guard"
                                ? [
                                    item(
                                      `detail-body-${event}`,
                                      "正文区域",
                                      "contentArea",
                                    ),
                                  ]
                                : []),
                            ]),
                          ]),
                          item(`detail-user-${event}`, "用户信息", undefined, [
                            item(
                              `detail-avatar-wrap-${event}`,
                              "头像区域",
                              "avatarWrap",
                              [
                                item(
                                  `detail-avatar-${event}`,
                                  "头像",
                                  "avatar",
                                ),
                              ],
                            ),
                            item(
                              `detail-username-${event}`,
                              "用户名",
                              "username",
                            ),
                            ...(event === "guard"
                              ? [
                                  item(
                                    `detail-userinfo-${event}`,
                                    "用户信息块",
                                    "userInfo",
                                  ),
                                  item(
                                    `detail-badges-${event}`,
                                    "身份徽章",
                                    "identity",
                                    [
                                      item(
                                        `detail-guard-${event}`,
                                        "大航海徽章",
                                        "guardBadge",
                                      ),
                                    ],
                                  ),
                                ]
                              : []),
                          ]),
                          item(
                            `detail-content-${event}`,
                            "事件内容",
                            undefined,
                            [
                              item(`detail-time-${event}`, "时间", "timestamp"),
                              ...(event === "guard"
                                ? [
                                    item(
                                      `detail-subtext-${event}`,
                                      "大航海说明",
                                      "membershipSubtext",
                                    ),
                                  ]
                                : [
                                    item(
                                      `detail-message-${event}`,
                                      "正文",
                                      "message",
                                    ),
                                    item(
                                      `detail-amount-${event}`,
                                      "价格",
                                      "amount",
                                    ),
                                  ]),
                            ],
                          ),
                        ],
                        { event, placement: "detail" },
                      ),
                    ),
                    { placement: "detail" },
                  ),
                ]
              : []),
          ],
          { placement: "sticky", global: true },
        ),
      ],
    },
    {
      id: "user",
      label: "用户信息",
      defaultExpanded: true,
      items:
        mode === "laplace"
          ? [
              item("avatar-wrap", "头像区域", "avatarWrap", [
                item("avatar-frame", "头像框", "avatarFrame"),
                item("avatar-image-wrap", "头像图片区域", "avatarImageWrap", [
                  item("avatar", "头像", "avatar"),
                ]),
              ]),
              item("username", "用户名", "username"),
              item("fan-medal", "粉丝牌", "fanMedal", [
                item("fan-medal-content", "名称内容区", "fanMedalContent", [
                  item("fan-medal-guard", "牌内大航海徽章", "fanMedalGuard"),
                ]),
                item("fan-medal-level", "等级", "fanMedalLevel"),
              ]),
              item("identity-badges", "身份徽章", undefined, [
              item("guard-badge", "大航海徽章", "guardBadge"),
              item("streamer-badge-wrap", "主播徽章区域", "streamerBadge", [
                item("streamer-badge", "主播徽章", "streamerBadgeIcon"),
              ]),
              item("mod-badge-wrap", "房管徽章区域", "modBadge", [
                item("mod-badge", "房管徽章", "modBadgeIcon"),
              ]),
              ]),
              item("wealth-medal", "荣耀勋章", "wealthMedal", [
                item("wealth-text", "等级文字", "wealthText"),
                item("wealth-image", "图像", "wealthImage"),
              ]),
              item("current-rank", "当前排行", "currentRank"),
            ]
          : [
              item("avatar-wrap", "头像区域", "avatarWrap", [
                item("avatar-frame", "头像框", "avatarFrame"),
                item("avatar", "头像", "avatar"),
              ]),
              item("username", "用户名", "username"),
              item("user-info", "用户信息块", "userInfo"),
              item("fan-medal-wrap", "粉丝牌区域", "fanMedalWrap", [
                item("fan-medal", "粉丝牌", "fanMedal", [
                  item("fan-medal-name", "名称", "fanMedalName"),
                  item("fan-medal-level", "等级", "fanMedalLevel"),
                ]),
              ]),
              item("identity", "身份徽章", "identity", [
                item("mod-badge", "房管徽章", "modBadge"),
                item("guard-badge", "大航海徽章", "guardBadge"),
              ]),
              item("badge", "其他徽章", "badge"),
            ],
    },
    {
      id: "content",
      label: "事件内容",
      defaultExpanded: true,
      items: [
        item("message", "正文", "message"),
        item("action", "动作文字", "action"),
        item("timestamp", "时间", "timestamp"),
        item("event-icon", "事件图标", "eventIcon"),
        item(
          "amount",
          "价格",
          "amount",
          mode === "laplace"
            ? [
                item("price-currency", "货币符号", "priceCurrency"),
                item("price-figure", "金额数值", "priceFigure"),
              ]
            : undefined,
        ),
        item("translation", "平台译文", "translation"),
      ],
    },
    {
      id: "emote",
      label: "表情",
      defaultExpanded: true,
      items:
        mode === "laplace"
          ? [
              item("small-emote-wrap", "行内表情区域", "smallEmoteWrap", [
                item("small-emote", "行内表情", "smallEmote"),
              ]),
              item("large-emote-wrap", "大表情区域", "largeEmoteWrap", [
                item("large-emote", "大表情", "largeEmote"),
              ]),
            ]
          : [
              item("small-emote", "行内表情", "smallEmote"),
              item("large-emote", "大表情", "largeEmote"),
            ],
    },
  ];
};

const eventGroups = (mode: CompatibleThemeMode): GroupSeed[] =>
  mode === "laplace"
    ? [
        {
          id: "danmaku",
          label: "弹幕",
          defaultExpanded: false,
          items: [
            item("reply", "回复信息", "reply", [
              item("reply-avatar", "回复头像", "replyAvatar"),
              item("reply-username", "回复用户名", "replyUsername"),
            ]),
            item("spoiler", "剧透片段", "spoiler"),
          ],
        },
        {
          id: "gift",
          label: "礼物",
          defaultExpanded: false,
          items: [
            item("gift-image-wrap", "礼物图片区域", "giftImageWrap", [
              item("gift-image", "礼物图片", "giftImage"),
            ]),
            item("gift-name", "礼物名称", "giftName"),
            item("gift-details", "礼物详情", "giftDetails", [
              item("gift-symbol", "乘号", "giftSymbol"),
              item("gift-count", "数量", "giftCount"),
              item("gift-detail-price", "描述内金额", "giftDetailPrice"),
            ]),
            item("gift-blind", "盲盒信息", "giftBlind", [
              item("gift-blind-name", "盲盒名称", "giftBlindName"),
              item("gift-blind-action", "动作文字", "giftBlindAction"),
            ]),
            item("gift-blind-amount", "盲盒金额", undefined, [
              item("gift-paid-price", "支付金额", "giftPaidPrice"),
              item("gift-result-price", "开出价值", "giftResultPrice"),
              item("gift-trend", "涨跌图标", "giftTrend"),
            ]),
            item("gift-receiver", "收礼对象", "giftReceiver", [
              item("gift-receiver-action", "动作文字", "giftReceiverAction"),
              item("gift-receiver-avatar", "收礼者头像", "giftReceiverAvatar"),
              item(
                "gift-receiver-username",
                "收礼者用户名",
                "giftReceiverUsername",
              ),
            ]),
          ],
        },
        {
          id: "superchat",
          label: "醒目留言",
          defaultExpanded: false,
          items: [
            item("sc-body", "正文容器", "body", undefined, { event: "superchat" }),
            item("sc-message", "正文", "message", undefined, {
              event: "superchat",
            }),
            item(
              "sc-amount",
              "价格",
              "amount",
              [
                item("sc-currency", "货币符号", "priceCurrency"),
                item("sc-figure", "金额数值", "priceFigure"),
              ],
              { event: "superchat" },
            ),
            item("sc-spoiler", "剧透片段", "spoiler", undefined, {
              event: "superchat",
            }),
            item("sc-deleted", "删除状态", "deleted", undefined, {
              event: "superchat",
            }),
            item("sc-translation", "平台译文", "translation", undefined, {
              event: "superchat",
            }),
          ],
        },
        {
          id: "guard",
          label: "大航海",
          defaultExpanded: false,
          items: [
            item("guard-content", "大航海内容", "guardContent", [
              item("guard-action", "动作文字", "action"),
              item("guard-type", "大航海类型", "guardType"),
              item("guard-duration", "时长", undefined, [
                item("guard-symbol", "乘号", "guardSymbol"),
                item("guard-figure", "数量", "guardFigure"),
                item("guard-unit", "单位", "guardUnit"),
              ]),
              item("guard-days-group", "陪伴天数", undefined, [
                item("guard-days-before", "前缀", "guardDaysBefore"),
                item("guard-days", "天数", "guardDays"),
                item("guard-days-after", "后缀", "guardDaysAfter"),
              ]),
            ]),

          ],
        },
        {
          id: "activity",
          label: "红包与天选",
          defaultExpanded: false,
          items: [
            item(
              "red",
              "红包",
              undefined,
              [
                item("red-action", "动作文字", "action"),
                item("red-title", "活动标题", "redTitle"),
                item("red-rewards", "奖励列表", "rewardList", [
                  item("red-reward", "奖励项", "rewardItem", [
                    item("red-count", "数量", "rewardCount"),
                    item("red-picture", "图片区域", "rewardPicture", [
                      item("red-image", "图片", "rewardImage"),
                    ]),
                  ]),
                ]),
                item("red-icon", "红包图标", "eventIcon"),
                item("red-price", "价格", "amount"),
              ],
              { event: "redStart" },
            ),
            item(
              "lottery",
              "天选",
              undefined,
              [
                item("lottery-message", "标题与奖品", "lotteryMessage", [
                  item("lottery-prize", "奖品", "lotteryPrize"),
                ]),
                item(
                  "lottery-requirements",
                  "参与条件",
                  "lotteryRequirements",
                  [item("lottery-condition", "条件值", "lotteryGiftName")],
                ),
                item("lottery-gift", "参与礼物", undefined, [

                  item("lottery-gift-price", "价格", "lotteryGiftPrice"),
                ]),
                item("lottery-icon", "天选图标", "eventIcon"),
              ],
              { event: "lotteryStart" },
            ),
            item(
              "winners",
              "中奖",
              undefined,
              ["winners", "redResult", "lotteryResult"].map((event) =>
                item(
                  `winners-${event}`,
                  event === "winners"
                    ? "全部中奖"
                    : event === "redResult"
                      ? "红包中奖"
                      : "天选中奖",
                  undefined,
                  [
                    item(
                      `winner-content-${event}`,
                      "中奖内容",
                      "winnerContent",
                      [
                        item(
                          `winner-title-${event}`,
                          "名单标题（含人数）",
                          "winnerTitle",
                        ),
                        item(
                          `winner-toggle-${event}`,
                          "展开按钮",
                          "winnerToggle",
                        ),
                        item(`winner-mask-${event}`, "名单遮罩", "winnerMask", [
                          item(
                            `winner-list-${event}`,
                            "中奖列表",
                            "winnerList",
                            [
                              item(
                                `winner-item-${event}`,
                                "中奖项",
                                "winnerItem",
                                [
                                  item(
                                    `winner-avatar-${event}`,
                                    "中奖头像",
                                    "winnerAvatar",
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ]),
                      ],
                    ),
                  ],
                  { event },
                ),
              ),
            ),
          ],
        },
        {
          id: "system",
          label: "系统",
          defaultExpanded: false,
          items: [
            item("mute-operator", "禁言操作者", "muteOperator"),
            item("mute-duration", "禁言时长", "muteDuration"),
          ],
        },
      ]
    : [
        {
          id: "gift",
          label: "礼物",
          defaultExpanded: false,
          items: [
            item("gift-message", "礼物描述", "message", undefined, {
              event: "gift",
            }),
            item("gift-amount", "礼物金额", "amount", undefined, {
              event: "gift",
            }),
          ],
        },
        {
          id: "superchat",
          label: "醒目留言",
          defaultExpanded: false,
          items: [
            item("sc-body", "正文容器", "body", undefined, { event: "superchat" }),
            item("sc-message", "正文", "message", undefined, {
              event: "superchat",
            }),
            item("sc-amount", "价格", "amount", undefined, {
              event: "superchat",
            }),
          ],
        },
        {
          id: "guard",
          label: "大航海",
          defaultExpanded: false,
          items: [
            item(
              "guard-description",
              "大航海说明",
              "membershipSubtext",
              undefined,
              { event: "guard" },
            ),
          ],
        },
      ];

function materialize(
  seed: ItemSeed,
  parts: Record<string, PartInfo>,
  inheritedPlacement: CompatiblePlacement = "main",
  inheritedEvent?: string,
): CompatibleNavigationItem | null {
  const placement = seed.placement ?? inheritedPlacement;
  const event =
    seed.event ??
    inheritedEvent ??
    (seed.part && parts[seed.part]?.events?.length === 1
      ? parts[seed.part].events![0]
      : undefined);
  const children =
    seed.children
      ?.map((child) => materialize(child, parts, placement, event))
      .filter((child): child is CompatibleNavigationItem => Boolean(child)) ??
    [];
  const part = seed.part && parts[seed.part] ? seed.part : undefined;
  if (!part && children.length === 0) return null;
  if (
    part &&
    parts[part].placements &&
    !parts[part].placements!.includes(placement)
  )
    return children.length
      ? { id: seed.id, label: seed.label, placement, event, children }
      : null;
  return {
    ...seed,
    part,
    placement,
    event,
    children: children.length ? children : undefined,
  };
}

export function buildCompatibleVisualNavigation(
  mode: CompatibleThemeMode,
  parts: Record<string, PartInfo>,
  selectedEvents?: readonly string[],
): CompatibleNavigationGroup[] {
  const groups = [...commonGroups(mode), ...eventGroups(mode)];
  if (mode === "blivechat-open") {
    const normalize = (items: readonly ItemSeed[]): ItemSeed[] =>
      items.flatMap((seed) =>
        seed.id === "detail-message-gift"
          ? []
          : seed.id === "card-structure"
          ? normalize(seed.children ?? [])
          : [
              {
                ...seed,
                children: seed.children ? normalize(seed.children) : undefined,
              },
            ],
      );
    groups.forEach((group) => {
      group.items = normalize(group.items);
    });
  }
  const restrict = (items: CompatibleNavigationItem[]): CompatibleNavigationItem[] => items.flatMap(entry => {
    const children = entry.children ? restrict([...entry.children]) : undefined;
    const definition = entry.part ? parts[entry.part] : undefined;
    const supported = !selectedEvents || selectedEvents.includes("all") || entry.event || entry.global || !definition?.events || selectedEvents.some(event => definition.events!.includes(event));
    return supported ? [{ ...entry, children }] : children?.length ? [{ ...entry, part: undefined, children }] : [];
  });
  return groups
    .map((group) => ({
      ...group,
      items: restrict(group.items
        .map((seed) =>
          materialize(
            seed,
            parts,
            "main",
            ["gift", "guard", "danmaku", "system"].includes(group.id)
              ? group.id
              : undefined,
          ),
        )
        .filter((entry): entry is CompatibleNavigationItem => Boolean(entry))),
    }))
    .filter((group) => group.items.length > 0);
}

export function compatibleNavigationItemLabel(
  item: CompatibleNavigationItem,
): string {
  return item.label ?? item.id;
}

export function resolveCompatibleNavigationSelection(
  item: CompatibleNavigationItem,
  current: CompatibleVisualSelection,
  capability?: CompatibleThemeCapabilityMap,
): CompatibleVisualSelection | null {
  if (!item.part) return null;
  if (item.global && !["event", "allEvents"].includes(item.part))
    return {
      event: item.event ?? "all",
      identity: "all",
      placement: item.placement,
      part: item.part,
    };
  const next = {
    ...current,
    event: item.event ?? current.event,
    placement: item.placement,
    part: item.part,
  };
  return capability ? normalizeCompatibleNavigationSelection(capability, next) : next;
}

export function compatibleNavigationEntries(groups: readonly CompatibleNavigationGroup[]) {
  const collect = (items: readonly CompatibleNavigationItem[], path: string[]): { item: CompatibleNavigationItem; path: string[] }[] =>
    items.flatMap(item => [{ item, path: [...path, item.label ?? item.id] }, ...collect(item.children ?? [], [...path, item.label ?? item.id])]);
  return groups.flatMap(group => collect(group.items, [group.label]));
}

function compatibleEventMatches(capability: CompatibleThemeCapabilityMap, event: string, expected: string) {
  const selected = capability.eventGroups?.[event] ?? [event];
  const supported = capability.eventGroups?.[expected] ?? [expected];
  return event === expected || selected.some(member => supported.includes(member));
}

export function findCompatibleNavigation(capability: CompatibleThemeCapabilityMap, selection: CompatibleVisualSelection, navigationId?: string | null) {
  const events = capability.eventGroups?.[selection.event] ?? [selection.event];
  const entries = compatibleNavigationEntries(buildCompatibleVisualNavigation(capability.mode, capability.parts, events));
  const candidates = entries.filter(({ item }) => item.part === selection.part && item.placement === (selection.placement ?? "main")
    && (!item.event || compatibleEventMatches(capability, selection.event, item.event)));
  const specific = candidates.filter(({ item }) => item.event && compatibleEventMatches(capability, selection.event, item.event));
  const preferred = specific.length ? specific : candidates;
  return preferred.find(({ item }) => item.id === navigationId) ?? preferred[0];
}

export function normalizeCompatibleNavigationSelection(capability: CompatibleThemeCapabilityMap, current: CompatibleVisualSelection): CompatibleVisualSelection {
  let placement = current.placement ?? "main";
  if (placement !== "main" && !capability.eventSelectorsByPlacement?.[placement]) placement = "main";
  const selectors = capability.eventSelectorsByPlacement?.[placement] ?? capability.eventSelectors ?? {};
  const event = current.event === "all" || selectors[current.event] ? current.event : "all";
  const identity = current.identity === "all" || capability.identitySelectors?.[current.identity] !== undefined ? current.identity : "all";
  const aliases: Record<string, string> = capability.mode === "laplace" ? {} : {
    paidCard: "card", membership: "card", paidContent: "contentArea",
  };
  let next = { ...current, part: aliases[current.part] ?? current.part, event, identity, placement };
  const definition = capability.parts[next.part];
  if (definition?.scope === "global") next = { ...next, event: "all", identity: "all" };
  const supported = !definition?.events || next.event === "all" || definition.events.some(expected => compatibleEventMatches(capability, next.event, expected));
  if (!supported || !findCompatibleNavigation(capability, next)) {
    const { eventId: _eventId, ...scope } = next;
    next = { ...scope, part: "event" };
    if (!findCompatibleNavigation(capability, next)) next = { ...next, placement: "main" };
  }
  return Object.keys(next).every(key => next[key as keyof typeof next] === current[key as keyof CompatibleVisualSelection]) ? current : next;
}

export interface CompatibleNavigationSession {
  sessionKey: string;
  selection: CompatibleVisualSelection;
  navigationId: string | null;
}

export function reconcileCompatibleNavigationSession(capability: CompatibleThemeCapabilityMap, current: CompatibleNavigationSession, sessionKey: string): CompatibleNavigationSession {
  const changedSession = current.sessionKey !== sessionKey;
  const { eventId: _eventId, ...scope } = current.selection;
  const selection = normalizeCompatibleNavigationSelection(capability, changedSession ? scope : current.selection);
  const navigationId = findCompatibleNavigation(capability, selection, changedSession ? null : current.navigationId)?.item.id ?? null;
  return !changedSession && selection === current.selection && navigationId === current.navigationId
    ? current : { sessionKey, selection, navigationId };
}
