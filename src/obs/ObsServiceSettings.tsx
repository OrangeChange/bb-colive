import { uiText } from "../i18n/index.ts";
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
    }).catch(() => setError(uiText("obsServiceSettings.ObsServiceSettings.refresh")))
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
      <div className="settings-task-heading obs-service-heading"><h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name={uiText("obsServiceSettings.name")} />{uiText("obsServiceSettings.ObsServiceSettings")}</h3><span role="status" className="obs-service-status">
        {error ||
          status?.error ||
          (loading ? uiText("obsServiceSettings.ObsServiceSettings2") : status?.running
            ? uiText("obsServiceSettings.ObsServiceSettings3", { port: status.port })
            : uiText("obsServiceSettings.ObsServiceSettings4"))}
      </span></div>
      {renderFailures.length > 0 && (
        <span role="status" className="theme-obs-unavailable">
          {renderFailures
            .map(
              (failure) =>
                configurations.find(
                  (configuration) =>
                    configuration.id === failure.configurationId,
                )?.name ?? uiText("obsServiceSettings.ObsServiceSettings5"),
            )
            .join("、")}
          {uiText("obsServiceSettings.ObsServiceSettings6")}</span>
      )}
      <div className="obs-service-port"><label>
        {uiText("obsServiceSettings.ObsServiceSettings7")}<input
          aria-label={uiText("obsServiceSettings.aria_label")}
          type="number"
          min="1"
          max="65535"
          value={port}
          disabled={loading || !status}
          onChange={(event) => setPort(Number(event.target.value))}
        />
      </label>
      <button type="button" disabled={loading || !status} onClick={() => setConfirm(true)}>
        {uiText("obsServiceSettings.ObsServiceSettings8")}</button></div>
      <div className="obs-service-effects">
        <span>{uiText("obsServiceSettings.ObsServiceSettings9")}</span>
        <PanelSwitch label={uiText("obsServiceSettings.label")} checked={showGiftEffect} onChange={() => setShowGiftEffect(!showGiftEffect)} />
        <button type="button" className="obs-effect-reset" aria-label={uiText("obsServiceSettings.aria_label2")} onClick={() => setShowGiftEffect(false)} disabled={!showGiftEffect}>{uiText("common.restoreDefaults")}</button>
      </div>
      <div className="obs-service-effects">
        <span>{uiText("obsServiceSettings.ObsServiceSettings10")}</span>
        <PanelSwitch label={uiText("obsServiceSettings.label2")} checked={showGuardEffect} onChange={() => setShowGuardEffect(!showGuardEffect)} />
        <button type="button" className="obs-effect-reset" aria-label={uiText("obsServiceSettings.aria_label3")} onClick={() => setShowGuardEffect(false)} disabled={!showGuardEffect}>{uiText("common.restoreDefaults")}</button>
      </div>
      {!loading && !status && <button type="button" className="settings-action-button" onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true" />{uiText("obsServiceSettings.ObsServiceSettings11")}</button>}
      {!loading && status && !status.running && (
        <button
          type="button"
          onClick={() => {
            void invoke<ObsServiceStatus>("obs_start_service")
              .then(setStatus)
              .catch((cause) => setError(String(cause)));
          }}
        >
          <Play size={15} aria-hidden="true" />{uiText("obsServiceSettings.ObsServiceSettings12")}</button>
      )}
      {confirm && (
        <ConfirmDialog
          title={uiText("obsServiceSettings.title")}
          description={uiText("obsServiceSettings.description")}
          confirmLabel={uiText("obsServiceSettings.confirmLabel")}
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            try {
            const next = await invoke<ObsServiceStatus>(
              "obs_set_service_port",
              { port },
            );
            setStatus(next);
            setConfirm(false);
            setError(""); onNotice?.(uiText("obsServiceSettings.onConfirm"));
            } catch (cause) {
              setError(uiText("obsServiceSettings.onConfirm2", { value: String(cause) }));
            }
          }}
        />
      )}
    </div>
  );
}
