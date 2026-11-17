/**
 * Files of a project's data sources (no state access, so projects.js can use
 * it for export, import and duplicate without an import cycle).
 */
export const DATA_DIR_NAME = 'data-sources'
/** Files that belong in a project's data-sources folder (export / import / duplicate). */
export const DATA_FILE_RE = /^src-[a-z0-9]{8}\.(csv|tsv|txt|xlsx|cache\.json)$/i

/**
 * Imported projects: a linked local path from another machine must not be
 * read here, and allowed hosts must be granted again on this computer.
 */
export function sanitizeImportedDataSources(data) {
  if (!data || typeof data !== 'object') return data
  const out = { ...data }
  if (Array.isArray(out.dataSources)) {
    out.dataSources = out.dataSources.map((s) => {
      if (!s || typeof s !== 'object' || s.origin !== 'file') return s
      const { path: _path, ...rest } = s
      return rest
    })
  }
  if (out.dataSettings && typeof out.dataSettings === 'object') out.dataSettings = { ...out.dataSettings, allowedHosts: [] }
  return out
}
