/**
 * The active project as last seen in a state broadcast, so shared UI (operate
 * cards, thumbnails) can build asset URLs without passing the state around.
 * Pages call noteActiveProject(state) on every stateChanged.
 */
let activeProjectId = 'blank'

export function noteActiveProject(state) {
  if (state && typeof state.projectId === 'string' && state.projectId) activeProjectId = state.projectId
}

export function projectAssetUrl(filename) {
  if (!filename) return ''
  return `/projects/${encodeURIComponent(activeProjectId)}/assets/${encodeURIComponent(filename)}`
}
