import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("双方输出选择同一设备时只产生一个播放目标", async () => {
  const { resolveOutputTargets } = await import("../src/voice/audioOutput.ts");
  assert.deepEqual(resolveOutputTargets({ scope: "both", monitorDeviceId: "a", streamDeviceId: "a" }), ["a"]);
});

test("仅主播和仅观众分别只使用对应设备", async () => {
  const { resolveOutputTargets } = await import("../src/voice/audioOutput.ts");
  assert.deepEqual(resolveOutputTargets({ scope: "host", monitorDeviceId: "host", streamDeviceId: "stream" }), ["host"]);
  assert.deepEqual(resolveOutputTargets({ scope: "audience", monitorDeviceId: "host", streamDeviceId: "stream" }), ["stream"]);
});

test("音频设备列表使用完整友好名称而不是重复的通用设备名", () => {
  const source = fs.readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  assert.match(source, /format_audio_device_name/);
  assert.match(source, /description\.driver\(\)/);
  assert.doesNotMatch(source, /description\(\)\.ok\(\)\?\.name\(\)\.to_string\(\)/);
});

test("统一音频输出接受播放增益并在 Rust 解码后应用增益保护", () => {
  const outputSource = fs.readFileSync(new URL("../src/voice/audioOutput.ts", import.meta.url), "utf8");
  const controllerSource = fs.readFileSync(new URL("../src/voice/voiceController.ts", import.meta.url), "utf8");
  const rustSource = fs.readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  assert.match(outputSource, /play\(bytes: Uint8Array, target: AudioOutputTarget, playbackGain/);
  assert.match(outputSource, /playbackGain/);
  assert.match(controllerSource, /audioOutput\.play\(audio, getOutputTarget\(settings\), settings\.playbackGain\)/);
  assert.match(rustSource, /playback_gain: f64/);
  assert.match(rustSource, /playback_gain\.clamp\(1\.0, 2\.0\)/);
  assert.match(rustSource, /\.amplify\(playback_gain\)/);
  assert.match(rustSource, /LimitSettings::broadcast\(\)/);
  assert.match(rustSource, /sample\.clamp\(-1\.0, 1\.0\)/);
});

test("个性播报拥有独立的本地文件播放通道", () => {
  const outputSource = fs.readFileSync(new URL("../src/voice/audioOutput.ts", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  const playbackStart = source.indexOf("fn start_audio_playback");
  const playbackEnd = source.indexOf("\n#[tauri::command]", playbackStart + 1);
  const playbackSource = source.slice(playbackStart, playbackEnd);
  assert.match(source, /fn play_personal_audio/);
  assert.match(source, /personal-audio-finished/);
  assert.match(outputSource, /playPreviewLocalFile/);
  assert.match(outputSource, /play_personal_preview_audio/);
  assert.match(source, /personal_preview: AudioPlaybackChannel/);
  assert.match(source, /fn play_personal_preview_audio/);
  assert.match(source, /personal-preview-audio-finished/);
  assert.match(playbackSource, /app\.emit\(finished_event, \(\)\)/);
  assert.match(source, /personal/);
});

test("本地提示音失败路径只写入 personal 通道，保留 TTS 通道", () => {
  const source = fs.readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  const personalStart = source.indexOf("fn load_personal_audio");
  const personalEnd = source.indexOf("\nfn pause_audio", personalStart);
  const personalSource = source.slice(personalStart, personalEnd);

  assert.match(personalSource, /本地音频文件路径不能为空/);
  assert.match(personalSource, /读取本地音频文件失败/);
  assert.match(personalSource, /解析本地音频文件失败/);
  assert.match(personalSource, /&state\.personal/);
  assert.doesNotMatch(personalSource, /&state\.tts/);
});

test("前置提示音先读取并解码文件，再进入播放与间隔阶段", () => {
  const source = fs.readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  const prepareStart = source.indexOf("fn prepare_personal_audio");
  const prepareEnd = source.indexOf("\n#[tauri::command]", prepareStart + 1);
  const prepareSource = source.slice(prepareStart, prepareEnd);
  const helperStart = source.indexOf("fn load_personal_audio");
  const helperEnd = source.indexOf("\n#[tauri::command]", helperStart);
  const helperSource = source.slice(helperStart, helperEnd);

  assert.ok(prepareStart >= 0, "必须提供 prepare_personal_audio 命令");
  assert.match(prepareSource, /load_personal_audio/);
  assert.match(prepareSource, /validate_personal_audio/);
  assert.match(helperSource, /std::fs::read/);
  assert.match(helperSource, /rodio::Decoder::try_from/);
  assert.match(source, /prepare_personal_audio,[\s\S]*play_personal_audio/);
});
