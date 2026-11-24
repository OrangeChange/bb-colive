import test from "node:test";
import assert from "node:assert/strict";

async function loadLayout() {
  try {
    return await import("../src/components/sceneLayout.ts");
  } catch {
    return null;
  }
}

test("分区模式按业务顺序把弹幕互动放左侧、收益事件放右侧", async () => {
  const layout = await loadLayout();
  assert.ok(layout, "sceneLayout 应提供分区布局逻辑");

  assert.deepEqual(
    layout.getPartitionColumns(["danmu", "interact", "gift", "superChat", "guard"]),
    {
      left: ["danmu", "interact"],
      right: ["gift", "superChat", "guard"],
    },
  );
});

test("多区左侧75/25比例及手动调整正确生成行高，单区占满", async () => {
  const layout = await loadLayout();
  assert.equal(layout.buildRowsTemplate(2, [0.75]), 'minmax(0, 0.75fr) 4px minmax(0, 0.25fr)');
  assert.equal(layout.buildRowsTemplate(2, [0.8]), 'minmax(0, 0.8fr) 4px minmax(0, 0.2fr)');
  assert.equal(layout.buildRowsTemplate(1, [0.75]), 'minmax(0, 1fr)');
});

test("关闭分区后从布局结果中移除，不留下空占位", async () => {
  const layout = await loadLayout();
  assert.ok(layout, "sceneLayout 应提供分区布局逻辑");

  assert.deepEqual(
    layout.getPartitionColumns(["danmu", "gift", "guard"]),
    {
      left: ["danmu"],
      right: ["gift", "guard"],
    },
  );
  assert.equal(layout.buildRowsTemplate(1, []), "minmax(0, 1fr)");
  assert.equal(
    layout.buildRowsTemplate(3, [0.34, 0.67]),
    "minmax(0, 0.34fr) 4px minmax(0, 0.33fr) 4px minmax(0, 0.33fr)",
  );
});
