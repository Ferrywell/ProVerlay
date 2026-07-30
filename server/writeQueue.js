/**
 * Serialize async disk writes and write JSON atomically (temp + rename)
 * to avoid truncated registry/project files under concurrent patches.
 */
import fs from 'fs/promises'
import path from 'path'

let chain = Promise.resolve()

/** Run `fn` after all previously queued write tasks finish. */
export function enqueueWrite(fn) {
  const run = chain.then(() => fn())
  // Keep the queue alive even if one write fails
  chain = run.catch(() => {})
  return run
}

/** Atomic JSON write: temp file in same directory, then rename. */
export async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`)
  const body = JSON.stringify(value, null, 2)
  await fs.writeFile(tmp, body)
  await fs.rename(tmp, filePath)
}
