import test from 'node:test';import assert from 'node:assert/strict';
import {fontFamilyPresentation} from '../src/components/fontFamilyPresentation.ts';
test('字体首选与后备列表保留引号内逗号及顺序',()=>{assert.deepEqual(fontFamilyPresentation('"A, B", "Noto Sans SC", sans-serif'),{label:'A, B · 2 个后备字体',title:'首选：A, B\n后备：Noto Sans SC → sans-serif'});assert.equal(fontFamilyPresentation('inherit').label,'继承主题');});
