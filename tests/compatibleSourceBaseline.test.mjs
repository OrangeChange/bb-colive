import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative));
const text = (relative) => read(relative).toString('utf8');
const json = (relative) => JSON.parse(text(relative));
const sha256 = (relative) => crypto.createHash('sha256').update(read(relative)).digest('hex');

function callbackCounts(events) {
  return Object.fromEntries(
    [...events.reduce((counts, event) => {
      counts.set(event.method, (counts.get(event.method) ?? 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function assertHashes(base, entries) {
  for (const [relative, expected] of Object.entries(entries)) {
    const file = path.posix.join(base, relative);
    const actual = sha256(file);
    if (actual !== expected && /\.(?:css|[cm]?[jt]sx?|vue|json|html)$/.test(file)) {
      const lf = text(file).replace(/\r\n/g, '\n');
      assert.ok([lf, lf.replace(/\n/g, '\r\n')].some(source => crypto.createHash('sha256').update(source).digest('hex') === expected), relative);
    } else {
      assert.equal(actual, expected, relative);
    }
  }
}

test('BLC 原版固定 1.10.4 来源、8294 条原始回调和重建入口', async () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts/build-blivechat.cjs')), true, '缺少 BLC 原版构建脚本');

  const manifest = json('vendor/blivechat/source-manifest.json');
  assert.deepEqual(
    { repository: manifest.repository, commit: manifest.commit, version: manifest.version },
    {
      repository: 'https://github.com/xfgryujk/blivechat',
      commit: '848409df78d2cca65d3cc8ffe938eb6b6f261b76',
      version: '1.10.4',
    },
  );
  assert.equal(manifest.files.length, 37);
  assertHashes('vendor/blivechat', Object.fromEntries(manifest.files.map(({ path: file, sha256: hash }) => [file, hash])));

  const batch = json('tests/fixtures/compat/blc-original/original-fixed-batch.json');
  assert.equal(sha256('tests/fixtures/compat/blc-original/original-fixed-batch.json'), 'd92bed750fde17f210a3ee0f251a94483c7697e4ece8a8d3769847f774dd3eae');
  assert.equal(batch.sourceSha, '848409df78d2cca65d3cc8ffe938eb6b6f261b76');
  assert.match(batch.kind, /original/i);
  assert.equal(batch.events.length, 8294);
  assert.deepEqual(callbackCounts(batch.events), {
    onAddGift: 174,
    onAddMember: 176,
    onAddSuperChat: 542,
    onAddText: 4108,
    onDelSuperChat: 113,
    onUpdateTranslation: 3181,
  });

  const settingsUrl = pathToFileURL(path.join(root, 'src/compat/blivechat/settings.ts')).href;
  const { DEFAULT_BLIVECHAT_SETTINGS } = await import(settingsUrl);
  assert.deepEqual(DEFAULT_BLIVECHAT_SETTINGS, {
    minGiftPrice: 0.1,
    showDanmaku: true,
    showGift: true,
    showGiftName: false,
    mergeSimilarDanmaku: false,
    mergeGift: true,
    maxNumber: 60,
    blockGiftDanmaku: true,
    blockMirrorMessages: false,
    blockLevel: 0,
    blockNewbie: false,
    blockNotMobileVerified: false,
    blockMedalLevel: 0,
    showDebugMessages: false,
    importPresetCss: false,
    templateUrl: '',
  });

  const entry = text('vendor/blivechat/host/entry.js');
  assert.match(entry, /const TYPE = 'bb-blivechat'/);

  const buildInfo = json('public/blivechat/build-info.json');
  assert.equal(buildInfo.upstream, '848409df78d2cca65d3cc8ffe938eb6b6f261b76');
  assert.equal(buildInfo.qaBuild, false);
  assertHashes('', buildInfo.sourceHashes);
  assertHashes('public/blivechat', buildInfo.artifactHashes);
  assert.equal(sha256('public/blivechat/LICENSE'), sha256('vendor/blivechat/LICENSE'));
  for (const font of ['assets/element-icons.ttf', 'assets/element-icons.woff']) {
    assert.equal(fs.existsSync(path.join(root, 'public/blivechat', font)), true, font);
  }
  for (const entry of manifest.files.filter(({ path: file }) => file.includes('/emoticons/'))) {
    const emitted = entry.path.replace('upstream/frontend/public/', 'public/blivechat/');
    assert.equal(sha256(emitted), entry.sha256, emitted);
  }
  assertHashes('public/static/img/icons', {
    'guard-level-1.png': 'c526f3cd8f85ff1dfdf6b57ff2c2f4a9903c81331e72109139453a11bedc5fd0',
    'guard-level-2.png': 'c9b5e1996d9069f4c6e62d6ba6ba048e0ca1825de0bb6af14d61ab82a01206f9',
    'guard-level-3.png': '09fc86db9e5d3fc96fa319d7b997610405583be6e0ea681dfb305c1b83d0a519',
  });
  assert.equal(fs.existsSync(path.join(root, 'public/blivechat/THIRD_PARTY_NOTICES.txt')), true);
  assert.equal(fs.existsSync(path.join(root, 'public/blivechat/renderer.js.LICENSE.txt')), true);
});

test('开放版历史回调样例与 MIT 渲染来源固定', async () => {
  const raw = json('tests/fixtures/compat/blc-open/rawCallbacks.json');
  const fixed = json('tests/fixtures/compat/blc-open/original-fixed-batch.json');
  const likes = json('tests/fixtures/compat/blc-open/constructed-like-batch.json');

  assert.equal(sha256('tests/fixtures/compat/blc-open/rawCallbacks.json'), 'a01af782c4083504f63f1594a7c7e7160ed5a325f9735cb19c641f4d64c5d999');
  assert.equal(sha256('tests/fixtures/compat/blc-open/original-fixed-batch.json'), '544401736ddb9c353b3f0b8a97fde68f530ad288127a8393b9b416fe3ab8c52f');
  for (const batch of [raw, fixed]) {
    assert.equal(batch.sourceBuild, '1782526222773');
    assert.equal(batch.events.length, 571);
    assert.deepEqual(callbackCounts(batch.events), {
      onAddGift: 87,
      onAddMember: 28,
      onAddSuperChat: 33,
      onAddText: 423,
    });
  }
  assert.match(likes.kind, /CONSTRUCTED/);
  assert.equal(likes.events.length, 2);
  assert.deepEqual(callbackCounts(likes.events), { onAddLike: 2 });

  const settingsUrl = pathToFileURL(path.join(root, 'src/compat/openlive/settings.ts')).href;
  const { DEFAULT_OPENLIVE_SETTINGS, OPENLIVE_SETTING_KEYS } = await import(settingsUrl);
  assert.equal(OPENLIVE_SETTING_KEYS.length, 20);
  assert.deepEqual(DEFAULT_OPENLIVE_SETTINGS, {
    skin: 'none', minGiftPrice: 0, minTickerPrice: 0.1,
    showDanmaku: true, showSuperchat: true, showNewMember: true, showGift: true,
    showGiftInfo: true, mergeSimilarDanmaku: false, mergeGift: true,
    danmakuAtBottom: true, tickerAtButtom: false, maxNumber: 30, fadeOutNum: 3,
    pinTime: 0, showLike: false, blockMedalLevel: 0,
    minDanmakuInterval: 400, maxDanmakuInterval: 1200, emoticonSize: 80,
  });

  const provenance = json('src/compat/openlive/runtime/provenance.json');
  assert.equal(provenance.repository, 'https://github.com/DoodleBears/blivechat');
  assert.equal(provenance.commit, '0da8c94d40a8791bb212985f6ac0ae55765c3a03');
  assert.equal(provenance.license, 'MIT');
  assert.match(text('vendor/openlive/LICENSE'), /MIT License/);

  const entry = text('src/compat/openlive/runtime/entry.mjs');
  assert.match(entry, /TYPE='bb-openlive'/);
  assert.match(text('public/openlive/renderer.html'), /\.\/entry\.mjs/);
});

test('LAPLACE 正式渲染入口与素材映射独立于历史对照源码', () => {
  assert.match(text('src/compat/laplace/renderer/product.tsx'), /from '\.\/independent'/);
  assert.doesNotMatch(text('src/compat/laplace/renderer/runtime-context.mjs'), /vendor\/laplace/);
  assert.ok(Object.keys(json('src/compat/laplace/renderer/asset-locations.json')).length >= 53);
  assert.equal(fs.existsSync(path.join(root,'public/laplace/product/renderer.js')),true);
});
