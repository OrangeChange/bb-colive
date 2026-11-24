import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('portable package places style beside the executable without overwriting releases', async () => {
  const script = await readFile('scripts/package-windows-portable.ps1', 'utf8')
  assert.match(script, /src-tauri\\style-distribution/)
  assert.match(script, /Copy-Item -LiteralPath \$themeRoot -Destination \(Join-Path \$destination "style"\) -Recurse/)
  assert.match(script, /便携版目标已存在，未覆盖/)
  assert.doesNotMatch(script, /AppData|app_data/)
})
