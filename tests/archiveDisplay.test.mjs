import test from "node:test";
import assert from "node:assert/strict";
import * as display from "../src/archive/archiveDisplay.ts";
import {
  formatArchiveDateTime,
  formatArchiveSessionDuration,
} from "../src/archive/archiveDisplay.ts";

test("场次日期显示到分钟且使用稳定的本地日期格式", () => {
  const value = formatArchiveDateTime(new Date(2026, 8, 25, 21, 5, 42).getTime());
  assert.equal(value, "2026-09-25 21:05");
});

test("时间排序使用顺序倒序，数值排序使用升序降序", () => {
  assert.equal(typeof display.formatArchiveSortDirection, "function");
  for (const field of ["startedAt", "latestMatch", "sessionStartedAt"]) {
    assert.equal(display.formatArchiveSortDirection("asc", field), "顺序排列");
    assert.equal(display.formatArchiveSortDirection("desc", field), "倒序排列");
  }
  for (const field of ["duration", "eventCount", "paidTotal", "favoriteCount", "matchCount"]) {
    assert.equal(display.formatArchiveSortDirection("asc", field), "升序排列");
    assert.equal(display.formatArchiveSortDirection("desc", field), "降序排列");
  }
});

test("只有 active 场次的未知结束时间显示进行中", () => {
  assert.equal(formatArchiveSessionDuration(null, "active"), "进行中");
  assert.equal(formatArchiveSessionDuration(null, "unclean"), "时长未知");
  assert.equal(formatArchiveSessionDuration(null, "ended"), "时长未知");
  assert.equal(formatArchiveSessionDuration(90 * 60_000, "unclean"), "1小时30分");
});
