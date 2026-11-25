import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("筛选清除入口复用高辨识度的强调色按钮样式", async () => {
  const styles = await read("src/components/actionButtonStyles.ts");
  const liveFilter = await read("src/components/LiveFilterBar.tsx");
  const shell = await read("src/components/ReviewFilterShell.tsx");
  const favorites = await read("src/components/ReviewFavoritesPanel.tsx");
  const results = await read("src/components/ReviewOwnerEventResults.tsx");
  const search = await read("src/components/ReviewSearchControls.tsx");

  assert.match(styles, /export const filterActionButtonClass/);
  assert.match(styles, /filterActionButtonClass = buttonVariants\(\{variant:"secondary"\}\)/);
  assert.match(await read("src/components/shadcn/button.tsx"), /secondary:[\s\S]*bg-secondary text-secondary-foreground/);
  assert.match(liveFilter, /compactFilterActionButtonClass/);
  assert.match(shell, /compactFilterActionButtonClass/);
  assert.match(favorites, /filterActionButtonClass/);
  assert.match(results, /compactFilterActionButtonClass/);
  assert.match(search, /compactFilterActionButtonClass/);
});

test("数据删除入口统一使用危险色样式，管理退出使用激活态样式", async () => {
  const styles = await read("src/components/actionButtonStyles.ts");
  const ownerList = await read("src/components/ReviewOwnerList.tsx");
  const favorites = await read("src/components/ReviewFavoritesPanel.tsx");
  const search = await read("src/components/ReviewSearchControls.tsx");

  assert.match(styles, /export const dangerActionButtonClass/);
  assert.match(styles, /dangerActionButtonClass = buttonVariants\(\{variant:"destructive-outline"\}\)/);
  assert.match(await read("src/components/shadcn/button.tsx"), /"destructive-outline": "border-destructive\/50 text-destructive/);
  assert.match(ownerList, /compactDangerActionButtonClass/);
  assert.match(favorites, /dangerActionButtonClass/);
  assert.match(search, /manageOpen \?[\s\S]*border-accent bg-accent-subtle text-accent/);
});

test("删除确认弹窗支持危险色确认按钮且删除调用方明确声明", async () => {
  const dialog = await read("src/components/ConfirmDialog.tsx");
  const archiveManagement = await read("src/components/ReviewArchiveManagement.tsx");
  const archiveSettings = await read("src/components/ReviewArchiveSettings.tsx");
  const panel = await read("src/components/ReviewPanel.tsx");
  const favorites = await read("src/components/ReviewFavoritesPanel.tsx");

  assert.match(dialog, /confirmTone\?: "accent" \| "danger"/);
  assert.match(dialog, /confirmTone === "danger"/);
  assert.match(archiveManagement, /confirmTone="danger"/);
  assert.match(archiveSettings, /confirmTone="danger"/);
  assert.match(panel, /confirmTone="danger"/);
  assert.equal((favorites.match(/confirmTone="danger"/g) ?? []).length, 3);
});

test("设置页清理按钮也使用危险操作样式", async () => {
  const css = await read("src/App.css");
  const settings = await read("src/components/ReviewArchiveSettings.tsx");

  assert.match(css, /\.settings-inline-button-danger/);
  assert.match(settings, /settings-inline-button-danger/);
});
