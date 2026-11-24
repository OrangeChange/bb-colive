import { RotateCcw } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { ConnectBar } from "./ConnectBar";
import { useGeneralSettings } from "../generalSettings.ts";
import { useVoiceSettings } from "../voice/voiceSettings.ts";
import { personalBroadcastController, voiceController } from "../voice/voiceRuntime.ts";
import { selectLocalAudioFile } from "../voice/audioOutput.ts";
import type { PersonalBroadcastRuleKey, PersonalBroadcastSettings } from "../voice/personalBroadcastTypes.ts";
import { getPersonalBroadcastPendingCount, getPersonalBroadcastRuleError } from "./personalBroadcastPanelModel.ts";
import { RuntimeQueueSummary, RuntimeQueueStatus } from "./RuntimeQueueSummary.tsx";
import { controlClass, sectionClass, PanelSwitch, SettingRow, SectionHeading, SectionToolbar } from "./voicePanelPrimitives.tsx";
import { SettingsChoiceControl } from "./SettingsChoiceControl";

const PERSONAL_BROADCAST_RULE_GROUPS: { title: string; rules: { key: PersonalBroadcastRuleKey; label: string }[] }[] = [
  {
    title: "互动",
    rules: [
      { key: "interact-entry", label: "进房" },
      { key: "interact-follow", label: "关注" },
      { key: "interact-share", label: "分享" },
      { key: "interact-special-follow", label: "特别关注" },
      { key: "interact-mutual-follow", label: "互相关注" },
      { key: "interact-like", label: "点赞" },
      { key: "interact-guard-entry", label: "大航海进房" },
    ],
  },
  {
    title: "收益活动",
    rules: [
      { key: "gift", label: "礼物" },
      { key: "blind-box", label: "盲盒" },
      { key: "red-pocket-start", label: "红包开始" },
      { key: "anchor-lottery-start", label: "天选开始" },
      { key: "super-chat", label: "醒目留言" },
      { key: "guard-captain", label: "舰长开通" },
      { key: "guard-admiral", label: "提督开通" },
      { key: "guard-governor", label: "总督开通" },
    ],
  },
  {
    title: "系统消息",
    rules: [
      { key: "system-warning", label: "直播间警告" },
      { key: "system-cut-off", label: "直播间切断" },
    ],
  },
];

const personalBroadcastModeOptions = [
  { value: "independent", label: "独立运行" },
  { value: "before-tts", label: "TTS 前播放提示音" },
] as const;

