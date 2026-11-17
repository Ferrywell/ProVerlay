/**
 * Migration of old single-image widgets ({ src, alt }) to the Image widget's
 * list model (public/shared/image-list.js). Pure, no state access, so
 * server/state.js can run it on load.
 */
import { imageNameFromFile } from '../public/shared/image-list.js'

export const LEGACY_IMAGE_ID = 'img-legacy'

/**
 * Old image widgets stored one picture as { src, alt }. Turn that into a
 * one-item list that is active, so the render shows exactly the same image.
 * Missing variant/size mean free placement at original size, as before.
 */
export function migrateLegacyImages(state) {
  if (!state?.graphics?.length) return state
  let changed = false
  const graphics = state.graphics.map((g) => {
    if (g?.type !== 'image') return g
    const data = g.data && typeof g.data === 'object' && !Array.isArray(g.data) ? g.data : {}
    if (Array.isArray(data.images)) return g
    changed = true
    const { src, alt, ...rest } = data
    const hasSrc = typeof src === 'string' && src !== ''
    return {
      ...g,
      data: {
        ...rest,
        images: hasSrc ? [{ id: LEGACY_IMAGE_ID, src, name: imageNameFromFile(src) || src, alt: String(alt ?? '') }] : [],
        activeImageId: hasSrc ? LEGACY_IMAGE_ID : null
      }
    }
  })
  return changed ? { ...state, graphics } : state
}
