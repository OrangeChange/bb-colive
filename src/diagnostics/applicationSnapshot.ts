import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, currentMonitor, availableMonitors } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { listAudioDevices } from "../voice/voiceRuntime.ts";
import { useVoiceSettings } from "../voice/voiceSettings";
import { useGeneralSettings } from "../generalSettings.ts";
import { useConnection } from "../stores/connection";
import { getLiveSession } from "../stores/liveSession";
import { getArchiveWriterStatus } from "../archive/archiveRuntime.ts";
import { ARCHIVE_SCHEMA_VERSION } from "../archive/archiveSchema.ts";
import { getArchiveDiagnosticSnapshot } from "../archive/archiveDiagnostics.ts";
import { getDiagnosticHealthSnapshot, sanitizeDiagnosticString } from "./diagnosticLogger";
import type { ArchiveRepositoryContract } from "../archive/archiveTypes.ts";
import type { SceneSettings } from "../components/sceneSettings";
import type { RevenueWindowSelection } from '../windows/giftWindowModel';

type DiagnosticEnvironmentSnapshot = {
  webview: string;
  webviewRuntimeVersion: string | null;
  webviewVersionSource: string;
};

type DiagnosticMonitor = Awaited<ReturnType<typeof currentMonitor>>;

function serializeDiagnosticMonitor(monitor: DiagnosticMonitor, index: number | null = null) {
  if (!monitor) return null;
  return {
    ...(index === null ? {} : { index }),
    position: { x: monitor.position.x, y: monitor.position.y },
    size: { width: monitor.size.width, height: monitor.size.height },
    workArea: {
      position: { x: monitor.workArea.position.x, y: monitor.workArea.position.y },
      size: { width: monitor.workArea.size.width, height: monitor.workArea.size.height },
    },
    scaleFactor: monitor.scaleFactor,
  };
}