export function PersonalBroadcastPanel() {
  const settings = useVoiceSettings();
  const personalSnapshot = useSyncExternalStore(personalBroadcastController.subscribe, personalBroadcastController.getSnapshot, personalBroadcastController.getSnapshot);
  const voiceSnapshot = useSyncExternalStore(voiceController.subscribe, voiceController.getSnapshot, voiceController.getSnapshot);
  const onlyGuardEntry = useGeneralSettings((state) => state.eventDisplayPreferences.onlyGuardEntry);
  const [personalFileError, setPersonalFileError] = useState<{ key: PersonalBroadcastRuleKey; message: string } | null>(null);
  const statusText = personalSnapshot.status === "playing"
    ? "正在播报"
    : personalSnapshot.status === "paused"
      ? "已暂停"
      : personalSnapshot.status === "error"
        ? "需要处理"
        : settings.personalBroadcast.enabled ? "等待播报" : "未开启";
  const canControlPlayback = Boolean(personalSnapshot.current || personalSnapshot.pendingCount > 0);
  const playbackPaused = personalSnapshot.status === "paused";
  const currentPromptFile = personalSnapshot.current?.path.split(/[\\/]/).pop() ?? "暂无";
  const linkedPendingCount = getPersonalBroadcastPendingCount(voiceSnapshot, settings.personalBroadcast, onlyGuardEntry);
  const pendingCount = personalSnapshot.pendingCount + linkedPendingCount;

  const updatePersonalBroadcast = (value: Partial<PersonalBroadcastSettings>) => {
    settings.setVoiceSettings({ personalBroadcast: { ...settings.personalBroadcast, ...value } });
  };

  const updatePersonalBroadcastRule = (key: PersonalBroadcastRuleKey, value: Partial<PersonalBroadcastSettings["rules"][PersonalBroadcastRuleKey]>) => {
    updatePersonalBroadcast({
      rules: {
        ...settings.personalBroadcast.rules,
        [key]: { ...settings.personalBroadcast.rules[key], ...value },
      },
    });
  };

  const choosePersonalBroadcastFile = async (key: PersonalBroadcastRuleKey, label: string) => {
    setPersonalFileError(null);
    try {
      const audioPath = await selectLocalAudioFile();
      if (!audioPath) return;
      if (personalSnapshot.failedRuleKey === key) personalBroadcastController.clearError();
      updatePersonalBroadcastRule(key, { audioPath });
    } catch (error) {
      setPersonalFileError({ key, message: `选择${label}提示音失败：${error instanceof Error ? error.message : String(error)}` });
    }
  };

  const testPersonalBroadcastRule = (key: PersonalBroadcastRuleKey, label: string) => {
    if (!settings.personalBroadcast.rules[key].audioPath) {
      setPersonalFileError({ key, message: `${label}：请先选择 MP3/WAV 文件` });
      return;
    }
    setPersonalFileError(null);
    void personalBroadcastController.testRule(key).catch((error) => {
      setPersonalFileError({ key, message: `${label}文件不可用：${error instanceof Error ? error.message : String(error)}` });
    });
  };

  const clearPersonalBroadcastRule = (key: PersonalBroadcastRuleKey) => {
    if (personalSnapshot.failedRuleKey === key) personalBroadcastController.clearError();
    setPersonalFileError((current) => current?.key === key ? null : current);
    updatePersonalBroadcastRule(key, { audioPath: "", enabled: false });
  };

  const reset = () => {
    personalBroadcastController.stop();
    settings.resetPersonalBroadcastSettings();
    setPersonalFileError(null);
  };

  const togglePlayback = () => {
    if (playbackPaused) {
      personalBroadcastController.resume();
    } else if (canControlPlayback) {
      personalBroadcastController.pause();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ConnectBar />
      <main className="voice-panel-root min-h-0 flex-1 overflow-hidden bg-bg p-3">
        <section className="voice-panel-frame flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
          <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h1 className="ui-type-section-title font-medium text-t1">个性播报</h1>
              <p className="mt-0.5 ui-type-meta text-t3">为直播事件播放预设提示音</p>
            </div>
            <div className="flex items-center gap-3">
              <PanelSwitch label="开启个性播报" checked={settings.personalBroadcast.enabled} onChange={() => updatePersonalBroadcast({ enabled: !settings.personalBroadcast.enabled })} />
            </div>
          </header>

          <div className="voice-panel-scroll min-h-0 flex-1 overflow-y-auto">
            <section className={sectionClass}>
              <SectionToolbar title="播报状态" actionsClassName="voice-runtime-actions" status={<RuntimeQueueStatus text={statusText} state={personalSnapshot.status} />}>
                <button type="button" aria-label={playbackPaused ? "继续播报" : "暂停播报"} className={controlClass} onClick={togglePlayback} disabled={!canControlPlayback}>{playbackPaused ? "继续" : "暂停"}</button>
                <button type="button" className={controlClass} onClick={() => personalBroadcastController.skip()} disabled={!canControlPlayback}>跳过当前</button>
                <button type="button" className={controlClass} onClick={() => personalBroadcastController.clear()}>清空队列</button>
              </SectionToolbar>
              {personalSnapshot.error && (
                <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 ui-type-meta text-danger">
                  <div>{personalSnapshot.error}</div>
                  <button type="button" className="mt-1 rounded border border-danger/40 px-2 py-0.5 text-danger hover:bg-danger/10" onClick={() => personalBroadcastController.clearError()}>清除错误</button>
                </div>
              )}
              <RuntimeQueueSummary
                emptyText="等待下一条提示音"
                current={personalSnapshot.current ? currentPromptFile : null}
                pendingCount={pendingCount}
                discardedCount={personalSnapshot.discardedCount}
                failedCount={personalSnapshot.failedCount}
              />
            </section>

            <section className={sectionClass}>
              <SectionToolbar title="播放规则" actionsClassName="voice-personal-actions">
                <span className="ui-type-meta text-t3">仅影响个性播报队列</span>
              </SectionToolbar>
              <div className="voice-setting-grid grid min-w-0 gap-x-6 gap-y-1">
                <SettingRow label="模式">
                  <SettingsChoiceControl label="个性播报模式" options={personalBroadcastModeOptions} value={settings.personalBroadcast.mode} onChange={mode => updatePersonalBroadcast({ mode })} />
                </SettingRow>
                <SettingRow label="提示音间隔">
                  <div className="flex items-center gap-2">
                    <input aria-label="提示音间隔" className={`${controlClass} w-24 font-mono`} type="number" min={0} max={30} step={0.5} value={settings.personalBroadcast.promptIntervalSeconds} onChange={(event) => updatePersonalBroadcast({ promptIntervalSeconds: Number(event.target.value) })} />
                    <span className="ui-type-meta text-t3">秒</span>
                  </div>
                </SettingRow>
                {settings.personalBroadcast.mode === "before-tts" && (
                  <SettingRow label="提示音与 TTS 间隔">
                    <div className="flex items-center gap-2">
                      <input aria-label="提示音与 TTS 间隔" className={`${controlClass} w-24 font-mono`} type="number" min={0} max={30} step={0.5} value={settings.personalBroadcast.promptToTtsIntervalSeconds} onChange={(event) => updatePersonalBroadcast({ promptToTtsIntervalSeconds: Number(event.target.value) })} />
                      <span className="ui-type-meta text-t3">秒</span>
                    </div>
                  </SettingRow>
                )}
              </div>
            </section>

            <section className={sectionClass}>
              <SectionHeading>提示音文件</SectionHeading>
              <div className="space-y-4">
                {PERSONAL_BROADCAST_RULE_GROUPS.map((group) => (
                  <div key={group.title} className="voice-personal-group">
                    <h3 className="voice-personal-group-title ui-type-control font-medium text-t2">{group.title}</h3>
                    <div className="voice-personal-rule-list">
                      {group.rules.map(({ key, label }) => {
                        const rule = settings.personalBroadcast.rules[key];
                        const fileName = rule.audioPath.split(/[\\/]/).pop() || "未选择";
                        const ruleError = getPersonalBroadcastRuleError(key, personalSnapshot, personalFileError);
                        return (
                          <div key={key} className="voice-personal-rule-row">
                            <PanelSwitch label={`启用${label}提示音`} checked={rule.enabled} onChange={() => updatePersonalBroadcastRule(key, { enabled: !rule.enabled })} />
                            <span className="voice-personal-rule-label ui-type-control font-medium text-t1">{label}</span>
                            <span className="voice-personal-rule-file ui-type-control text-t2" title={rule.audioPath || undefined}>{fileName}</span>
                            <div className="voice-personal-rule-actions">
                              <button type="button" aria-label={`选择${label}提示音文件`} className={controlClass} onClick={() => void choosePersonalBroadcastFile(key, label)}>选择文件</button>
                              <button type="button" aria-label={`试听${label}提示音`} className={`${controlClass} border-accent/50 text-accent-text`} onClick={() => testPersonalBroadcastRule(key, label)}>试听</button>
                              <button type="button" aria-label={`清除${label}提示音`} className={`${controlClass} text-t3`} onClick={() => clearPersonalBroadcastRule(key)}>清除</button>
                            </div>
                            {ruleError && <span role="status" aria-live="polite" className="voice-personal-rule-error ui-type-meta text-danger">{ruleError}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${sectionClass} flex justify-end`}>
              <button type="button" className={`${controlClass} border-danger/40 text-danger`} title="恢复默认" aria-label="恢复默认" onClick={reset}><RotateCcw size={16} aria-hidden="true" /></button>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
