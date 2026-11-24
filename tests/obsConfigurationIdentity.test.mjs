import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createObsConfigurationId, isObsConfigurationId, resolveOutputScheme } from '../src/obs/obsConfigurationIdentity.ts';

test('configuration codes are stable format and avoid existing codes', () => {
  const ids = new Set();
  for (let i=0;i<100;i++) {
    const id = createObsConfigurationId(ids);
    assert.equal(isObsConfigurationId(id),true);
    assert.equal(ids.has(id),false);
    ids.add(id);
  }
  assert.equal(isObsConfigurationId('e327fcb9-49fe-409b-801d-f1b786b71d05'),false);
});

test('explicit output choices precede scene state and software', () => {
  assert.equal(resolveOutputScheme('light','follow','dark',{dark:false}),'dark');
  assert.equal(resolveOutputScheme('dark','light',undefined,{dark:true}),'light');
  assert.equal(resolveOutputScheme('dark','follow',undefined,{dark:false}),'light');
  assert.equal(resolveOutputScheme('dark','follow'),'dark');
});
