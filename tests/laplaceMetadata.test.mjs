import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseLaplaceCssMetadata} from '../src/compat/laplace/styles.ts';
test('来源作者、版本、更新时间从原始头部读取',()=>{
 const value=parseLaplaceCssMetadata(readFileSync('resources/theme-catalog/laplace-curated-1.css','utf8'));
 assert.equal(value.author,'橙橙子君');assert.equal(value.version,'1.2.0');assert.match(value.updated,/May 18, 2025/);
 assert.deepEqual(parseLaplaceCssMetadata('.event{color:red}'),{});
});
