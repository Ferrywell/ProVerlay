/**
 * Serialize async disk writes and write JSON atomically (temp + rename)
 * to avoid truncated registry/project files under concurrent patches.
 *
 * Every read-modify-write of the project state or the registry must run
 * inside one enqueueWrite() task; never call enqueueWrite() from inside a
 * queued task (it would wait on itself).
 */
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

let chain = Promise.resolve()

/** Run `fn` after all previously queued write tasks finish. */
export function enqueueWrite(fn) {
  const run = chain.then(() => fn())
  // Keep the queue alive even if one write fails
  chain = run.catch(() => {})
  return run
}

/** Resolves once every task queued so far has settled. */
export function drainWrites() {
  return chain
}

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * fs.rename with retries: on Windows, antivirus / indexers briefly lock
 * freshly written files, which makes rename fail with EPERM/EBUSY.
 */
export async function renameWithRetry(from, to, { attempts = 6, baseDelayMs = 20 } = {}) {
  for (let i = 0; ; i++) {
    try {
      await fs.rename(from, to)
      return
    } catch (err) {
      if (!RETRY_CODES.has(err.code) || i >= attempts - 1) throw err
      await sleep(baseDelayMs * 2 ** i)
    }
  }
}

/** Atomic JSON write: temp file in same directory, then rename. */
export async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  const tmp = path.join(dir, `.${base}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`)
  const body = JSON.stringify(value, null, 2)
  await fs.writeFile(tmp, body)
  try {
    await renameWithRetry(tmp, filePath)
  } catch (err) {
    await fs.unlink(tmp).catch(() => {})
    throw err
  }
}
