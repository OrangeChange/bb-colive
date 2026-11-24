import assert from "node:assert/strict";
import test from "node:test";

import { commitObsConfiguration, commitThemePublication, commitThemeRemoval, deleteObsConfiguration, ObsConfigurationDeleteError, ThemeOutputRollbackError, ThemePublicationError, ThemeRemovalError, themeSaveErrorMessage } from "../src/themes/themeWorkspaceTransactions.ts";

test("OBS 发布失败时恢复已有配置", async () => {
  const saved = [];
  const previous = { id: "obs-1", themeId: "old" };
  const next = { id: "obs-1", themeId: "new" };
  await assert.rejects(() => commitObsConfiguration({ previous, next,
    save: async value => saved.push(value), remove: async () => assert.fail("不应删除已有配置"),
    publish: async () => { throw new Error("发布失败"); },
  }), /发布失败/);
  assert.deepEqual(saved, [next, previous]);
});

test("OBS 发布失败时移除新建配置", async () => {
  const removed = [];
  const next = { id: "obs-new", themeId: "new" };
  await assert.rejects(() => commitObsConfiguration({ previous: undefined, next,
    save: async () => {}, remove: async id => removed.push(id),
    publish: async () => { throw new Error("发布失败"); },
  }), /发布失败/);
  assert.deepEqual(removed, ["obs-new"]);
});

test("主题保存保留可操作的目录权限错误", () => {
  assert.equal(themeSaveErrorMessage(new Error("无法写入程序目录中的 style 文件夹，请将程序移到可写位置"), "主题保存失败"), "无法写入程序目录中的 style 文件夹，请将程序移到可写位置");
  assert.equal(themeSaveErrorMessage(new Error("未知错误"), "主题保存失败"), "主题保存失败");
});

test("删除 OBS 配置先清理已发布目标，再删除配置", async () => {
  const calls = [];
  await deleteObsConfiguration({
    cleanupPublished: async () => { calls.push("cleanup"); return async () => calls.push("restore"); },
    removeConfiguration: async () => calls.push("remove-config"),
  });
  assert.deepEqual(calls, ["cleanup", "remove-config"]);
});

test("删除 OBS 配置失败时恢复已发布目标，不留下半状态", async () => {
  const calls = [];
  await assert.rejects(() => deleteObsConfiguration({
    cleanupPublished: async () => { calls.push("cleanup"); return async () => calls.push("restore"); },
    removeConfiguration: async () => { calls.push("remove-config"); throw new Error("写入失败"); },
  }), error => error instanceof ObsConfigurationDeleteError && error.restored === true);
  assert.deepEqual(calls, ["cleanup", "remove-config", "restore"]);
});

test("删除和恢复均失败时返回可识别的未恢复状态", async () => {
  await assert.rejects(() => deleteObsConfiguration({
    cleanupPublished: async () => async () => { throw new Error("恢复失败"); },
    removeConfiguration: async () => { throw new Error("删除失败"); },
  }), error => error instanceof ObsConfigurationDeleteError && error.restored === false && /恢复失败/.test(error.message));
});

test("清理阶段部分删除且恢复失败时事务层保留未恢复状态", async () => {
  await assert.rejects(() => deleteObsConfiguration({
    cleanupPublished: async () => { const error = new Error("快照删除失败；运行时恢复失败"); error.restored = false; throw error; },
    removeConfiguration: async () => assert.fail("清理失败后不应删除配置"),
  }), error => error instanceof ObsConfigurationDeleteError && error.restored === false && /运行时恢复失败/.test(error.message));
});

test("主题解绑回滚会尝试恢复快照、绑定和输出并报告未完整恢复", async () => {
  const calls = [];
  await assert.rejects(() => commitThemeRemoval({
    removeSnapshot: async () => calls.push("remove-snapshot"),
    removeBinding: async () => calls.push("remove-binding"),
    removeOutput: async () => { calls.push("remove-output"); throw new Error("发布失败"); },
    restoreSnapshot: async () => { calls.push("restore-snapshot"); throw new Error("快照恢复失败"); },
    restoreBinding: async () => calls.push("restore-binding"),
    restoreOutput: async () => calls.push("restore-output"),
  }), error => error instanceof ThemeRemovalError && error.restored === false);
  assert.deepEqual(calls, [
    "remove-snapshot", "remove-binding", "remove-output",
    "restore-snapshot", "restore-binding", "restore-output",
  ]);
});

test("主题发布回滚逐项执行并返回每项恢复状态", async () => {
  const calls = [];
  await assert.rejects(() => commitThemePublication({
    loadSnapshot: async () => ({ id: "old" }), nextSnapshot: { id: "new" }, previousBinding: { id: "old" }, nextBinding: { id: "new" },
    saveSnapshot: async value => { calls.push(`save:${value.id}`); if (value.id === "old") throw new Error("快照恢复失败"); },
    removeSnapshot: async () => calls.push("remove-snapshot"),
    saveBinding: async value => calls.push(`bind:${value.id}`), removeBinding: async () => calls.push("remove-binding"),
    publish: async () => { calls.push("publish-new"); throw new Error("发布失败"); },
    removeOutput: async () => calls.push("remove-output"),
    restoreOutput: async value => calls.push(`restore-output:${value?.id}`),
  }), error => error instanceof ThemePublicationError
    && error.restored.snapshot === false
    && error.restored.binding === true
    && error.restored.output === true
    && error.rollbackErrors.snapshot instanceof Error);
  assert.ok(calls.includes("bind:old"));
  assert.ok(calls.includes("remove-output"));
  assert.ok(calls.includes("restore-output:old"));
});

test("首次兼容发布失败会撤销候选输出并恢复原目标输出", async () => {
  const calls = [];
  await assert.rejects(() => commitThemePublication({
    loadSnapshot: async () => undefined, nextSnapshot: { id: "new" }, previousBinding: { id: "native" }, nextBinding: { id: "new" },
    saveSnapshot: async value => calls.push(`save:${value.id}`), removeSnapshot: async () => calls.push("remove-snapshot"),
    saveBinding: async value => calls.push(`bind:${value.id}`), removeBinding: async () => calls.push("remove-binding"),
    publish: async () => { calls.push("publish-new"); throw new Error("激活失败"); },
    removeOutput: async () => calls.push("remove-output"),
    restoreOutput: async value => calls.push(`restore-output:${String(value)}`),
  }), error => error instanceof ThemePublicationError && Object.values(error.restored).every(Boolean));
  assert.deepEqual(calls.slice(-4), ["remove-snapshot", "bind:native", "remove-output", "restore-output:undefined"]);
});

test("输出撤销失败仍继续恢复旧输出并报告独立状态", async () => {
  const calls = [];
  await assert.rejects(() => commitThemePublication({
    loadSnapshot: async () => ({ id: "old" }), nextSnapshot: { id: "new" }, previousBinding: { id: "old" }, nextBinding: { id: "new" },
    saveSnapshot: async () => {}, removeSnapshot: async () => {}, saveBinding: async () => {}, removeBinding: async () => {},
    publish: async value => { if (value.id === "new") throw new Error("发布失败"); },
    removeOutput: async () => { calls.push("remove-output"); throw new Error("撤销失败"); },
    restoreOutput: async value => { calls.push(`restore-output:${value.id}`); },
  }), error => error instanceof ThemePublicationError
    && error.restored.snapshot === true
    && error.restored.binding === true
    && error.restored.output === false
    && error.rollbackErrors.output instanceof ThemeOutputRollbackError
    && error.rollbackErrors.output.errors.length === 1);
  assert.deepEqual(calls, ["remove-output", "restore-output:old"]);
});
