import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FavoriteOrganizationEditor } from "../../src/components/FavoriteOrganizationEditor.tsx";
import { ReviewFilterPresetMenu } from "../../src/components/ReviewSearchControls.tsx";

const report = {
  tags: [] as string[],
  saved: [] as string[],
  renamed: [] as string[],
  cancelled: 0,
};
Object.assign(window, { inputReport: report });
const tags: string[] = [];

function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button id="open" onClick={() => setOpen(true)}>
        编辑收藏
      </button>
      <ReviewFilterPresetMenu
        presets={[{ id: "one", name: "原预设", filters: {} } as never]}
        activePresetId={null}
        onApply={() => {}}
        onDelete={() => {}}
        onSave={(name) => report.saved.push(name)}
        onRename={(_, name) => report.renamed.push(name)}
      />
      {open && (
        <FavoriteOrganizationEditor
          initialNote=""
          initialTags={tags}
          tags={[]}
          onCreateTag={async (name) => {
            report.tags.push(name);
            return { tagId: name, name } as never;
          }}
          onSave={async () => {
            await new Promise<void>((resolve) =>
              Object.assign(window, { finishFavoriteSave: resolve }),
            );
            setOpen(false);
          }}
          onCancel={() => {
            report.cancelled++;
            setOpen(false);
          }}
        />
      )}
      <button id="outside">背景操作</button>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
