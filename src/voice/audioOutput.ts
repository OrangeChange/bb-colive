import { uiText } from "../i18n/index.ts";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { recordPlaybackStage } from "./ttsDiagnostics.ts";

export interface AudioOutputTarget {
  scope: "host" | "audience" | "both";
  monitorDeviceId?: string | null;
  streamDeviceId?: string | null;
}

export interface AudioOutputDevice {
  id: string;
  name: string;
  isDefault?: boolean;
}
let knownDevices: AudioOutputDevice[] = [];

export function resolveOutputTargets(target: AudioOutputTarget): string[] {
  const candidates = target.scope === "host"
    ? [target.monitorDeviceId]
    : target.scope === "audience"
      ? [target.streamDeviceId]
      : [target.monitorDeviceId, target.streamDeviceId];
  return [...new Set(candidates.filter((id): id is string => Boolean(id)))];
}

export async function listDevices(): Promise<AudioOutputDevice[]> {
  try {
    knownDevices = await invoke<AudioOutputDevice[]>("list_audio_output_devices");
    for (const device of knownDevices) recordPlaybackStage({ channel: "tts", action: "device-enumeration", outcome: "success", device: device.name, data: { isDefault: device.isDefault === true } });
    recordPlaybackStage({ channel: "tts", action: "device-enumeration", outcome: "success", data: { deviceCount: knownDevices.length } });
    return knownDevices;
  } catch (error) {
    recordPlaybackStage({ channel: "tts", action: "device-enumeration", outcome: "failure", data: { error: error instanceof Error ? error.name : "unknown" } });
    throw error;
  }
}
function deviceSummary(target: AudioOutputTarget): string { const ids = resolveOutputTargets(target); return ids.map((id) => knownDevices.find((device) => device.id === id)?.name ?? "unknown").join(",") || "default"; }

export async function selectLocalAudioFile(): Promise<string | null> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: uiText("audioOutput.path.filters.name"), extensions: ["mp3", "wav"] }],
  });
  return typeof path === "string" ? path : null;
}

export async function play(bytes: Uint8Array, target: AudioOutputTarget, playbackGain = 1): Promise<void> {
  recordPlaybackStage({ channel: "tts", action: "device", outcome: "success", device: deviceSummary(target), data: { scope: target.scope, followsDefault: resolveOutputTargets(target).length === 0 } });
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const unlisten = await listen("tts-audio-finished", () => resolveFinished());
  try {
    recordPlaybackStage({ channel: "tts", action: "play-start", outcome: "success", device: deviceSummary(target), data: { scope: target.scope, followsDefault: resolveOutputTargets(target).length === 0 } });
    await invoke("play_tts_audio", { audio: Array.from(bytes), target, playbackGain });
    await finished;
    recordPlaybackStage({ channel: "tts", action: "play-complete", outcome: "success", device: deviceSummary(target) });
  } catch (error) {
    recordPlaybackStage({ channel: "tts", action: "play-complete", outcome: "failure", device: deviceSummary(target), data: { error: error instanceof Error ? error.name : "unknown" } });
    throw error;
  } finally {
    unlisten();
  }
}

export async function pause(): Promise<void> {
  try { await invoke("pause_tts_audio"); recordPlaybackStage({ channel: "tts", action: "pause", outcome: "success" }); }
  catch (error) { recordPlaybackStage({ channel: "tts", action: "pause", outcome: "failure", data: { error: error instanceof Error ? error.name : "unknown" } }); throw error; }
}

export async function resume(): Promise<void> {
  try { await invoke("resume_tts_audio"); recordPlaybackStage({ channel: "tts", action: "resume", outcome: "success" }); }
  catch (error) { recordPlaybackStage({ channel: "tts", action: "resume", outcome: "failure", data: { error: error instanceof Error ? error.name : "unknown" } }); throw error; }
}

export async function skip(): Promise<void> {
  recordPlaybackStage({ channel: "tts", action: "cancel", outcome: "cancelled" });
  await invoke("skip_tts_audio");
}

export async function stop(): Promise<void> {
  await invoke("stop_tts_audio");
}

async function playLocalFileOnChannel(
  command: string,
  finishedEvent: string,
  path: string,
  target: AudioOutputTarget,
  playbackGain = 1,
  preparedAudio?: Uint8Array,
): Promise<void> {
  recordPlaybackStage({ channel: "personal", action: "device", outcome: "success", device: deviceSummary(target), data: { scope: target.scope, followsDefault: resolveOutputTargets(target).length === 0 } });
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const unlisten = await listen(finishedEvent, () => resolveFinished());
  try {
    recordPlaybackStage({ channel: "personal", action: "play-start", outcome: "success", device: deviceSummary(target), data: { scope: target.scope, followsDefault: resolveOutputTargets(target).length === 0 } });
    await invoke(command, {
      path,
      target,
      playbackGain,
      preparedAudio: preparedAudio ? Array.from(preparedAudio) : null,
    });
    await finished;
    recordPlaybackStage({ channel: "personal", action: "play-complete", outcome: "success", device: deviceSummary(target) });
  } catch (error) {
    recordPlaybackStage({ channel: "personal", action: "play-complete", outcome: "failure", device: deviceSummary(target), data: { error: error instanceof Error ? error.name : "unknown" } });
    throw error;
  } finally {
    unlisten();
  }
}

export function playLocalFile(
  path: string,
  target: AudioOutputTarget,
  playbackGain = 1,
  preparedAudio?: Uint8Array,
): Promise<void> {
  return playLocalFileOnChannel("play_personal_audio", "personal-audio-finished", path, target, playbackGain, preparedAudio);
}

export function playPreviewLocalFile(
  path: string,
  target: AudioOutputTarget,
  playbackGain = 1,
  preparedAudio?: Uint8Array,
): Promise<void> {
  return playLocalFileOnChannel("play_personal_preview_audio", "personal-preview-audio-finished", path, target, playbackGain, preparedAudio);
}

export async function prepareLocalFile(path: string): Promise<Uint8Array> {
  return Uint8Array.from(await invoke<number[]>("prepare_personal_audio", { path }));
}

export async function pausePersonal(): Promise<void> {
  await invoke("pause_personal_audio");
}

export async function resumePersonal(): Promise<void> {
  await invoke("resume_personal_audio");
}

export async function skipPersonal(): Promise<void> {
  await invoke("skip_personal_audio");
}

export async function skipPersonalPreview(): Promise<void> {
  await invoke("skip_personal_preview_audio");
}

export async function stopPersonal(): Promise<void> {
  await invoke("stop_personal_audio");
}
