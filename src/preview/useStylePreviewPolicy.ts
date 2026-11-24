import { useConnection } from "../stores/connection.ts";
import { useEffect, useMemo, useState } from "react";
import { useGeneralSettings } from "../generalSettings.ts";
import { loadSceneSettings, SCENE_SETTINGS_KEY, SCENE_SETTINGS_CHANGED } from "../components/sceneSettings.ts";
import type { StylePreviewPolicySettings } from "./stylePreviewPolicy.ts";

/** 仅编辑器发布端读取软件设置；外置页面消费快照。 */
export function useStylePreviewPolicy(): StylePreviewPolicySettings {
  const targetRoomId = useConnection(state => state.state.roomId);
  const displayPreferences = useGeneralSettings(state => state.eventDisplayPreferences);
  const stickySettings = useGeneralSettings(state => state.stickyEvents);
  const mergeSameDanmu = useGeneralSettings(state => state.mergeSameDanmu);
  const sameDanmuWindowSeconds = useGeneralSettings(state => state.sameDanmuWindowSeconds);
  const capacity = useGeneralSettings(state => state.eventWindowCapacity);
  const expiry = useGeneralSettings(state => state.eventExpiry);
  const windowFilters = useGeneralSettings(state => state.displayWindowFilters);
  const [scene, setScene] = useState(loadSceneSettings);
  useEffect(() => {
    const refresh = () => setScene(loadSceneSettings());
    const storageChanged = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === SCENE_SETTINGS_KEY || event.key === null)) refresh();
    };
    window.addEventListener(SCENE_SETTINGS_CHANGED, refresh);
    window.addEventListener("storage", storageChanged);
    refresh();
    return () => {
      window.removeEventListener(SCENE_SETTINGS_CHANGED, refresh);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);
  return useMemo(() => ({ mergeSameDanmu, sameDanmuWindowSeconds, targetRoomId, displayPreferences, stickySettings, capacity, expiry, windowFilters,
    filters: scene.filters, giftThreshold: scene.giftThreshold, giftThresholdMode: scene.giftThresholdMode,
    audienceFilters: scene.audienceFilters,
  }), [mergeSameDanmu, sameDanmuWindowSeconds, targetRoomId, displayPreferences, stickySettings, capacity, expiry, windowFilters, scene]);
}
