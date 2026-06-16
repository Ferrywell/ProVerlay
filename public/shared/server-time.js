let serverTimeOffset = 0

/** Sync client clock to ProVerlay server using `serverNow` from state payloads. */
export function applyServerTimeFromState(state) {
  const serverNow = state?.serverNow
  if (serverNow == null || !Number.isFinite(Number(serverNow))) return
  serverTimeOffset = Number(serverNow) - Date.now()
}

export function serverNowMs() {
  return Date.now() + serverTimeOffset
}
