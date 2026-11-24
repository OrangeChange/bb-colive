import { Settings2, Eye, ListFilter, Radio, History, PanelsTopLeft, PictureInPicture2, MousePointer2, Volume2, Info, HardDrive, CloudDownload, Archive, FolderSync, ShieldCheck, Server, UserRound, AudioLines, ListOrdered, Type, FileText, Palette, MoveHorizontal, Square, Image, LayoutPanelTop, MessagesSquare, Wallet, Bookmark, Sparkles, Bell, Layers, Gift, MessageSquareQuote, Ship, type LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = {
  "basic": Settings2, "information": UserRound, "mode": Settings2, "general": Settings2, "display": Eye, "filters": ListFilter, "live": Radio,
  "review": History, "windows": PictureInPicture2, "interaction": MousePointer2, "voice": Volume2,
  "other": Settings2, "about": Info, "archiveTransfer": FolderSync, "retention": Archive,
  "storage": HardDrive, "cloud": CloudDownload, "recovery": History,
  "server": Server, "account": UserRound, "collection": Radio, "diagnostics": ShieldCheck,
  "runtime": AudioLines, "queue": ListOrdered, "eventSpeech": Bell, "pronunciation": Type,
  "templates": FileText, "visibility": Eye, "typography": Type, "surface": Palette,
  "spacing": MoveHorizontal, "border": Square, "layout": LayoutPanelTop, "media": Image,
  "windowGeneral": PanelsTopLeft, "chatWindow": MessagesSquare, "revenueWindow": Wallet,
  "windowOutputs": PanelsTopLeft, "favoriteBehavior": Bookmark, "eventPolicy": ListFilter,
  "sticky": PanelsTopLeft, "eventMenu": MousePointer2, "nicknames": UserRound,
  "splitWindows": Layers, "gift": Gift, "superchat": MessageSquareQuote, "guard": Ship,
  "badges": ShieldCheck, "effects": Sparkles,
  "playbackRules": ListOrdered, "audioFiles": AudioLines, "dataRetention": Archive,
};

export const getSettingsIcon = (name: string) => icons[name];

export function SettingsIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = getSettingsIcon(name);
  return Icon ? <Icon size={size} strokeWidth={2} className="settings-heading-icon" aria-hidden="true" /> : null;
}