export async function collectApplicationDiagnosticSnapshot({
  archiveRepository, sceneSettings, abnormalExit, windows,
}: {
  archiveRepository: ArchiveRepositoryContract | null;
  sceneSettings: SceneSettings;
  abnormalExit: boolean;
  windows: { displayOpen: boolean; displayLocked: boolean; giftOpen: boolean; giftLocked: boolean; revenueSelection?: RevenueWindowSelection; revenueWindows?: ReturnType<typeof import('../windows/giftBridge').getRevenueWindowDiagnostics>; workbenchExpanded: boolean };
}) {
  const { uiScale, eventFontSize, windowEventFontSize, eventDisplayPreferences, liveScrollDirection, mergeSameDanmu, sameDanmuWindowSeconds, showGiftWindowEffect, displayWindowFilters, windowAppearance, eventExpiry, stickyEvents, eventStyleSettings, startOnBoot, autoConnectOnStartup, reviewOpenCurrentOwner, reviewArchiveRetentionDays, reviewOwnerRetentionDays, reviewPinnedOwnerRoomIds } = useGeneralSettings.getState();
  const { displayOpen, displayLocked, giftOpen, giftLocked, workbenchExpanded } = windows;
    const voice = useVoiceSettings.getState();
    const mainWindow = getCurrentWindow();
    const [position, size, scaleFactor, maximized, appVersion, audioDevices, diagnosticEnvironment, activeMonitor, displayMonitors] = await Promise.all([
      mainWindow.outerPosition().catch(() => null),
      mainWindow.innerSize().catch(() => null),
      mainWindow.scaleFactor().catch(() => null),
      mainWindow.isMaximized().catch(() => false),
      getVersion().catch(() => "unknown"),
      listAudioDevices().catch(() => []),
      invoke<DiagnosticEnvironmentSnapshot>("get_diagnostic_environment").catch(() => ({
        webview: "unknown",
        webviewRuntimeVersion: null,
        webviewVersionSource: "unavailable",
      })),
      currentMonitor().catch(() => null),
      availableMonitors().catch(() => []),
    ]);
    const personalRules = Object.fromEntries(
      Object.entries(voice.personalBroadcast.rules).map(([key, rule]) => [key, {
        enabled: rule.enabled,
        hasAudio: Boolean(rule.audioPath),
      }]),
    );
    const connectionSnapshot = useConnection.getState();
    const currentRoomId = connectionSnapshot.state.roomId;
    const currentLiveSession = currentRoomId === undefined
      ? undefined
      : getLiveSession(connectionSnapshot.sessions, currentRoomId);
    const currentArchiveSession = currentLiveSession?.archive;
    const archiveHealth = archiveRepository
      ? await archiveRepository.getHealthSnapshot().catch((error) => ({
        available: false,
        schemaVersion: 0,
        ownerCount: 0,
        sourceCount: 0,
        sessionCount: 0,
        eventCount: 0,
        favoriteCount: 0,
        nicknameCount: 0,
        readingStateCount: 0,
        pageCount: 0,
        pageSize: 0,
        bytes: 0,
        error: error instanceof Error ? error.message : String(error),
      }))
      : {
        available: false,
        schemaVersion: 0,
        ownerCount: 0,
        sourceCount: 0,
        sessionCount: 0,
        eventCount: 0,
        favoriteCount: 0,
        nicknameCount: 0,
        readingStateCount: 0,
        pageCount: 0,
        pageSize: 0,
        bytes: 0,
        error: "archive repository unavailable",
      };
    const archiveDiagnostics = getArchiveDiagnosticSnapshot();
    const writerStatus = getArchiveWriterStatus();
    const archiveSnapshot = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      health: {
        ...archiveHealth,
        error: sanitizeDiagnosticString(archiveHealth.error) ?? null,
      },
      connection: {
        status: connectionSnapshot.state.status,
        roomId: currentRoomId ?? null,
        sessionId: currentArchiveSession?.sessionId ?? null,
      },
      owner: currentRoomId === undefined
        ? null
        : { ownerId: currentArchiveSession?.ownerId ?? `room:${currentRoomId}`, roomId: currentRoomId },
      session: currentArchiveSession
        ? {
          archiveId: currentArchiveSession.archiveId,
          sessionId: currentArchiveSession.sessionId,
          status: currentArchiveSession.status,
          quality: currentArchiveSession.quality,
          recordingStatus: currentArchiveSession.recordingStatus,
          stopReason: currentArchiveSession.stopReason ?? null,
          qualityReasons: currentArchiveSession.qualityReasons ?? [],
          qualityReason: currentArchiveSession.qualityReason,
          eventCount: currentArchiveSession.nextOrdinal,
        }
        : null,
      writer: {
        ...writerStatus,
        lastError: sanitizeDiagnosticString(writerStatus.lastError) ?? null,
      },
      source: archiveDiagnostics.source,
      projected: archiveDiagnostics.projected,
      render: archiveDiagnostics.render,
      actions: archiveDiagnostics.actions,
    };
    const reviewSnapshot = {
      ...archiveDiagnostics.review,
      sourceRawEventCount: archiveDiagnostics.source.rawEventCount,
      projectedCount: archiveDiagnostics.projected.count,
      renderCount: archiveDiagnostics.render.count,
      sampleRefs: archiveDiagnostics.review.sampleRefs,
    };
    const snapshot = {
      build: import.meta.env.DEV ? "development" : "production",
      buildId: __DANMU_BUILD_ID__,
      abnormalExit: abnormalExit,
      environment: {
        appVersion,
        buildId: __DANMU_BUILD_ID__,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        webview: diagnosticEnvironment.webview,
        webviewRuntimeVersion: diagnosticEnvironment.webviewRuntimeVersion,
        webviewVersionSource: diagnosticEnvironment.webviewVersionSource,
        scaleFactor,
        currentMonitor: serializeDiagnosticMonitor(activeMonitor),
        displayMonitors: displayMonitors.map((monitor, index) => serializeDiagnosticMonitor(monitor, index)),
        window: {
          position: position ? { x: position.x, y: position.y } : null,
          size: size ? { width: size.width, height: size.height } : null,
          maximized,
        },
        audioDevices: audioDevices.map((device) => ({
          name: device.name,
          isDefault: device.isDefault === true,
        })),
        live: {
          roomId: connectionSnapshot.state.roomId,
          displayOpen,
          displayLocked,
          giftOpen,
          giftLocked,
          revenueSelection: windows.revenueSelection,
          revenueWindows: windows.revenueWindows,
          workbenchExpanded,
        },
      },
      archive: archiveSnapshot,
      review: reviewSnapshot,
      diagnostics: {
        healthBeforeFlush: getDiagnosticHealthSnapshot(),
      },
      settings: {
        general: {
          uiScale,
          eventFontSize,
          windowEventFontSize,
          eventDisplayPreferences,
          liveScrollDirection,
          mergeSameDanmu,
          sameDanmuWindowSeconds,
          showGiftWindowEffect,
          displayWindowFilters,
          windowAppearance,
          eventExpiry,
          stickyEvents,
          eventStyleSettings,
          startOnBoot,
          autoConnectOnStartup,
          reviewOpenCurrentOwner,
          reviewArchiveRetentionDays,
          reviewOwnerRetentionDays,
          reviewPinnedOwnerRoomIds,
        },
        scene: sceneSettings,
        voice: {
          enabled: voice.enabled,
          engine: voice.engine,
          engineVoices: voice.engineVoices,
          speechRate: voice.speechRate,
          pitch: voice.pitch,
          playbackGain: voice.playbackGain,
          volume: voice.volume,
          eventIntervalSeconds: voice.eventIntervalSeconds,
          shortcutActions: voice.shortcutActions,
          personalBroadcast: {
            enabled: voice.personalBroadcast.enabled,
            mode: voice.personalBroadcast.mode,
            promptIntervalSeconds: voice.personalBroadcast.promptIntervalSeconds,
            promptToTtsIntervalSeconds: voice.personalBroadcast.promptToTtsIntervalSeconds,
            rules: personalRules,
          },
          speakUsername: voice.speakUsername,
          blockBigEmoteDanmu: voice.blockBigEmoteDanmu,
          blockLowPriceSuperChat: voice.blockLowPriceSuperChat,
          blockLowPriceGuard: voice.blockLowPriceGuard,
          outputScope: voice.outputScope,
          monitorDeviceSelected: Boolean(voice.monitorDeviceId),
          streamDeviceSelected: Boolean(voice.streamDeviceId),
          queueMode: voice.queueMode,
          queueLimit: voice.queueLimit,
          overflowPolicy: voice.overflowPolicy,
          expiryEnabled: voice.expiryEnabled,
          expirySeconds: voice.expirySeconds,
          eventEnabled: voice.eventEnabled,
          priorities: voice.priorities,
          customHttpPreset: voice.customHttp.preset,
          fishAudioFormat: voice.fishAudio.format,
          hasFishAudioReference: Boolean(voice.fishAudio.referenceId || voice.fishAudio.referenceVoices.length),
        },
      },
    };

  return snapshot;
}
