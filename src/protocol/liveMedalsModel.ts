export interface LiveMedal {
  id: number;
  name: string;
  level: number;
  anchor: string;
  worn: boolean;
  lighted: boolean;
  background: string;
}
export function parseMedalPanel(data: any) {
  const medals: LiveMedal[] = (Array.isArray(data?.list) ? data.list : [])
    .map((item: any) => {
      const m = item.medal ?? {};
      const u = item.uinfo_medal ?? {};
      return {
        id: Number(u.id || m.medal_id),
        name: String(u.name || m.medal_name || ""),
        level: Number(u.level ?? m.level) || 0,
        anchor: String(item.anchor_info?.nick_name || ""),
        worn: m.wearing_status === 1,
        lighted: (u.is_light ?? m.is_lighted) === 1,
        background: String(
          u.v2_medal_color_start ||
            (m.is_lighted === 1
              ? `#${(Number(m.medal_color) || 0).toString(16).padStart(6, "0")}`
              : ""),
        ),
      };
    })
    .filter((m: LiveMedal) => m.id > 0);
  const info = data?.page_info ?? {};
  return {
    medals,
    total: Number(data?.total_number) || medals.length,
    hasMore:
      info.has_more === true ||
      Number(info.current_page ?? info.cur_page) < Number(info.total_page),
    nextPage:
      Number(info.next_page) ||
      Number(info.current_page ?? info.cur_page ?? 1) + 1,
  };
}

export function parseWornMedal(medal: any): LiveMedal | null {
  const m = medal?.curr_weared_v2;
  if (!medal?.is_weared || !m?.name) return null;
  return {
    id: Number(m.id) || 0,
    name: String(m.name),
    level: Number(m.level) || 0,
    anchor: "",
    worn: true,
    lighted: m.is_light === 1,
    background: String(m.v2_medal_color_start || ""),
  };
}
