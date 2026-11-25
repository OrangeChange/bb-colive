import { useState, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Save,
  RotateCcw,
  Trash2,
  MoreHorizontal,
  Check,
  Search,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { ThemeActionMenu } from "../../../src/components/ThemeActionMenu";
import "../../../src/components/nativeThemeEditor.css";
import { UiSelect } from "../../../src/components/ui/Select";
import { UiSearchInput } from "../../../src/components/ui/SearchInput";
import { SwitchButton } from "../../../src/components/SettingsSwitch";
import {
  PanelSwitch,
  controlClass,
} from "../../../src/components/voicePanelPrimitives";
import { SettingsChoiceControl } from "../../../src/components/SettingsChoiceControl";
import { ConfirmDialog } from "../../../src/components/ConfirmDialog";
import {
  actionButtonClass,
  accentSolidButtonClass,
  dangerActionButtonClass,
} from "../../../src/components/actionButtonStyles";
import { Button } from "../../../src/components/shadcn/button";
import { Input } from "../../../src/components/shadcn/input";
import { Label } from "../../../src/components/shadcn/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../../../src/components/shadcn/select";
import { Switch } from "../../../src/components/shadcn/switch";
import { Checkbox } from "../../../src/components/shadcn/checkbox";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../../src/components/shadcn/toggle-group";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../../../src/components/shadcn/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../../src/components/shadcn/dropdown-menu";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../../../src/components/shadcn/tooltip";
import { Progress } from "../../../src/components/shadcn/progress";
import { Slider } from "../../../src/components/shadcn/slider";
import {
  RadioGroup,
  RadioGroupItem,
} from "../../../src/components/shadcn/radio-group";
import { Badge } from "../../../src/components/shadcn/badge";
const params = new URLSearchParams(location.search),
  after = params.get("kind") === "after";
document.documentElement.classList.toggle(
  "dark",
  params.get("scheme") === "dark",
);
document.documentElement.dataset.theme = params.get("palette") ?? "sakura";
if (after) await import("../../../src/shadcn.css");
else await import("../../../src/App.css");
await import("./panel.css");
const fonts = [
  { value: "misans", label: "MiSans" },
  { value: "system", label: "跟随系统" },
  { value: "long", label: "MiSans · 繁体中文与日文回退字体" },
  { value: "disabled", label: "不可用字体", disabled: true },
];
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sample-row">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
function App() {
  const [font, setFont] = useState("misans"),
    [name, setName] = useState("我的直播样式"),
    [search, setSearch] = useState(""),
    [avatar, setAvatar] = useState(true),
    [sound, setSound] = useState(false),
    [mode, setMode] = useState("system"),
    [checked, setChecked] = useState(true),
    [volume, setVolume] = useState(65),
    [dialog, setDialog] = useState(false),
    [saved, setSaved] = useState(false),
    [radio, setRadio] = useState("auto");
  useEffect(() => {
    const panel = document.querySelector(".sample-panel");
    if (!panel) return;
    const resize = () => {
      const frame = window.frameElement as HTMLIFrameElement | null;
      if (frame)
        frame.style.height = `${Math.ceil(panel.getBoundingClientRect().height) + 2}px`;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(panel);
    void document.fonts.ready.then(resize);
    return () => observer.disconnect();
  }, []);
  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  return (
    <TooltipProvider>
      <main className="sample-panel">
        <header className="sample-heading">
          <div>
            <h2>样式与显示</h2>
            <p>常用控件与操作状态</p>
          </div>
          {after ? (
            <Badge variant="secondary">未应用</Badge>
          ) : (
            <span className="sample-tag">未应用</span>
          )}
        </header>
        <Section title="按钮">
          <div className="sample-controls">
            {after ? (
              <>
                <Button onClick={save}>
                  {saved ? <Check /> : <Save />}
                  {saved ? "已保存" : "保存调整"}
                </Button>
                <Button variant="outline">
                  <RotateCcw />
                  恢复默认
                </Button>
                <Button variant="destructive">
                  <Trash2 />
                  删除
                </Button>
                <Button disabled>正在保存</Button>
              </>
            ) : (
              <>
                <button
                  className={accentSolidButtonClass + " gap-1.5"}
                  onClick={save}
                >
                  {saved ? <Check size={16} /> : <Save size={16} />}{" "}
                  {saved ? "已保存" : "保存调整"}
                </button>
                <button className={actionButtonClass + " gap-1.5"}>
                  <RotateCcw size={16} />
                  恢复默认
                </button>
                <button className={dangerActionButtonClass + " gap-1.5"}>
                  <Trash2 size={16} />
                  删除
                </button>
                <button className={accentSolidButtonClass} disabled>
                  正在保存
                </button>
              </>
            )}
          </div>
        </Section>
        <Section title="输入与搜索">
          <div className="sample-fields">
            <div className="sample-field">
              {after ? (
                <Label htmlFor="theme-name">主题名称</Label>
              ) : (
                <label htmlFor="theme-name">主题名称</label>
              )}
              {after ? (
                <Input
                  id="theme-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              ) : (
                <input
                  id="theme-name"
                  className={controlClass + " w-full"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </div>
            <div className="sample-field">
              <label htmlFor="search">搜索内容</label>
              {after ? (
                <div className="sample-search">
                  <Search aria-hidden size={16} />
                  <Input
                    id="search"
                    placeholder="搜索弹幕或用户名"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="清空搜索"
                      onClick={() => setSearch("")}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              ) : (
                <UiSearchInput
                  id="search"
                  aria-label="搜索内容"
                  placeholder="搜索弹幕或用户名"
                  value={search}
                  onValueChange={setSearch}
                />
              )}
            </div>
          </div>
          <div className="sample-field sample-validation">
            <label htmlFor="invalid-name">重复名称</label>
            {after ? (
              <Input
                id="invalid-name"
                value="原生默认"
                readOnly
                aria-invalid="true"
                aria-describedby="name-error"
              />
            ) : (
              <input
                id="invalid-name"
                className={controlClass + " w-full border-danger"}
                value="原生默认"
                readOnly
                aria-invalid="true"
                aria-describedby="name-error"
              />
            )}
            <p id="name-error" className="sample-error">
              名称已存在，请换一个名称。
            </p>
          </div>
        </Section>
        <Section title="选择器">
          <div className="sample-inline-field">
            <label id="font-label">界面字体</label>
            {after ? (
              <Select value={font} onValueChange={setFont}>
                <SelectTrigger
                  aria-labelledby="font-label"
                  className="w-[260px] max-w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  collisionPadding={8}
                >
                  {fonts.map((f) => (
                    <SelectItem
                      key={f.value}
                      value={f.value}
                      disabled={f.disabled}
                    >
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <UiSelect
                ariaLabel="界面字体"
                options={fonts}
                value={font}
                onValueChange={setFont}
                className="w-[260px] max-w-full"
              />
            )}
          </div>
        </Section>
        <Section title="开关与复选">
          <div className="sample-settings">
            <div>
              <label htmlFor="avatar">显示头像</label>
              {after ? (
                <Switch
                  id="avatar"
                  checked={avatar}
                  onCheckedChange={setAvatar}
                />
              ) : (
                <SwitchButton
                  label="显示头像"
                  checked={avatar}
                  onChange={() => setAvatar(!avatar)}
                />
              )}
            </div>
            <div>
              <label htmlFor="sound">语音播报</label>
              {after ? (
                <Switch id="sound" checked={sound} onCheckedChange={setSound} />
              ) : (
                <PanelSwitch
                  label="语音播报"
                  checked={sound}
                  onChange={() => setSound(!sound)}
                />
              )}
            </div>
          </div>
          <div className="sample-checkbox">
            {after ? (
              <>
                <Checkbox
                  id="remember"
                  checked={checked}
                  onCheckedChange={(v) => setChecked(v === true)}
                />
                <Label htmlFor="remember">记住当前选择</Label>
              </>
            ) : (
              <label className="sample-checkbox">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                记住当前选择
              </label>
            )}
          </div>
        </Section>
        <Section title="分段选项">
          <div className="sample-inline-field">
            <label>明暗</label>
            {after ? (
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(v) => v && setMode(v)}
                variant="outline"
                spacing={0}
                aria-label="明暗"
              >
                {[
                  ["system", "跟随软件"],
                  ["light", "浅色"],
                  ["dark", "深色"],
                ].map(([v, l]) => (
                  <ToggleGroupItem value={v} key={v}>
                    {l}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : (
              <SettingsChoiceControl
                label="明暗"
                value={mode}
                options={[
                  { value: "system", label: "跟随软件" },
                  { value: "light", label: "浅色" },
                  { value: "dark", label: "深色" },
                ]}
                onChange={setMode}
              />
            )}
          </div>
          <div className="sample-inline-field sample-radio-row">
            <label>更新线路</label>
            {after ? (
              <RadioGroup
                value={radio}
                onValueChange={setRadio}
                className="sample-radios"
              >
                <div>
                  <RadioGroupItem value="auto" id="auto" />
                  <Label htmlFor="auto">自动</Label>
                </div>
                <div>
                  <RadioGroupItem value="domestic" id="domestic" />
                  <Label htmlFor="domestic">国内</Label>
                </div>
              </RadioGroup>
            ) : (
              <div className="sample-radios">
                <label>
                  <input
                    type="radio"
                    name="route"
                    checked={radio === "auto"}
                    onChange={() => setRadio("auto")}
                  />
                  自动
                </label>
                <label>
                  <input
                    type="radio"
                    name="route"
                    checked={radio === "domestic"}
                    onChange={() => setRadio("domestic")}
                  />
                  国内
                </label>
              </div>
            )}
          </div>
        </Section>
        <Section title="滑块与进度">
          <div className="sample-volume">
            <label>播报音量</label>
            <span>{volume}%</span>
          </div>
          {after ? (
            <Slider
              aria-label="播报音量"
              value={[volume]}
              onValueChange={(v) => setVolume(v[0])}
              min={0}
              max={100}
            />
          ) : (
            <input
              className="sample-old-range"
              type="range"
              aria-label="播报音量"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          )}
          <div className="sample-progress-label">
            <span>下载更新</span>
            <span>72%</span>
          </div>
          {after ? (
            <Progress value={72} aria-label="下载进度" />
          ) : (
            <progress
              className="sample-old-progress"
              value={72}
              max={100}
              aria-label="下载进度"
            />
          )}
        </Section>
        <Section title="弹窗与菜单">
          <div className="sample-controls">
            {after ? (
              <>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <SlidersHorizontal />
                      编辑主题
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>主题设置</DialogTitle>
                      <DialogDescription>
                        调整名称和字体，保存后用于当前主题。
                      </DialogDescription>
                    </DialogHeader>
                    <div className="sample-field">
                      <Label htmlFor="dialog-name">主题名称</Label>
                      <Input id="dialog-name" defaultValue="我的直播样式" />
                    </div>
                    <div className="sample-field">
                      <Label id="dialog-font-label">字体</Label>
                      <Select defaultValue="misans">
                        <SelectTrigger
                          aria-labelledby="dialog-font-label"
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {fonts.map((f) => (
                            <SelectItem
                              value={f.value}
                              key={f.value}
                              disabled={f.disabled}
                            >
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">取消</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button onClick={save}>保存设置</Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <MoreHorizontal />
                      更多操作
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={save}>
                      <Save />
                      保存调整
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <RotateCcw />
                      恢复默认
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive">
                      <Trash2 />
                      删除主题
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="显示帮助">
                      <SlidersHorizontal />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>调整当前主题</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <>
                <button
                  className={actionButtonClass + " gap-1.5"}
                  onClick={() => setDialog(true)}
                >
                  <SlidersHorizontal size={16} />
                  编辑主题
                </button>
                <ThemeActionMenu
                  label="更多操作"
                  className={actionButtonClass + " gap-1.5"}
                  items={[
                    {
                      label: "保存调整",
                      icon: <Save size={16} />,
                      action: save,
                    },
                    {
                      label: "恢复默认",
                      icon: <RotateCcw size={16} />,
                      action: () => {},
                    },
                    {
                      label: "删除主题",
                      icon: <Trash2 size={16} />,
                      action: () => {},
                      separator: true,
                    },
                  ]}
                >
                  <MoreHorizontal size={16} />
                  更多操作
                </ThemeActionMenu>
              </>
            )}
          </div>
        </Section>
        <p className="sample-footnote" role="status">
          {saved
            ? "调整已保存（仅本页演示）"
            : "控件均可操作，修改仅保留在本页。"}
        </p>
        {!after && dialog && (
          <ConfirmDialog
            title="主题设置"
            description="调整名称和字体，保存后用于当前主题。"
            confirmLabel="保存设置"
            onCancel={() => setDialog(false)}
            onConfirm={save}
          >
            <div className="sample-dialog-fields">
              <div className="sample-field">
                <label htmlFor="dialog-name">主题名称</label>
                <input
                  id="dialog-name"
                  className={controlClass + " w-full"}
                  defaultValue="我的直播样式"
                />
              </div>
              <div className="sample-field">
                <label>字体</label>
                <UiSelect
                  ariaLabel="弹窗字体"
                  options={fonts}
                  value={font}
                  onValueChange={setFont}
                />
              </div>
            </div>
          </ConfirmDialog>
        )}
      </main>
    </TooltipProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
