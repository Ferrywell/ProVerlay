import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MULTIVIEWER_DOWNLOAD_URL, openMultiViewer } from '../server/api.js'

/** execFile stand-in: records calls; `fail(cmd, args)` decides which ones reject. */
function fakeExec(fail = () => false) {
  const calls = []
  const exec = async (cmd, args, options) => {
    calls.push({ cmd, args, options })
    if (fail(cmd, args)) {
      const err = new Error(`Command failed: ${cmd}`)
      err.code = 1
      throw err
    }
    return { stdout: '', stderr: '' }
  }
  return { exec, calls }
}

const FALLBACK = { ok: false, opened: false, url: MULTIVIEWER_DOWNLOAD_URL }

test('Windows: protocol not registered → download URL, nothing launched', async () => {
  const { exec, calls } = fakeExec((cmd) => cmd === 'reg')
  const result = await openMultiViewer({ platform: 'win32', exec })
  assert.deepEqual(result, FALLBACK)
  assert.deepEqual(
    calls.map((c) => c.cmd),
    ['reg'],
    '`start` is never run when the protocol is missing'
  )
  assert.deepEqual(calls[0].args, ['query', 'HKCR\\multiviewer', '/v', 'URL Protocol'])
  assert.equal(calls[0].options.windowsHide, true)
})

test('Windows: protocol registered → opens multiviewer:// via start', async () => {
  const { exec, calls } = fakeExec()
  const result = await openMultiViewer({ platform: 'win32', exec })
  assert.deepEqual(result, { ok: true, opened: true })
  assert.deepEqual(
    calls.map((c) => [c.cmd, ...c.args]),
    [
      ['reg', 'query', 'HKCR\\multiviewer', '/v', 'URL Protocol'],
      ['cmd', '/c', 'start', '', 'multiviewer://']
    ]
  )
})

test('Windows: start failing still falls back to the download URL', async () => {
  const { exec } = fakeExec((cmd) => cmd === 'cmd')
  assert.deepEqual(await openMultiViewer({ platform: 'win32', exec }), FALLBACK)
})

test('macOS: opens the app by name; missing app → download URL', async () => {
  const ok = fakeExec()
  assert.deepEqual(await openMultiViewer({ platform: 'darwin', exec: ok.exec }), { ok: true, opened: true })
  assert.deepEqual(ok.calls.map((c) => [c.cmd, ...c.args]), [['open', '-a', 'MultiViewer']])

  const missing = fakeExec(() => true)
  assert.deepEqual(await openMultiViewer({ platform: 'darwin', exec: missing.exec }), FALLBACK)
})

test('Linux: uses xdg-open with the protocol URL', async () => {
  const { exec, calls } = fakeExec()
  assert.deepEqual(await openMultiViewer({ platform: 'linux', exec }), { ok: true, opened: true })
  assert.deepEqual(calls.map((c) => [c.cmd, ...c.args]), [['xdg-open', 'multiviewer://']])
})
