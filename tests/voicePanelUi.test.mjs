import { readUiSource } from "./helpers/readUiSource.mjs";
import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MsgType } from "../src/protocol/types.ts";
import { DEFAULT_PERSONAL_BROADCAST_SETTINGS } from "../src/voice/personalBroadcastTypes.ts";
import { getPersonalBroadcastPendingCount, getPersonalBroadcastRuleError, getVoicePanelPlaybackState } from "../src/components/personalBroadcastPanelModel.ts";

const read = (path) => readUiSource(new URL(`../${path}`, import.meta.url), "utf8");

test("主导航把语音放在回看下方且不删除现有快捷入口", () => {
  const source = read("src/components/Sidebar.tsx");
  assert.match(source, /title="回看/);
  assert.match(source, /mainView="voice"/);
  assert.match(source, /mainTitle=["']语音（TTS播报）["']/);
  assert.match(source, /IconChatWindow/);
  assert.match(source, /IconGiftBox/);
});

test("主页面通过可见性切换保留现场和语音组件挂载", () => {
  const source = readApplicationSources();
  assert.match(source, /MainView/);
  assert.match(source, /VoicePanel/);
  assert.match(source, /hidden=/);
});

test("现场和语音共用榜单上下文，隐藏语音面板时也不会在启动阶段崩溃", () => {
  const source = readApplicationSources();
  const providerStart = source.indexOf("<RoomInsightsProvider>");
  const scenePane = source.indexOf('hidden={mainView !== "scene"}');
  const voicePane = source.indexOf('hidden={mainView !== "voice"}');
  const providerEnd = source.indexOf("</RoomInsightsProvider>");
  assert.ok(providerStart >= 0 && providerStart < scenePane, "Provider 应包住现场面板");
  assert.ok(providerEnd > voicePane, "Provider 应包住语音面板及其连接条");
});

test("语音面板提供引擎、事件开关、队列和模板入口", () => {
  const source = read("src/components/VoicePanel.tsx");
  const summary = read("src/components/RuntimeQueueSummary.tsx");
  for (const label of ["Edge 在线", "Windows 系统", "恢复默认", "试听"]) {
    assert.match(source, new RegExp(label));
  }
  for (const label of ["待播", "已丢弃", "失败"]) assert.match(summary, new RegExp(label));
  assert.doesNotMatch(source, /右键.*设置/);
});

test("语音面板提供 Fish Audio、自定义 API 和接口预设配置", () => {
  const source = read("src/components/VoicePanel.tsx");
  const runtimeSource = read("src/voice/voiceRuntime.ts");
  const fishProviderSource = read("src/voice/fishAudioProvider.ts");
  const customProviderSource = read("src/voice/customHttpProvider.ts");
  const presetSource = read("src/voice/customHttpPresets.ts");
  for (const label of ["Fish Audio", "自定义 API", "接口预设", "API Key", "响应格式", "固定请求字段"]) {
    assert.match(source, new RegExp(label));
  }
  for (const label of ["OpenAI 兼容", "GPT-SoVITS", "自定义 JSON"]) {
    assert.match(presetSource, new RegExp(label));
  }
  assert.match(runtimeSource, /createFishAudioProvider/);
  assert.match(runtimeSource, /createCustomHttpProvider/);
  assert.match(fishProviderSource, /synthesize_fish_audio/);
  assert.match(customProviderSource, /synthesize_custom_http/);
  assert.match(source, /customHttp/);
  assert.match(source, /fishAudio/);
});

test("Fish Audio 只提供当前原生链路可播放的 MP3 和 WAV", () => {
  const source = read("src/components/VoicePanel.tsx");
  const optionsStart = source.indexOf("const FISH_AUDIO_FORMAT_OPTIONS");
  const optionsEnd = source.indexOf("const CUSTOM_HTTP_AUTH_OPTIONS", optionsStart);
  const options = source.slice(optionsStart, optionsEnd);

  assert.match(options, /value:\s*"mp3"/);
  assert.match(options, /value:\s*"wav"/);
  assert.doesNotMatch(options, /value:\s*"opus"/i);
});

test("自定义 API 的音色/参考音频只在专属配置区出现一次", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.equal((source.match(/aria-label=["']自定义 API 音色或参考音频["']/g) ?? []).length, 1);
});

test("Fish Audio 的 API Key 和参考音色 ID 提供官方直达入口", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /openUrl/);
  assert.match(source, /https:\/\/fish\.audio\/app\/api-keys\//);
  assert.match(source, /https:\/\/fish\.audio\/zh-CN\/app\/discovery\//);
  assert.match(source, /获取 API Key/);
  assert.match(source, /查找音色/);
});

test("Fish Audio 的参考音色 ID 只在专属配置区出现一次", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.equal((source.match(/aria-label=["']参考音色 ID["']/g) ?? []).length, 1);
});

test("Fish Audio 参考音色把输入和删除收进下拉交互", () => {
  const source = read("src/components/VoicePanel.tsx");
  for (const label of ["参考音色", "fish-reference-picker", "fish-reference-picker-popover", "删除预设", "lookupFishAudioModel", "referenceVoices"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /aria-expanded=\{isOpen\}/);
  assert.match(source, /onKeyDown=\{handleInputKeyDown\}/);
  assert.match(source, /fishAudio\.referenceVoices\.map/);
  assert.doesNotMatch(source, /查询并添加/);
  assert.doesNotMatch(source, /手动添加/);
  assert.doesNotMatch(source, /删除当前预设/);
  assert.doesNotMatch(source, /fish-reference-manager-row flex min-w-0 flex-wrap/);
});

test("Fish Audio 当前选中项不再显示重复的外层删除按钮", () => {
  const source = read("src/components/VoicePanel.tsx");
  const managerStart = source.indexOf("function FishReferenceVoiceManager");
  const managerEnd = source.indexOf("function VoiceTemplateComposer", managerStart);
  const manager = source.slice(managerStart, managerEnd);
  assert.match(manager, /删除预设 \$\{voice\.name\}/);
  assert.doesNotMatch(manager, /currentPreset && <button[\s\S]*删除预设 \$\{currentPreset\.name\}/);
});

test("Fish Audio 参考音色标签和选择器保持单行", () => {
  const source = read("src/components/VoicePanel.tsx");
  const css = read("src/App.css");
  assert.match(source, /<SettingRow label=["']参考音色["']>/);
  assert.doesNotMatch(source, /hint=["']Fish Audio 模型 ID["']/);
  assert.match(source, /fish-reference-picker-trigger/);
  assert.match(css, /\.fish-reference-picker-trigger[^{]*\{[\s\S]*display:\s*flex/);
});

test("Fish Audio 下拉提高内容宽度并提供显式识别按钮", () => {
  const source = read("src/components/VoicePanel.tsx");
  const css = read("src/App.css");
  assert.match(source, /fish-reference-picker-popover/);
  assert.match(source, />识别</);
  assert.match(source, /onClick=\{submitInput\}/);
  assert.match(css, /\.fish-reference-picker-popover[^{]*\{[\s\S]*width:\s*max\(100%,\s*min\(320px/);
});

test("Fish Audio 下拉点击外部区域会自动收起", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /pickerRef/);
  assert.match(source, /document\.addEventListener\("pointerdown"/);
  assert.match(source, /pickerRef\.current\?\.contains/);
  assert.match(source, /document\.removeEventListener\("pointerdown"/);
});

test("语音面板显示本机音色名称而不是内部注册表路径", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /activeVoice\?\.label/);
  assert.doesNotMatch(source, /<option value=\{settings\.voiceName\}>\{voiceNeedsSelection \? ["']需要选择音色["'] : settings\.voiceName\}<\/option>/);
});

test("语音面板提供大表情、低价事件屏蔽、播报间隔和滑杆数值显示", () => {
  const source = read("src/components/VoicePanel.tsx");
  const primitives = read("src/components/voicePanelPrimitives.tsx");
  for (const label of ["屏蔽大表情弹幕", "屏蔽低价醒目留言", "屏蔽低价大航海", "播报间隔", "语速", "音调", "音量", "播放增益", "多语言音色"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /eventIntervalSeconds/);
  assert.match(source, /speechRate/);
  assert.match(primitives, /<output/);
});

test("播放增益独立于引擎音量并提供 100 到 200% 的调节范围", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /label=["']播放增益["']/);
  assert.match(source, /settings\.playbackGain/);
  assert.match(source, /min=\{1\} max=\{2\} step=\{0\.05\}/);
  assert.match(source, /Math\.round\(settings\.playbackGain \* 100\)/);
});

test("切换语音引擎或音色不会关闭语音开关，并保留接收状态", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /voiceController\.reset\(\)/);
  assert.doesNotMatch(source, /setVoiceSettings\(\{ engine, enabled: false \}\)/);
  assert.doesNotMatch(source, /setVoiceSettings\(\{ voiceName: event\.target\.value, enabled: false \}\)/);
});

test("Windows 系统语音优先从本机枚举结果中选择 Huihui", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /DEFAULT_WINDOWS_VOICE = "Huihui"/);
  assert.match(source, /value:\s*"windows-system"/);
  assert.match(source, /voice\.name.*voice\.label/);
  assert.match(source, /toLowerCase\(\)\.includes\(DEFAULT_WINDOWS_VOICE\.toLowerCase\(\)\)/);
});

test("语音引擎控件使用统一的标签列、可伸缩控制区和整宽音色下拉", () => {
  const source = read("src/components/VoicePanel.tsx");
  const primitives = read("src/components/voicePanelPrimitives.tsx");
  assert.match(primitives, /voice-setting-row/);
  assert.match(primitives, /voice-setting-control/);
  assert.match(source, /<UiSelect ariaLabel=["']语音引擎["']/);
  assert.doesNotMatch(source, /voice-engine-segmented/);
  assert.match(source, /className=\{selectClass\}/);
  assert.match(source, /min-w-0 flex-1/);
});

test("语音面板按引擎和自定义 API 预设读取隔离的音色值", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /engineVoices/);
  assert.match(source, /customHttp\.voiceValues/);
  assert.match(source, /const customVoiceName/);
  assert.doesNotMatch(source, /value=\{settings\.voiceName\}/);
});

test("每个播报模板都有调用当前引擎和音色的独立试听入口", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /voice-template-audition/);
  assert.match(source, /试听当前模板/);
  assert.match(source, /renderVoiceEventTemplate/);
  assert.match(source, /voiceController\.test\(rendered\.text\)/);
});

test("语音面板拆分九类事件并提供模板模块排序交互", () => {
  const source = read("src/components/VoicePanel.tsx");
  for (const label of ["弹幕", "互动", "礼物", "盲盒", "红包", "天选", "醒目留言", "大航海", "系统消息"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /voice-engine-settings/);
  assert.match(source, /voice-setting-grid/);
  assert.match(source, /draggable/);
  assert.match(source, /voice-template-drag-handle/);
  assert.match(source, /删除动态字段/);
});

test("自定义 API 使用接口预设和折叠的高级请求设置", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /接口预设/);
  assert.match(source, /openai-compatible/);
  assert.match(source, /gpt-sovits/);
  assert.match(source, /index-tts/);
  assert.ok(source.indexOf('value: "gpt-sovits"') < source.indexOf('value: "index-tts"'));
  assert.ok(source.indexOf('value: "index-tts"') < source.indexOf('value: "custom-json"'));
  assert.match(source, /高级请求设置/);
  assert.doesNotMatch(source, /套用 GPT-SoVITS 预设/);
});

test("语音模板面板拆分互动六类和红包天选开始结果", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /INTERACT_KIND_OPTIONS/);
  assert.match(source, /CATEGORY_LABELS\[currentTemplateCategory\]\}开始/);
  assert.match(source, /CATEGORY_LABELS\[currentTemplateCategory\]\}结果/);
  assert.match(source, /开通时长/);
  assert.match(source, /陪伴天数/);
  assert.match(source, /if \(category === "interact"\) return \["username"\]/);
});

test("红包和天选结果不再显示冗余的可自定义说明", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.doesNotMatch(source, /结果默认文案，可自定义/);
});

test("语音设置网格根据面板容器宽度切换，而不是根据视口断点切换", () => {
  const source = read("src/components/VoicePanel.tsx");
  const css = read("src/App.css");
  assert.match(source, /voice-setting-grid/);
  assert.doesNotMatch(source, /md:grid-cols-2/);
  assert.match(css, /\.voice-panel-frame\s*\{[\s\S]*container-type:\s*inline-size/);
  assert.match(css, /@container\s+voice-panel\s+\(min-width:\s*640px\)/);
  assert.match(css, /@container\s+voice-panel\s+\(max-width:\s*360px\)/);
});

test("语音设置标签与控件保持单行并在空间不足时省略", () => {
  const source = read("src/components/VoicePanel.tsx");
  const primitives = read("src/components/voicePanelPrimitives.tsx");
  const css = read("src/App.css");
  assert.match(primitives, /voice-setting-label/);
  assert.match(primitives, /voice-select-control/);
  assert.match(css, /\.voice-setting-label[^\{]*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(css, /\.voice-setting-label[^\{]*\{[\s\S]*text-overflow:\s*ellipsis/);
  assert.match(css, /\.voice-select-control[^\{]*\{[\s\S]*text-overflow:\s*ellipsis/);
});

test("语音区标题与操作按钮使用独立的稳定工具栏", () => {
  const source = read("src/components/VoicePanel.tsx");
  const primitives = read("src/components/voicePanelPrimitives.tsx");
  const css = read("src/App.css");
  assert.match(primitives, /voice-section-toolbar/);
  assert.match(primitives, /voice-section-actions/);
  assert.match(css, /\.voice-section-toolbar[^\{]*\{[\s\S]*grid-template-columns/);
  assert.match(css, /\.voice-section-actions[^\{]*\{[\s\S]*flex-wrap:\s*nowrap/);
});

test("语音运行区合并播放切换按钮，试听集中在声音参数后的独立区域", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /const togglePlayback/);
  assert.match(source, /playbackPaused \? ["']继续["'] : ["']暂停["']/);
  assert.match(source, /onClick=\{togglePlayback\}/);
  assert.match(source, /<VoiceTestPanel[^>]*onTest=\{text => voiceController\.test\(text\)\}/);
  assert.match(source, /voice-runtime-actions/);
  assert.doesNotMatch(source, /onClick=\{\(\) => voiceController\.pause\(\)\}/);
  assert.doesNotMatch(source, /onClick=\{\(\) => voiceController\.resume\(\)\}/);
});

test("before-tts 只有提示音时仍可使用运行区暂停和跳过", () => {
  const source = read("src/components/VoicePanel.tsx");

  assert.match(source, /getVoicePanelPlaybackState\(/);
  assert.match(source, /canControlPlayback/);
  assert.match(source, /disabled=\{!canControlPlayback\}/);
  assert.equal(
    getVoicePanelPlaybackState(
      { current: null, pendingCount: 0, status: "idle" },
      { current: { id: "prompt" }, pendingCount: 0, status: "playing" },
      "before-tts",
    ).canControlPlayback,
    true,
  );
});

test("暂停跳过当前项后，TTS 或串行提示音仍有 pending 时运行区保持可控制", () => {
  const source = read("src/components/VoicePanel.tsx");

  assert.match(source, /getVoicePanelPlaybackState\(/);
  assert.match(source, /disabled=\{!canControlPlayback\}/);

  const voice = (overrides = {}) => ({ current: null, pendingCount: 0, status: "idle", ...overrides });
  const personal = (overrides = {}) => ({ current: null, pendingCount: 0, status: "idle", ...overrides });

  assert.deepEqual(
    getVoicePanelPlaybackState(voice({ pendingCount: 1, status: "paused" }), personal(), "independent"),
    { serialPersonalActive: false, canControlPlayback: true, playbackPaused: true },
  );
  assert.deepEqual(
    getVoicePanelPlaybackState(voice(), personal({ pendingCount: 1, status: "paused" }), "before-tts"),
    { serialPersonalActive: true, canControlPlayback: true, playbackPaused: true },
  );
  assert.deepEqual(
    getVoicePanelPlaybackState(voice(), personal({ pendingCount: 1, status: "playing" }), "independent"),
    { serialPersonalActive: false, canControlPlayback: false, playbackPaused: false },
  );
  assert.deepEqual(
    getVoicePanelPlaybackState(voice(), personal(), "before-tts"),
    { serialPersonalActive: false, canControlPlayback: false, playbackPaused: false },
  );
});

test("设备与队列下拉使用完整宽度和单行布局", () => {
  const source = read("src/components/VoicePanel.tsx");
  const primitives = read("src/components/voicePanelPrimitives.tsx");
  assert.match(primitives, /voice-select-control/);
  assert.match(source, /whitespace-nowrap/);
  assert.doesNotMatch(source, /max-w-56/);
});

test("语音面板提供字段级发音修正规则编辑，不要求用户输入正则", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /VoicePronunciationEditor/);
  assert.match(source, /发音修正/);
  assert.match(source, /原词/);
  assert.match(source, /读作/);
  assert.match(source, /添加发音修正/);
  assert.match(source, /删除发音修正规则/);
  assert.doesNotMatch(source, /正则表达式/);
});

test("发音修正规则在固定高度的内部列表中滚动，不撑长整个设置页", () => {
  const source = read("src/components/VoicePanel.tsx");
  const css = read("src/App.css");
  assert.match(source, /voice-pronunciation-list/);
  assert.match(css, /\.voice-pronunciation-list\s*\{[\s\S]*max-height:\s*224px/);
  assert.match(css, /\.voice-pronunciation-list\s*\{[\s\S]*overflow-y:\s*auto/);
});

test("模板编辑器让动态字段模块支持鼠标拖动", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /draggable=\{true\}/);
  assert.match(source, /onDragStart=\{\(event\) =>/);
  assert.match(source, /aria-grabbed=/);
});

test("模板中的文字片段保留可编辑输入但不显示冗余占位词", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /voice-template-text-slot/);
  assert.match(source, /title=["']输入固定文字["']/);
  assert.match(source, /style=\{\{ width: segment\.value \?/);
  assert.match(source, /Math\.max\(1, segment\.value\.length\)/);
  assert.match(source, /calc\(\$\{Math\.min\(32,/);
  assert.doesNotMatch(source, /<input\b[^>]*\bsize=\{/);
  assert.doesNotMatch(source, /placeholder=["']输入文字["']/);
  assert.match(source, /segment\.value/);
});

test("模板编辑器使用连续文字流、模块拖动区和模块删除按钮", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.match(source, /ensureTemplateTextGaps/);
  assert.match(source, /voice-template-drag-handle/);
  assert.match(source, /删除动态字段/);
  assert.match(source, /onDrop=\{\(event\) =>/);
  assert.doesNotMatch(source, /\+自由文字/);
});

test("个性播报面板提供总开关、两种模式和所有事件文件控件", () => {
  const source = readUiSource(new URL("../src/components/PersonalBroadcastPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /个性播报/);
  assert.match(source, /提示音间隔/);
  assert.match(source, /提示音与 TTS 间隔/);
  assert.match(source, /选择文件/);
  assert.match(source, /大航海进房/);
  assert.match(source, /guard-captain/);
  assert.match(source, /system-cut-off/);
  assert.doesNotMatch(source, /个性播报.*弹幕分类/);
});

test("个性播报面板每行显示事件名称并保留按事件命名的开关标签", () => {
  const source = read("src/components/PersonalBroadcastPanel.tsx");
  const rowStart = source.indexOf('<div key={key} className="voice-personal-rule-row">');
  const rowEnd = source.indexOf("</div>", rowStart);
  const row = source.slice(rowStart, rowEnd);

  assert.match(row, /voice-personal-rule-label/);
  assert.match(row, />\{label\}</);
  assert.match(row, /label=\{`启用\$\{label\}提示音`\}/);
});

test("个性播报面板把运行时文件错误定位到规则行，并提示先选择支持的文件", () => {
  const source = read("src/components/PersonalBroadcastPanel.tsx");
  assert.match(source, /personalSnapshot\.failedRuleKey === key/);
  assert.match(source, /请先选择 MP3\/WAV 文件/);
  assert.match(source, /voice-personal-rule-error/);
});

test("模拟个性播报规则行渲染时，文件不可用只显示在对应规则行", () => {
  const snapshot = { failedRuleKey: "super-chat", error: "读取本地音频文件失败" };
  const rows = ["super-chat", "gift"].map((key) => ({ key, error: getPersonalBroadcastRuleError(key, snapshot, null) }));

  assert.equal(rows.find((row) => row.key === "super-chat").error, "文件不可用：读取本地音频文件失败");
  assert.equal(rows.find((row) => row.key === "gift").error, null);
  assert.equal(getPersonalBroadcastRuleError("gift", snapshot, { key: "gift", message: "礼物文件不可用" }), "礼物文件不可用");
});

test("语音面板不再拥有个性播报或声音输出可见区", () => {
  const source = read("src/components/VoicePanel.tsx");
  assert.doesNotMatch(source, /<SectionToolbar title=["']个性播报["']/);
  assert.doesNotMatch(source, /<SectionHeading>声音输出<\/SectionHeading>/);
});

test("TTS 联动模式把已配置提示音的待处理语音事件计入个性播报待播", () => {
  const personalSettings = {
    ...DEFAULT_PERSONAL_BROADCAST_SETTINGS,
    enabled: true,
    mode: "before-tts",
    rules: {
      ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules,
      "super-chat": { enabled: true, audioPath: "sc.wav" },
      "interact-entry": { enabled: true, audioPath: "entry.wav" },
      gift: { enabled: false, audioPath: "gift.wav" },
    },
  };
  const voiceSnapshot = {
    pending: [
      { event: { msgType: MsgType.SuperChat, sc: { price: 30, message: "测试" } } },
      { event: { msgType: MsgType.Interact, interactKind: "entry", user: { guardLevel: 0 } } },
      { event: { msgType: MsgType.Gift, gift: { name: "礼物", priceRmb: 10 } } },
    ],
  };

  assert.equal(getPersonalBroadcastPendingCount(voiceSnapshot, personalSettings, false), 2);
  assert.equal(getPersonalBroadcastPendingCount(voiceSnapshot, { ...personalSettings, mode: "independent" }, false), 0);
});
