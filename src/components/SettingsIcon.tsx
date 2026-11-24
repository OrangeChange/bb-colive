import { Settings2, Eye, ListFilter, Radio, History, PanelsTopLeft, PictureInPicture2, MousePointer2, Volume2, Info, HardDrive, CloudDownload, Archive, FolderSync, ShieldCheck, Server, UserRound, AudioLines, ListOrdered, Type, FileText, Palette, MoveHorizontal, Square, Image, LayoutPanelTop, MessagesSquare, Wallet, Bookmark, Sparkles, Bell, Layers, Gift, MessageSquareQuote, Ship, type LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = {
  "基础设置": Settings2, "信息元素": UserRound, "模式设置": Settings2, "通用设置": Settings2, "事件显示": Eye, "事件筛选": ListFilter, "现场": Radio,
  "回看": History, "副窗口": PictureInPicture2, "事件交互": MousePointer2, "语音与播报": Volume2,
  "其他设置": Settings2, "关于": Info, "档案传输": FolderSync, "保留策略": Archive,
  "空间与清理": HardDrive, "云端记录服务": CloudDownload, "记录恢复": History,
  "服务器": Server, "B站账号": UserRound, "采集房间": Radio, "诊断与日志": ShieldCheck,
  "播报状态": AudioLines, "队列规则": ListOrdered, "事件播报": Bell, "发音修正": Type,
  "播报模板": FileText, "可见性": Eye, "显示": Eye, "文字": Type, "颜色与背景": Palette,
  "间距": MoveHorizontal, "边框": Square, "排版": LayoutPanelTop, "媒体": Image,
  "窗口通用设置": PanelsTopLeft, "弹幕窗": MessagesSquare, "收益窗": Wallet,
  "副窗口与 OBS": PanelsTopLeft, "收藏行为": Bookmark, "事件显示策略": ListFilter,
  "置顶栏": PanelsTopLeft, "事件快捷菜单": MousePointer2, "用户昵称": UserRound,
  "分窗": Layers, "礼物窗": Gift, "醒目留言窗": MessageSquareQuote, "大航海窗": Ship,
  "身份标记": ShieldCheck, "特效": Sparkles,
  "播放规则": ListOrdered, "提示音文件": AudioLines, "数据保留": Archive,
};

export const getSettingsIcon = (name: string) => icons[name];

export function SettingsIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = getSettingsIcon(name);
  return Icon ? <Icon size={size} strokeWidth={2} className="settings-heading-icon" aria-hidden="true" /> : null;
}
