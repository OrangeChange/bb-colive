import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const files = [
  'src/App.tsx',
  'src/components/ConnectBar.tsx',
  'src/components/DiagnosticSettings.tsx',
  'src/components/EventRow.tsx',
  'src/components/LiveFilterBar.tsx',
  'src/components/LoginCard.tsx',
  'src/components/PersonalBroadcastPanel.tsx',
  'src/components/ReviewArchiveManagement.tsx',
  'src/components/ReviewArchiveSettings.tsx',
  'src/components/ReviewDataExportDialog.tsx',
  'src/components/ReviewFavoritesPanel.tsx',
  'src/components/ReviewFilterShell.tsx',
  'src/components/ReviewOwnerEventResults.tsx',
  'src/components/ReviewOwnerList.tsx',
  'src/components/ReviewOwnerSessionFilters.tsx',
  'src/components/ReviewPanel.tsx',
  'src/components/ReviewSessionTimeline.tsx',
  'src/components/ReviewSearchControls.tsx',
  'src/components/RoomOverviewBar.tsx',
  'src/components/RoomRankings.tsx',
  'src/components/SettingsPanel.tsx',
  'src/components/Sidebar.tsx',
  'src/components/StatusBar.tsx',
  'src/components/VoicePanel.tsx',
];

const deprecatedCopy = [
  '主播的第一排观众席 · 扫码登录后开始记录',
  '暂无历史，输入房间号连接即添加',
  '房间有效',
  '搜索文字',
  '已设 ${conditionCount} 项',
  '含收藏的场次',
  '事件结果',
  '最近结果',
  '历史事件暂时无法检索',
  '后续场次暂时无法加载',
  '未命名直播',
  '有提醒',
  '未完整结束',
  '暂无主播卡',
  '事件内容不可预览',
  '原档案不可用',
  '命中的事件',
  '业务事件',
  '正在整理业务数据',
  '正式队列',
  '概览重试',
  '数据已暂停',
  '未在记录',
  '点击后鼠标穿透',
  '（点击切换）',
  '搜索收藏内容',
  '全选已加载',
  '输入关键词，回车添加',
  '完整日志包会包含本机仍保留的全部诊断日志',
  '打开此说明时刻前2分钟',
  'source/render',
];

test('user-facing copy does not reintroduce deprecated wording', () => {
  const source = files
    .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
  const found = deprecatedCopy.filter((copy) => source.includes(copy));
  assert.deepEqual(found, []);
});
