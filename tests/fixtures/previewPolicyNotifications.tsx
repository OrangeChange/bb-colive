import { createRoot } from "react-dom/client";
import { useStylePreviewPolicy } from "../../src/preview/useStylePreviewPolicy.ts";
import {
  createDefaultSceneSettings,
  saveSceneSettings,
  SCENE_SETTINGS_KEY,
} from "../../src/components/sceneSettings.ts";

function Policy() {
  const policy = useStylePreviewPolicy();
  return <output>{policy.giftThreshold}</output>;
}
const report = { reads: 0 };
const original = Storage.prototype.getItem;
Storage.prototype.getItem = function (key) {
  if (key === SCENE_SETTINGS_KEY) report.reads++;
  return original.call(this, key);
};
Object.assign(window, {
  policyReport: report,
  changeScene: (amount: number) =>
    saveSceneSettings({
      ...createDefaultSceneSettings(),
      giftThreshold: amount,
    }),
  changeOtherWindow: (amount: number) => {
    localStorage.setItem(
      SCENE_SETTINGS_KEY,
      JSON.stringify({
        ...createDefaultSceneSettings(),
        giftThreshold: amount,
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SCENE_SETTINGS_KEY,
        storageArea: localStorage,
      }),
    );
  },
});
const root = createRoot(document.getElementById("root")!);
Object.assign(window, { unmountPolicy: () => root.unmount() });
root.render(<Policy />);
