import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';

for (const file of ['src/eventStyle.css','src/archiveEventStyle.css','src/themes/nativeCardTheme.css','src/themes/nativeBubbleTheme.css']) {
  test(`${file}仅使用语义类和伪类选择器`,()=>{
    const selectors=[];
    postcss.parse(fs.readFileSync(file,'utf8')).walkRules(rule=>{
      if(rule.selector.includes('['))selectors.push(rule.selector);
    });
    assert.deepEqual(selectors,[]);
  });
}

test('应用基础样式的回看范围使用同一语义类',()=>{
  const css=fs.readFileSync('src/App.css','utf8');
  assert.doesNotMatch(css,/\[data-event-surface=/);
  assert.match(css,/\.event\.event-surface-archive\.event-row-highlight/);
});

test('轻量气泡不依赖匿名HTML包装标签',()=>{
  postcss.parse(fs.readFileSync('src/themes/nativeBubbleTheme.css','utf8')).walkRules(rule=>{
    assert.doesNotMatch(rule.selector,/(?:^|[\s>+~,(])(?:div|span|img|details|summary)(?=[\s>+~.#:\[),]|$)/);
  });
});
