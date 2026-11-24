import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { obsServiceStatus, type ObsServiceStatus } from "./obsService.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { useGeneralSettings } from "../generalSettings.ts";
import { PanelSwitch } from "../components/voicePanelPrimitives.tsx";
import { SettingsIcon } from "../components/SettingsIcon";
import { RefreshCw, Play } from "lucide-react";
export function ObsServiceSettings({
  configurations = [],
  onNotice,
}: {
  onNotice?: (message:string)=>void;
  configurations?: import("./nativeObsConfigurations.ts").NativeObsConfiguration[];
}) {
  const showGiftEffect = useGeneralSettings(state => state.showObsGiftEffect);
  const setShowGiftEffect = useGeneralSettings(state => state.setShowObsGiftEffect);
  const showGuardEffect = useGeneralSettings(state => state.showObsGuardEffect);
  const setShowGuardEffect = useGeneralSettings(state => state.setShowObsGuardEffect);
  const [renderFailures, setRenderFailures] = useState<
    { clientId: string; configurationId?: string; message: string }[]
  >([]);
  const [status, setStatus] = useState<ObsServiceStatus>();
  const [port, setPort] = useState(17920);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = () => {
    setLoading(true); setError("");
    return obsServiceStatus().then((value) => {
      setStatus(value);
      setPort(value.port);
    }).catch(() => setError("无法查询本机服务，请重新查询。"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    void refresh();
    let active = true;
    let stop: (() => void) | undefined;
    void listen<
      { clientId: string; configurationId?: string; message: string }[]
    >("obs:render-failures", (event) => setRenderFailures(event.payload)).then(
      (unlisten) => {
        if (!active) {
          unlisten();
          return;
        }
        stop = unlisten;
        void emit("obs:render-failures-request");
      },
    );
    return () => {
      active = false;
      stop?.();
    };
  }, []);
  return (
    <div className="obs-service-settings">
      <div className="settings-task-heading obs-service-heading"><h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name="服务器" />本机服务</h3><span role="status" className="obs-service-status">
        {error ||
          status?.error ||
          (loading ? "正在查询本机服务…" : status?.running
            ? `本机服务已启动 · 端口 ${status.port}`
            : "本机服务未启动")}
      </span></div>
      {renderFailures.length > 0 && (
        <span role="status" className="theme-obs-unavailable">
          {renderFailures
            .map(
              (failure) =>
                configurations.find(
                  (configuration) =>
                    configuration.id === failure.configurationId,
                )?.name ?? "浏览器输出",
            )
            .join("、")}
          ：主题未更新，仍在使用旧版本。请刷新对应页面重试。
        </span>
      )}
      <div className="obs-service-port"><label>
        端口
        <input
          aria-label="OBS 服务端口"
          type="number"
          min="1"
          max="65535"
          value={port}
          disabled={loading || !status}
          onChange={(event) => setPort(Number(event.target.value))}
        />
      </label>
      <button type="button" disabled={loading || !status} onClick={() => setConfirm(true)}>
        修改端口
      </button></div>
      <div className="obs-service-effects">
        <span>OBS 礼物特效</span>
        <PanelSwitch label="OBS 礼物特效" checked={showGiftEffect} onChange={() => setShowGiftEffect(!showGiftEffect)} />
        <button type="button" className="obs-effect-reset" aria-label="恢复 OBS 礼物特效默认设置" onClick={() => setShowGiftEffect(false)} disabled={!showGiftEffect}>恢复默认</button>
      </div>
      <div className="obs-service-effects">
        <span>OBS 大航海特效</span>
        <PanelSwitch label="OBS 大航海特效" checked={showGuardEffect} onChange={() => setShowGuardEffect(!showGuardEffect)} />
        <button type="button" className="obs-effect-reset" aria-label="恢复 OBS 大航海特效默认设置" onClick={() => setShowGuardEffect(false)} disabled={!showGuardEffect}>恢复默认</button>
      </div>
      {!loading && !status && <button type="button" className="settings-action-button" onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true" />重新查询</button>}
      {!loading && status && !status.running && (
        <button
          type="button"
          onClick={() => {
            void invoke<ObsServiceStatus>("obs_start_service")
              .then(setStatus)
              .catch((cause) => setError(String(cause)));
          }}
        >
          <Play size={15} aria-hidden="true" />重试启动
        </button>
      )}
      {confirm && (
        <ConfirmDialog
          title="修改 OBS 服务端口"
          description="修改后所有已复制的 OBS 地址都需要更新，当前浏览器连接将断开。"
          confirmLabel="修改端口"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            try {
            const next = await invoke<ObsServiceStatus>(
              "obs_set_service_port",
              { port },
            );
            setStatus(next);
            setConfirm(false);
            setError(""); onNotice?.("端口已更新，请使用新地址");
            } catch (cause) {
              setError(`端口修改失败：${String(cause)}。请更换端口后重试。`);
            }
          }}
        />
      )}
    </div>
  );
}
