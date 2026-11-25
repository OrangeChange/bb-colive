import { ThemeCreateDialog } from "../../../src/components/ThemeImportDialog";
import { AboutDialog } from "../../../src/components/AboutDialog";
import { ReviewStyleSettings } from "../../../src/components/ReviewStyleSettings";
import { DateTimeField } from "../../../src/components/DateTimeField";
import { UiCombobox } from "../../../src/components/ui/Combobox";
import { useUiLanguage } from "../../../src/i18n/react";
import { uiText } from "../../../src/i18n";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SwitchButton } from "../../../src/components/SettingsSwitch";
import { SettingsChoiceControl } from "../../../src/components/SettingsChoiceControl";
import { SettingsListSelect } from "../../../src/components/SettingsListSelect";
import { UiSearchInput } from "../../../src/components/ui/SearchInput";
import { ConfirmDialog } from "../../../src/components/ConfirmDialog";
import { Button } from "../../../src/components/shadcn/button";
import "../../../src/shadcn.css";
function App() {
  const [task, setTask] = useState("");
  useUiLanguage();
  const [date, setDate] = useState<Date | undefined>(
    new Date(2026, 10, 25, 19, 30),
  );
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState(false),
    [choice, setChoice] = useState("a"),
    [font, setFont] = useState(""),
    [search, setSearch] = useState("初始查询"),
    [open, setOpen] = useState(false),
    [fail, setFail] = useState(true);
  return (
    <main style={{ padding: 32, display: "grid", gap: 20, maxWidth: 520 }}>
      <DateTimeField
        label={uiText("uiControls.time")}
        value={date}
        onChange={setDate}
      />
      <output data-date>{date?.getTime() ?? ""}</output>
      <UiCombobox
        id="suggestion"
        ariaLabel="搜索建议"
        value={query}
        onValueChange={setQuery}
        options={[
          { value: "最近查询", label: "最近查询", group: "recent" },
          { value: "礼物名称", label: "礼物名称", group: "suggestion" },
        ]}
      />
      <Button onClick={() => setTask("create")}>新建主题</Button>
      <Button onClick={() => setTask("about")}>关于</Button>
      <ReviewStyleSettings />
      {task === "create" && (
        <ThemeCreateDialog
          onClose={() => setTask("")}
          onCreate={() => setTask("")}
        />
      )}{" "}
      {task === "about" && (
        <AboutDialog version="1.1.0" onClose={() => setTask("")} />
      )}
      <SwitchButton
        label="显示头像"
        checked={checked}
        onChange={() => setChecked((v) => !v)}
      />
      <SettingsChoiceControl
        label="排列方向"
        value={choice}
        options={[
          { value: "a", label: "横向" },
          { value: "b", label: "纵向" },
        ]}
        onChange={setChoice}
      />
      <SettingsListSelect
        ariaLabel="字体"
        value={font}
        options={[
          { value: "", label: "继承主题" },
          { value: "MiSans", label: "MiSans" },
          { value: "Arial", label: "Arial" },
        ]}
        onChange={setFont}
      />
      <UiSearchInput
        aria-label="搜索"
        value={search}
        onValueChange={setSearch}
      />
      <Button onClick={() => setOpen(true)}>删除档案</Button>
      {open && (
        <ConfirmDialog
          title="删除档案"
          description="确认删除选中的档案？"
          confirmLabel="删除"
          errorMessage="操作失败，请重试"
          onCancel={() => setOpen(false)}
          onConfirm={async () => {
            await new Promise((r) => setTimeout(r, 200));
            if (fail) {
              setFail(false);
              throw Error("retry");
            }
          }}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
