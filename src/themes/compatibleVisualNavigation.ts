import { uiText } from "../i18n/index.ts";
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
          item("all-events", uiText("compatibleVisualNavigation.commonGroups.eventChildren"), "allEvents", undefined, {
            global: true,
          }),
          item(
            "main",
            uiText("compatibleVisualNavigation.commonGroups.eventChildren2"),
            "event",
            [
              item("content", uiText("compatibleVisualNavigation.commonGroups.eventChildren3"), "contentArea", [
                item("header", uiText("compatibleVisualNavigation.commonGroups.eventChildren4"), "header"),
                item("meta", uiText("compatibleVisualNavigation.commonGroups.eventChildren5"), "meta", [
                  item("username-wrap", uiText("compatibleVisualNavigation.commonGroups.eventChildren6"), "usernameWrap"),
                  item("timestamp-wrap", uiText("compatibleVisualNavigation.commonGroups.eventChildren7"), "timestampWrap"),
                ]),
              ]),
            ],
            { global: true },
          ),
          item(
            "sticky",
            uiText("compatibleVisualNavigation.commonGroups.eventChildren8"),
            "event",
            [
              item(
                "sticky-content",
                uiText("compatibleVisualNavigation.commonGroups.eventChildren3"),
                "contentArea",
                [item("sticky-header", uiText("compatibleVisualNavigation.commonGroups.eventChildren4"), "header")],
                { placement: "sticky" },
              ),
              item("sticky-shared", uiText("compatibleVisualNavigation.commonGroups.eventChildren9"), undefined, [
                item("sticky-avatar-wrap", uiText("compatibleVisualNavigation.commonGroups.eventChildren10"), "avatarWrap", [
                  item("sticky-avatar-frame", uiText("compatibleVisualNavigation.commonGroups.eventChildren11"), "avatarFrame"),
                  item("sticky-avatar-image-wrap", uiText("compatibleVisualNavigation.commonGroups.eventChildren12"), "avatarImageWrap", [item("sticky-avatar", uiText("compatibleVisualNavigation.commonGroups.eventChildren13"), "avatar")]),
                ]),
                item("sticky-action", uiText("compatibleVisualNavigation.commonGroups.eventChildren14"), "action"),
                item("sticky-event-icon", uiText("compatibleVisualNavigation.commonGroups.eventChildren15"), "eventIcon"),
                item("sticky-price", uiText("compatibleVisualNavigation.commonGroups.eventChildren16"), "amount", [item("sticky-currency", uiText("compatibleVisualNavigation.commonGroups.eventChildren17"), "priceCurrency"), item("sticky-figure", uiText("compatibleVisualNavigation.commonGroups.eventChildren18"), "priceFigure")]),
                item("sticky-gift-image-wrap", uiText("compatibleVisualNavigation.commonGroups.eventChildren19"), "giftImageWrap", [item("sticky-gift-image", uiText("compatibleVisualNavigation.commonGroups.eventChildren20"), "giftImage")], {event:"gift"}),
                item("sticky-guard-content", uiText("compatibleVisualNavigation.commonGroups.eventChildren21"), "guardContent", undefined, {event:"guard"}),
              ]),
            ],
            { placement: "sticky", global: true },
          ),
        ]
      : [
          item(
            "main",
            uiText("compatibleVisualNavigation.commonGroups.eventChildren2"),
            "event",
            [
              ...(mode === "blivechat"
                ? [item("content", uiText("compatibleVisualNavigation.commonGroups.eventChildren3"), "contentArea")]
                : []),
              item("card-structure", uiText("compatibleVisualNavigation.commonGroups.eventChildren22"), undefined, [
                item("card", uiText("compatibleVisualNavigation.commonGroups.eventChildren23"), "card", [
                  ...(mode === "blivechat-open"
                    ? [
                        item("content", uiText("compatibleVisualNavigation.commonGroups.eventChildren3"), "contentArea", [
                          item(
                            "image-and-message",
                            uiText("compatibleVisualNavigation.commonGroups.eventChildren24"),
                            "imageAndMessage",
                          ),
                        ]),
                      ]
                    : []),
                  item("card-header", uiText("compatibleVisualNavigation.commonGroups.eventChildren4"), "cardHeader", [
                    item("header-content", uiText("compatibleVisualNavigation.commonGroups.eventChildren25"), "cardHeaderContent", [
                      item("primary-column", uiText("compatibleVisualNavigation.commonGroups.eventChildren26"), "cardPrimaryColumn", [
                        item(
                          "membership-row",
                          uiText("compatibleVisualNavigation.commonGroups.eventChildren27"),
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
            uiText("compatibleVisualNavigation.commonGroups.eventChildren8"),
            "event",
            [
              item(
                "ticker-item",
                uiText("compatibleVisualNavigation.commonGroups.eventChildren28"),
                "tickerItem",
                [
                  item(
                    "ticker-item-content",
                    uiText("compatibleVisualNavigation.commonGroups.eventChildren29"),
                    "tickerItemContent",
                    undefined,
                    { placement: "sticky" },
                  ),
                ],
                { placement: "sticky", global: true },
              ),
              item("ticker-summary", uiText("compatibleVisualNavigation.commonGroups.eventChildren30"), "amount", undefined, {
                placement: "sticky",
              }),
              item(
                "ticker-user",
                uiText("compatibleVisualNavigation.commonGroups.eventChildren31"),
                undefined,
                [
                  item(
                    "ticker-avatar-wrap",
                    uiText("compatibleVisualNavigation.commonGroups.eventChildren10"),
                    "avatarWrap",
                    [
                      item("ticker-avatar", uiText("compatibleVisualNavigation.commonGroups.eventChildren13"), "avatar", undefined, {
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
      label: uiText("compatibleVisualNavigation.commonGroups.label"),
      defaultExpanded: true,
      items: [
        item("event-area", uiText("compatibleVisualNavigation.commonGroups.items"), "eventArea", undefined, { global: true }),
        item("events", uiText("compatibleVisualNavigation.commonGroups.items2"), undefined, eventChildren),
        item("event-list", uiText("compatibleVisualNavigation.commonGroups.items3"), "eventList", undefined, {
          global: true,
        }),
        item(
          "ticker",
          uiText("compatibleVisualNavigation.commonGroups.items4"),
          "ticker",
          [
            item("ticker-list", uiText("compatibleVisualNavigation.commonGroups.items5"), "tickerList", undefined, {
              placement: "sticky",
              global: true,
            }),
            ...(mode !== "laplace"
              ? [
                  item(
                    "details",
                    uiText("compatibleVisualNavigation.commonGroups.items6"),
                    undefined,
                    ["gift", "superchat", "guard"].map((event) =>
                      item(
                        `detail-${event}`,
                        event === "gift"
                          ? uiText("compatibleVisualNavigation.commonGroups.items7")
                          : event === "superchat"
                            ? uiText("compatibleVisualNavigation.commonGroups.items8")
                            : uiText("compatibleVisualNavigation.commonGroups.items9"),
                        undefined,
                        [
                          item(`detail-card-${event}`, uiText("compatibleVisualNavigation.commonGroups.items10"), undefined, [
                            item(`detail-card-root-${event}`, uiText("compatibleVisualNavigation.commonGroups.items11"), "card", [
                              item(
                                `detail-header-${event}`,
                                uiText("compatibleVisualNavigation.commonGroups.items12"),
                                "cardHeader",
                                [
                                  item(
                                    `detail-header-content-${event}`,
                                    uiText("compatibleVisualNavigation.commonGroups.items13"),
                                    "cardHeaderContent",
                                    [
                                      item(
                                        `detail-column-${event}`,
                                        uiText("compatibleVisualNavigation.commonGroups.items14"),
                                        "cardPrimaryColumn",
                                        event === "guard"
                                          ? [
                                              item(
                                                `detail-row-${event}`,
                                                uiText("compatibleVisualNavigation.commonGroups.items15"),
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
                                      uiText("compatibleVisualNavigation.commonGroups.items16"),
                                      "contentArea",
                                    ),
                                  ]
                                : []),
                            ]),
                          ]),
                          item(`detail-user-${event}`, uiText("compatibleVisualNavigation.commonGroups.items17"), undefined, [
                            item(
                              `detail-avatar-wrap-${event}`,
                              uiText("compatibleVisualNavigation.commonGroups.items18"),
                              "avatarWrap",
                              [
                                item(
                                  `detail-avatar-${event}`,
                                  uiText("compatibleVisualNavigation.commonGroups.items19"),
                                  "avatar",
                                ),
                              ],
                            ),
                            item(
                              `detail-username-${event}`,
                              uiText("compatibleVisualNavigation.commonGroups.items20"),
                              "username",
                            ),
                            ...(event === "guard"
                              ? [
                                  item(
                                    `detail-userinfo-${event}`,
                                    uiText("compatibleVisualNavigation.commonGroups.items21"),
                                    "userInfo",
                                  ),
                                  item(
                                    `detail-badges-${event}`,
                                    uiText("compatibleVisualNavigation.commonGroups.items22"),
                                    "identity",
                                    [
                                      item(
                                        `detail-guard-${event}`,
                                        uiText("compatibleVisualNavigation.commonGroups.items23"),
                                        "guardBadge",
                                      ),
                                    ],
                                  ),
                                ]
                              : []),
                          ]),
                          item(
                            `detail-content-${event}`,
                            uiText("compatibleVisualNavigation.commonGroups.items24"),
                            undefined,
                            [
                              item(`detail-time-${event}`, uiText("compatibleVisualNavigation.commonGroups.items25"), "timestamp"),
                              ...(event === "guard"
                                ? [
                                    item(
                                      `detail-subtext-${event}`,
                                      uiText("compatibleVisualNavigation.commonGroups.items26"),
                                      "membershipSubtext",
                                    ),
                                  ]
                                : [
                                    item(
                                      `detail-message-${event}`,
                                      uiText("compatibleVisualNavigation.commonGroups.items27"),
                                      "message",
                                    ),
                                    item(
                                      `detail-amount-${event}`,
                                      uiText("compatibleVisualNavigation.commonGroups.items28"),
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
      label: uiText("compatibleVisualNavigation.commonGroups.label2"),
      defaultExpanded: true,
      items:
        mode === "laplace"
          ? [
              item("avatar-wrap", uiText("compatibleVisualNavigation.commonGroups.items18"), "avatarWrap", [
                item("avatar-frame", uiText("compatibleVisualNavigation.commonGroups.items29"), "avatarFrame"),
                item("avatar-image-wrap", uiText("compatibleVisualNavigation.commonGroups.items30"), "avatarImageWrap", [
                  item("avatar", uiText("compatibleVisualNavigation.commonGroups.items19"), "avatar"),
                ]),
              ]),
              item("username", uiText("compatibleVisualNavigation.commonGroups.items20"), "username"),
              item("fan-medal", uiText("compatibleVisualNavigation.commonGroups.items31"), "fanMedal", [
                item("fan-medal-content", uiText("compatibleVisualNavigation.commonGroups.items32"), "fanMedalContent", [
                  item("fan-medal-guard", uiText("compatibleVisualNavigation.commonGroups.items33"), "fanMedalGuard"),
                ]),
                item("fan-medal-level", uiText("compatibleVisualNavigation.commonGroups.items34"), "fanMedalLevel"),
              ]),
              item("identity-badges", uiText("compatibleVisualNavigation.commonGroups.items22"), undefined, [
              item("guard-badge", uiText("compatibleVisualNavigation.commonGroups.items23"), "guardBadge"),
              item("streamer-badge-wrap", uiText("compatibleVisualNavigation.commonGroups.items35"), "streamerBadge", [
                item("streamer-badge", uiText("compatibleVisualNavigation.commonGroups.items36"), "streamerBadgeIcon"),
              ]),
              item("mod-badge-wrap", uiText("compatibleVisualNavigation.commonGroups.items37"), "modBadge", [
                item("mod-badge", uiText("compatibleVisualNavigation.commonGroups.items38"), "modBadgeIcon"),
              ]),
              ]),
              item("wealth-medal", uiText("compatibleVisualNavigation.commonGroups.items39"), "wealthMedal", [
                item("wealth-text", uiText("compatibleVisualNavigation.commonGroups.items40"), "wealthText"),
                item("wealth-image", uiText("compatibleVisualNavigation.commonGroups.items41"), "wealthImage"),
              ]),
              item("current-rank", uiText("compatibleVisualNavigation.commonGroups.items42"), "currentRank"),
            ]
          : [
              item("avatar-wrap", uiText("compatibleVisualNavigation.commonGroups.items18"), "avatarWrap", [
                item("avatar-frame", uiText("compatibleVisualNavigation.commonGroups.items29"), "avatarFrame"),
                item("avatar", uiText("compatibleVisualNavigation.commonGroups.items19"), "avatar"),
              ]),
              item("username", uiText("compatibleVisualNavigation.commonGroups.items20"), "username"),
              item("user-info", uiText("compatibleVisualNavigation.commonGroups.items21"), "userInfo"),
              item("fan-medal-wrap", uiText("compatibleVisualNavigation.commonGroups.items43"), "fanMedalWrap", [
                item("fan-medal", uiText("compatibleVisualNavigation.commonGroups.items31"), "fanMedal", [
                  item("fan-medal-name", uiText("compatibleVisualNavigation.commonGroups.items44"), "fanMedalName"),
                  item("fan-medal-level", uiText("compatibleVisualNavigation.commonGroups.items34"), "fanMedalLevel"),
                ]),
              ]),
              item("identity", uiText("compatibleVisualNavigation.commonGroups.items22"), "identity", [
                item("mod-badge", uiText("compatibleVisualNavigation.commonGroups.items38"), "modBadge"),
                item("guard-badge", uiText("compatibleVisualNavigation.commonGroups.items23"), "guardBadge"),
              ]),
              item("badge", uiText("compatibleVisualNavigation.commonGroups.items45"), "badge"),
            ],
    },
    {
      id: "content",
      label: uiText("compatibleVisualNavigation.commonGroups.label3"),
      defaultExpanded: true,
      items: [
        item("message", uiText("compatibleVisualNavigation.commonGroups.items27"), "message"),
        item("action", uiText("compatibleVisualNavigation.commonGroups.items46"), "action"),
        item("timestamp", uiText("compatibleVisualNavigation.commonGroups.items25"), "timestamp"),
        item("event-icon", uiText("compatibleVisualNavigation.commonGroups.items47"), "eventIcon"),
        item(
          "amount",
          uiText("compatibleVisualNavigation.commonGroups.items28"),
          "amount",
          mode === "laplace"
            ? [
                item("price-currency", uiText("compatibleVisualNavigation.commonGroups.items48"), "priceCurrency"),
                item("price-figure", uiText("compatibleVisualNavigation.commonGroups.items49"), "priceFigure"),
              ]
            : undefined,
        ),
        item("translation", uiText("compatibleVisualNavigation.commonGroups.items50"), "translation"),
      ],
    },
    {
      id: "emote",
      label: uiText("compatibleVisualNavigation.commonGroups.label4"),
      defaultExpanded: true,
      items:
        mode === "laplace"
          ? [
              item("small-emote-wrap", uiText("compatibleVisualNavigation.commonGroups.items51"), "smallEmoteWrap", [
                item("small-emote", uiText("compatibleVisualNavigation.commonGroups.items52"), "smallEmote"),
              ]),
              item("large-emote-wrap", uiText("compatibleVisualNavigation.commonGroups.items53"), "largeEmoteWrap", [
                item("large-emote", uiText("compatibleVisualNavigation.commonGroups.items54"), "largeEmote"),
              ]),
            ]
          : [
              item("small-emote", uiText("compatibleVisualNavigation.commonGroups.items52"), "smallEmote"),
              item("large-emote", uiText("compatibleVisualNavigation.commonGroups.items54"), "largeEmote"),
            ],
    },
  ];
};

const eventGroups = (mode: CompatibleThemeMode): GroupSeed[] =>
  mode === "laplace"
    ? [
        {
          id: "danmaku",
          label: uiText("compatibleVisualNavigation.eventGroups.label"),
          defaultExpanded: false,
          items: [
            item("reply", uiText("compatibleVisualNavigation.eventGroups.items"), "reply", [
              item("reply-avatar", uiText("compatibleVisualNavigation.eventGroups.items2"), "replyAvatar"),
              item("reply-username", uiText("compatibleVisualNavigation.eventGroups.items3"), "replyUsername"),
            ]),
            item("spoiler", uiText("compatibleVisualNavigation.eventGroups.items4"), "spoiler"),
          ],
        },
        {
          id: "gift",
          label: uiText("compatibleVisualNavigation.eventGroups.label2"),
          defaultExpanded: false,
          items: [
            item("gift-image-wrap", uiText("compatibleVisualNavigation.eventGroups.items5"), "giftImageWrap", [
              item("gift-image", uiText("compatibleVisualNavigation.eventGroups.items6"), "giftImage"),
            ]),
            item("gift-name", uiText("compatibleVisualNavigation.eventGroups.items7"), "giftName"),
            item("gift-details", uiText("compatibleVisualNavigation.eventGroups.items8"), "giftDetails", [
              item("gift-symbol", uiText("compatibleVisualNavigation.eventGroups.items9"), "giftSymbol"),
              item("gift-count", uiText("compatibleVisualNavigation.eventGroups.items10"), "giftCount"),
              item("gift-detail-price", uiText("compatibleVisualNavigation.eventGroups.items11"), "giftDetailPrice"),
            ]),
            item("gift-blind", uiText("compatibleVisualNavigation.eventGroups.items12"), "giftBlind", [
              item("gift-blind-name", uiText("compatibleVisualNavigation.eventGroups.items13"), "giftBlindName"),
              item("gift-blind-action", uiText("compatibleVisualNavigation.eventGroups.items14"), "giftBlindAction"),
            ]),
            item("gift-blind-amount", uiText("compatibleVisualNavigation.eventGroups.items15"), undefined, [
              item("gift-paid-price", uiText("compatibleVisualNavigation.eventGroups.items16"), "giftPaidPrice"),
              item("gift-result-price", uiText("compatibleVisualNavigation.eventGroups.items17"), "giftResultPrice"),
              item("gift-trend", uiText("compatibleVisualNavigation.eventGroups.items18"), "giftTrend"),
            ]),
            item("gift-receiver", uiText("compatibleVisualNavigation.eventGroups.items19"), "giftReceiver", [
              item("gift-receiver-action", uiText("compatibleVisualNavigation.eventGroups.items14"), "giftReceiverAction"),
              item("gift-receiver-avatar", uiText("compatibleVisualNavigation.eventGroups.items20"), "giftReceiverAvatar"),
              item(
                "gift-receiver-username",
                uiText("compatibleVisualNavigation.eventGroups.items21"),
                "giftReceiverUsername",
              ),
            ]),
          ],
        },
        {
          id: "superchat",
          label: uiText("compatibleVisualNavigation.eventGroups.label3"),
          defaultExpanded: false,
          items: [
            item("sc-body", uiText("compatibleVisualNavigation.eventGroups.items22"), "body", undefined, { event: "superchat" }),
            item("sc-message", uiText("compatibleVisualNavigation.eventGroups.items23"), "message", undefined, {
              event: "superchat",
            }),
            item(
              "sc-amount",
              uiText("compatibleVisualNavigation.eventGroups.items24"),
              "amount",
              [
                item("sc-currency", uiText("compatibleVisualNavigation.eventGroups.items25"), "priceCurrency"),
                item("sc-figure", uiText("compatibleVisualNavigation.eventGroups.items26"), "priceFigure"),
              ],
              { event: "superchat" },
            ),
            item("sc-spoiler", uiText("compatibleVisualNavigation.eventGroups.items4"), "spoiler", undefined, {
              event: "superchat",
            }),
            item("sc-deleted", uiText("compatibleVisualNavigation.eventGroups.items27"), "deleted", undefined, {
              event: "superchat",
            }),
            item("sc-translation", uiText("compatibleVisualNavigation.eventGroups.items28"), "translation", undefined, {
              event: "superchat",
            }),
          ],
        },
        {
          id: "guard",
          label: uiText("compatibleVisualNavigation.eventGroups.label4"),
          defaultExpanded: false,
          items: [
            item("guard-content", uiText("compatibleVisualNavigation.eventGroups.items29"), "guardContent", [
              item("guard-action", uiText("compatibleVisualNavigation.eventGroups.items14"), "action"),
              item("guard-type", uiText("compatibleVisualNavigation.eventGroups.items30"), "guardType"),
              item("guard-duration", uiText("compatibleVisualNavigation.eventGroups.items31"), undefined, [
                item("guard-symbol", uiText("compatibleVisualNavigation.eventGroups.items9"), "guardSymbol"),
                item("guard-figure", uiText("compatibleVisualNavigation.eventGroups.items10"), "guardFigure"),
                item("guard-unit", uiText("compatibleVisualNavigation.eventGroups.items32"), "guardUnit"),
              ]),
              item("guard-days-group", uiText("compatibleVisualNavigation.eventGroups.items33"), undefined, [
                item("guard-days-before", uiText("compatibleVisualNavigation.eventGroups.items34"), "guardDaysBefore"),
                item("guard-days", uiText("compatibleVisualNavigation.eventGroups.items35"), "guardDays"),
                item("guard-days-after", uiText("compatibleVisualNavigation.eventGroups.items36"), "guardDaysAfter"),
              ]),
            ]),

          ],
        },
        {
          id: "activity",
          label: uiText("compatibleVisualNavigation.eventGroups.label5"),
          defaultExpanded: false,
          items: [
            item(
              "red",
              uiText("compatibleVisualNavigation.eventGroups.items37"),
              undefined,
              [
                item("red-action", uiText("compatibleVisualNavigation.eventGroups.items14"), "action"),
                item("red-title", uiText("compatibleVisualNavigation.eventGroups.items38"), "redTitle"),
                item("red-rewards", uiText("compatibleVisualNavigation.eventGroups.items39"), "rewardList", [
                  item("red-reward", uiText("compatibleVisualNavigation.eventGroups.items40"), "rewardItem", [
                    item("red-count", uiText("compatibleVisualNavigation.eventGroups.items10"), "rewardCount"),
                    item("red-picture", uiText("compatibleVisualNavigation.eventGroups.items41"), "rewardPicture", [
                      item("red-image", uiText("compatibleVisualNavigation.eventGroups.items42"), "rewardImage"),
                    ]),
                  ]),
                ]),
                item("red-icon", uiText("compatibleVisualNavigation.eventGroups.items43"), "eventIcon"),
                item("red-price", uiText("compatibleVisualNavigation.eventGroups.items24"), "amount"),
              ],
              { event: "redStart" },
            ),
            item(
              "lottery",
              uiText("compatibleVisualNavigation.eventGroups.items44"),
              undefined,
              [
                item("lottery-message", uiText("compatibleVisualNavigation.eventGroups.items45"), "lotteryMessage", [
                  item("lottery-prize", uiText("compatibleVisualNavigation.eventGroups.items46"), "lotteryPrize"),
                ]),
                item(
                  "lottery-requirements",
                  uiText("compatibleVisualNavigation.eventGroups.items47"),
                  "lotteryRequirements",
                  [item("lottery-condition", uiText("compatibleVisualNavigation.eventGroups.items48"), "lotteryGiftName")],
                ),
                item("lottery-gift", uiText("compatibleVisualNavigation.eventGroups.items49"), undefined, [

                  item("lottery-gift-price", uiText("compatibleVisualNavigation.eventGroups.items24"), "lotteryGiftPrice"),
                ]),
                item("lottery-icon", uiText("compatibleVisualNavigation.eventGroups.items50"), "eventIcon"),
              ],
              { event: "lotteryStart" },
            ),
            item(
              "winners",
              uiText("compatibleVisualNavigation.eventGroups.items51"),
              undefined,
              ["winners", "redResult", "lotteryResult"].map((event) =>
                item(
                  `winners-${event}`,
                  event === "winners"
                    ? uiText("compatibleVisualNavigation.eventGroups.items52")
                    : event === "redResult"
                      ? uiText("compatibleVisualNavigation.eventGroups.items53")
                      : uiText("compatibleVisualNavigation.eventGroups.items54"),
                  undefined,
                  [
                    item(
                      `winner-content-${event}`,
                      uiText("compatibleVisualNavigation.eventGroups.items55"),
                      "winnerContent",
                      [
                        item(
                          `winner-title-${event}`,
                          uiText("compatibleVisualNavigation.eventGroups.items56"),
                          "winnerTitle",
                        ),
                        item(
                          `winner-toggle-${event}`,
                          uiText("compatibleVisualNavigation.eventGroups.items57"),
                          "winnerToggle",
                        ),
                        item(`winner-mask-${event}`, uiText("compatibleVisualNavigation.eventGroups.items58"), "winnerMask", [
                          item(
                            `winner-list-${event}`,
                            uiText("compatibleVisualNavigation.eventGroups.items59"),
                            "winnerList",
                            [
                              item(
                                `winner-item-${event}`,
                                uiText("compatibleVisualNavigation.eventGroups.items60"),
                                "winnerItem",
                                [
                                  item(
                                    `winner-avatar-${event}`,
                                    uiText("compatibleVisualNavigation.eventGroups.items61"),
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
          label: uiText("compatibleVisualNavigation.eventGroups.label6"),
          defaultExpanded: false,
          items: [
            item("mute-operator", uiText("compatibleVisualNavigation.eventGroups.items62"), "muteOperator"),
            item("mute-duration", uiText("compatibleVisualNavigation.eventGroups.items63"), "muteDuration"),
          ],
        },
      ]
    : [
        {
          id: "gift",
          label: uiText("compatibleVisualNavigation.eventGroups.label2"),
          defaultExpanded: false,
          items: [
            item("gift-message", uiText("compatibleVisualNavigation.eventGroups.items64"), "message", undefined, {
              event: "gift",
            }),
            item("gift-amount", uiText("compatibleVisualNavigation.eventGroups.items65"), "amount", undefined, {
              event: "gift",
            }),
          ],
        },
        {
          id: "superchat",
          label: uiText("compatibleVisualNavigation.eventGroups.label3"),
          defaultExpanded: false,
          items: [
            item("sc-body", uiText("compatibleVisualNavigation.eventGroups.items22"), "body", undefined, { event: "superchat" }),
            item("sc-message", uiText("compatibleVisualNavigation.eventGroups.items23"), "message", undefined, {
              event: "superchat",
            }),
            item("sc-amount", uiText("compatibleVisualNavigation.eventGroups.items24"), "amount", undefined, {
              event: "superchat",
            }),
          ],
        },
        {
          id: "guard",
          label: uiText("compatibleVisualNavigation.eventGroups.label4"),
          defaultExpanded: false,
          items: [
            item(
              "guard-description",
              uiText("compatibleVisualNavigation.eventGroups.items66"),
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
