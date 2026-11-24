import { uiText } from "../i18n/index.ts";
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
    title: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.title"),
    rules: [
      { key: "interact-entry", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label") },
      { key: "interact-follow", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label2") },
      { key: "interact-share", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label3") },
      { key: "interact-special-follow", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label4") },
      { key: "interact-mutual-follow", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label5") },
      { key: "interact-like", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label6") },
      { key: "interact-guard-entry", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label7") },
    ],
  },
  {
    title: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.title2"),
    rules: [
      { key: "gift", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label8") },
      { key: "blind-box", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label9") },
      { key: "red-pocket-start", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label10") },
      { key: "anchor-lottery-start", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label11") },
      { key: "super-chat", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label12") },
      { key: "guard-captain", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label13") },
      { key: "guard-admiral", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label14") },
      { key: "guard-governor", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label15") },
    ],
  },
  {
    title: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.title3"),
    rules: [
      { key: "system-warning", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label16") },
      { key: "system-cut-off", label: uiText("personalBroadcastPanel.PERSONAL_BROADCAST_RULE_GROUPS.rules.label17") },
    ],
  },
];

const personalBroadcastModeOptions = [
  { value: "independent", label: uiText("personalBroadcastPanel.personalBroadcastModeOptions.label") },
  { value: "before-tts", label: uiText("personalBroadcastPanel.personalBroadcastModeOptions.label2") },
] as const;

export function PersonalBroadcastPanel() {
  const settings = useVoiceSettings();
  const personalSnapshot = useSyncExternalStore(personalBroadcastController.subscribe, personalBroadcastController.getSnapshot, personalBroadcastController.getSnapshot);
  const voiceSnapshot = useSyncExternalStore(voiceController.subscribe, voiceController.getSnapshot, voiceController.getSnapshot);
  const onlyGuardEntry = useGeneralSettings((state) => state.eventDisplayPreferences.onlyGuardEntry);
  const [personalFileError, setPersonalFileError] = useState<{ key: PersonalBroadcastRuleKey; message: string } | null>(null);
  const statusText = personalSnapshot.status === "playing"
    ? uiText("personalBroadcastPanel.PersonalBroadcastPanel.statusText")
    : personalSnapshot.status === "paused"
      ? uiText("personalBroadcastPanel.PersonalBroadcastPanel.statusText2")
      : personalSnapshot.status === "error"
        ? uiText("personalBroadcastPanel.PersonalBroadcastPanel.statusText3")
        : settings.personalBroadcast.enabled ? uiText("personalBroadcastPanel.PersonalBroadcastPanel.statusText4") : uiText("personalBroadcastPanel.PersonalBroadcastPanel.statusText5");
  const canControlPlayback = Boolean(personalSnapshot.current || personalSnapshot.pendingCount > 0);
  const playbackPaused = personalSnapshot.status === "paused";
  const currentPromptFile = personalSnapshot.current?.path.split(/[\\/]/).pop() ?? uiText("common.none");
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
      setPersonalFileError({ key, message: uiText("personalBroadcastPanel.PersonalBroadcastPanel.choosePersonalBroadcastFile.message", { label: label, value: error instanceof Error ? error.message : String(error) }) });
    }
  };

  const testPersonalBroadcastRule = (key: PersonalBroadcastRuleKey, label: string) => {
    if (!settings.personalBroadcast.rules[key].audioPath) {
      setPersonalFileError({ key, message: uiText("personalBroadcastPanel.PersonalBroadcastPanel.testPersonalBroadcastRule.message", { label: label }) });
      return;
    }
    setPersonalFileError(null);
    void personalBroadcastController.testRule(key).catch((error) => {
      setPersonalFileError({ key, message: uiText("personalBroadcastPanel.PersonalBroadcastPanel.testPersonalBroadcastRule.message2", { label: label, value: error instanceof Error ? error.message : String(error) }) });
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
              <h1 className="ui-type-section-title font-medium text-t1">{uiText("common.personalBroadcast")}</h1>
              <p className="mt-0.5 ui-type-meta text-t3">{uiText("personalBroadcastPanel.PersonalBroadcastPanel")}</p>
            </div>
            <div className="flex items-center gap-3">
              <PanelSwitch label={uiText("personalBroadcastPanel.label")} checked={settings.personalBroadcast.enabled} onChange={() => updatePersonalBroadcast({ enabled: !settings.personalBroadcast.enabled })} />
            </div>
          </header>

          <div className="voice-panel-scroll min-h-0 flex-1 overflow-y-auto">
            <section className={sectionClass}>
              <SectionToolbar iconName="runtime" title={uiText("personalBroadcastPanel.title")} actionsClassName="voice-runtime-actions" status={<RuntimeQueueStatus text={statusText} state={personalSnapshot.status} />}>
                <button type="button" aria-label={playbackPaused ? uiText("personalBroadcastPanel.aria_label") : uiText("personalBroadcastPanel.aria_label2")} className={controlClass} onClick={togglePlayback} disabled={!canControlPlayback}>{playbackPaused ? uiText("personalBroadcastPanel.PersonalBroadcastPanel2") : uiText("personalBroadcastPanel.PersonalBroadcastPanel3")}</button>
                <button type="button" className={controlClass} onClick={() => personalBroadcastController.skip()} disabled={!canControlPlayback}>{uiText("personalBroadcastPanel.PersonalBroadcastPanel4")}</button>
                <button type="button" className={controlClass} onClick={() => personalBroadcastController.clear()}>{uiText("personalBroadcastPanel.PersonalBroadcastPanel5")}</button>
              </SectionToolbar>
              {personalSnapshot.error && (
                <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 ui-type-meta text-danger">
                  <div>{personalSnapshot.error}</div>
                  <button type="button" className="mt-1 rounded border border-danger/40 px-2 py-0.5 text-danger hover:bg-danger/10" onClick={() => personalBroadcastController.clearError()}>{uiText("personalBroadcastPanel.PersonalBroadcastPanel6")}</button>
                </div>
              )}
              <RuntimeQueueSummary
                emptyText={uiText("personalBroadcastPanel.emptyText")}
                current={personalSnapshot.current ? currentPromptFile : null}
                pendingCount={pendingCount}
                discardedCount={personalSnapshot.discardedCount}
                failedCount={personalSnapshot.failedCount}
              />
            </section>

            <section className={sectionClass}>
              <SectionToolbar iconName="playbackRules" title={uiText("personalBroadcastPanel.title2")} actionsClassName="voice-personal-actions">
                <span className="ui-type-meta text-t3">{uiText("personalBroadcastPanel.PersonalBroadcastPanel7")}</span>
              </SectionToolbar>
              <div className="voice-setting-grid grid min-w-0 gap-x-6 gap-y-1">
                <SettingRow label={uiText("personalBroadcastPanel.label2")}>
                  <SettingsChoiceControl label={uiText("personalBroadcastPanel.label3")} options={personalBroadcastModeOptions} value={settings.personalBroadcast.mode} onChange={mode => updatePersonalBroadcast({ mode })} />
                </SettingRow>
                <SettingRow label={uiText("personalBroadcastPanel.label4")}>
                  <div className="flex items-center gap-2">
                    <input aria-label={uiText("personalBroadcastPanel.aria_label3")} className={`${controlClass} w-24 font-mono`} type="number" min={0} max={30} step={0.5} value={settings.personalBroadcast.promptIntervalSeconds} onChange={(event) => updatePersonalBroadcast({ promptIntervalSeconds: Number(event.target.value) })} />
                    <span className="ui-type-meta text-t3">{uiText("personalBroadcastPanel.PersonalBroadcastPanel8")}</span>
                  </div>
                </SettingRow>
                {settings.personalBroadcast.mode === "before-tts" && (
                  <SettingRow label={uiText("personalBroadcastPanel.label5")}>
                    <div className="flex items-center gap-2">
                      <input aria-label={uiText("personalBroadcastPanel.aria_label4")} className={`${controlClass} w-24 font-mono`} type="number" min={0} max={30} step={0.5} value={settings.personalBroadcast.promptToTtsIntervalSeconds} onChange={(event) => updatePersonalBroadcast({ promptToTtsIntervalSeconds: Number(event.target.value) })} />
                      <span className="ui-type-meta text-t3">{uiText("personalBroadcastPanel.PersonalBroadcastPanel8")}</span>
                    </div>
                  </SettingRow>
                )}
              </div>
            </section>

            <section className={sectionClass}>
              <SectionHeading iconName="audioFiles">{uiText("personalBroadcastPanel.PersonalBroadcastPanel9")}</SectionHeading>
              <div className="space-y-4">
                {PERSONAL_BROADCAST_RULE_GROUPS.map((group) => (
                  <div key={group.title} className="voice-personal-group">
                    <h3 className="voice-personal-group-title ui-type-control font-medium text-t2">{group.title}</h3>
                    <div className="voice-personal-rule-list">
                      {group.rules.map(({ key, label }) => {
                        const rule = settings.personalBroadcast.rules[key];
                        const fileName = rule.audioPath.split(/[\\/]/).pop() || uiText("personalBroadcastPanel.PersonalBroadcastPanel.fileName");
                        const ruleError = getPersonalBroadcastRuleError(key, personalSnapshot, personalFileError);
                        return (
                          <div key={key} className="voice-personal-rule-row">
                            <PanelSwitch label={uiText("personalBroadcastPanel.label6", { label: label })} checked={rule.enabled} onChange={() => updatePersonalBroadcastRule(key, { enabled: !rule.enabled })} />
                            <span className="voice-personal-rule-label ui-type-control font-medium text-t1">{label}</span>
                            <span className="voice-personal-rule-file ui-type-control text-t2" title={rule.audioPath || undefined}>{fileName}</span>
                            <div className="voice-personal-rule-actions">
                              <button type="button" aria-label={uiText("personalBroadcastPanel.aria_label5", { label: label })} className={controlClass} onClick={() => void choosePersonalBroadcastFile(key, label)}>{uiText("common.chooseFile")}</button>
                              <button type="button" aria-label={uiText("personalBroadcastPanel.aria_label6", { label: label })} className={`${controlClass} border-accent/50 text-accent-text`} onClick={() => testPersonalBroadcastRule(key, label)}>{uiText("personalBroadcastPanel.PersonalBroadcastPanel10")}</button>
                              <button type="button" aria-label={uiText("personalBroadcastPanel.aria_label7", { label: label })} className={`${controlClass} text-t3`} onClick={() => clearPersonalBroadcastRule(key)}>{uiText("personalBroadcastPanel.PersonalBroadcastPanel11")}</button>
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
              <button type="button" className={`${controlClass} border-danger/40 text-danger`} title={uiText("common.restoreDefaults")} aria-label={uiText("common.restoreDefaults")} onClick={reset}><RotateCcw size={16} aria-hidden="true" /></button>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
