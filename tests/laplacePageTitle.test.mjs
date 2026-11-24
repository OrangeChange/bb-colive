import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('LAPLACE 正式发布页面使用统一标题',()=>{
 const page=readFileSync('public/laplace/product/index.html','utf8');
 assert.equal(page.match(/<title>([^<]+)<\/title>/)?.[1],'LAPLACE product');
});
