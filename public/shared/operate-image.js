/** Operate card for the Image widget: thumbnail grid, Previous / Next / Hide. */
import { toggleGraphic } from '/public/shared/client.js'
import { escapeHtml, enqueue, postEndpoint, replaceHtmlKeepFocus } from '/public/shared/operate-ui.js'
import { projectAssetUrl } from '/public/shared/active-project.js'
import { activeImage, imageItems } from '/public/shared/image-list.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function gridHtml(g) {
  const images = imageItems(g.data)
  if (!images.length) {
    return '<p class="op-status">No images yet. Add them in the dashboard under Edit settings.</p>'
  }
  const activeId = g.data?.activeImageId
  return `<div class="op-image-grid">
    ${images
      .map((img) => {
        const live = Boolean(g.visible && img.id === activeId)
        const cued = !g.visible && img.id === activeId
        return `<button type="button" class="op-image-pick${live ? ' is-live' : ''}${cued ? ' is-cued' : ''}" data-action="img-show" data-entry-id="${escapeHtml(img.id)}" aria-pressed="${live}" title="${escapeHtml(img.name || img.src)}">
          <span class="op-image-pick__thumb"><img src="${escapeHtml(projectAssetUrl(img.src))}" alt="" loading="lazy" decoding="async" /></span>
          <span class="op-image-pick__name">${escapeHtml(img.name || img.src)}</span>
        </button>`
      })
      .join('')}
  </div>`
}

function navHtml(g) {
  const disabled = imageItems(g.data).length ? '' : ' disabled'
  return `<div class="op-image-nav">
    <button type="button" class="button button--secondary" data-action="img-step" data-direction="previous"${disabled}>Previous</button>
    <button type="button" class="button button--secondary" data-action="img-step" data-direction="next"${disabled}>Next</button>
  </div>`
}

function step(g, direction) {
  return enqueue(g.id, () => postEndpoint(g.id, 'images/step', 'Image not changed', { direction }))
}

export const imageCard = {
  label: 'Image',
  status(g) {
    const count = imageItems(g.data).length
    const active = activeImage(g.data)
    const where = active ? (g.visible ? ` · showing ${active.name || active.src}` : ` · next up ${active.name || active.src}`) : ''
    return `${plural(count, 'image', 'images')}${where}`
  },
  // Previous / Next first: with a long list they stay in reach without scrolling.
  primary: (g) => `<div class="pv-group__cell" data-nav-cell>${navHtml(g)}</div><div class="pv-group__cell" data-pick-cell>${gridHtml(g)}</div>`,
  update(card, g) {
    replaceHtmlKeepFocus(card.querySelector('[data-pick-cell]'), gridHtml(g))
    replaceHtmlKeepFocus(card.querySelector('[data-nav-cell]'), navHtml(g))
  },
  async action(g, action, ctx) {
    if (action === 'img-step') return step(g, ctx.target.dataset.direction === 'previous' ? 'previous' : 'next')
    const imageId = ctx.target.closest('[data-entry-id]')?.dataset.entryId
    if (action !== 'img-show' || !imageId) return
    // Tapping the image on air takes it off air.
    if (g.visible && g.data?.activeImageId === imageId) return toggleGraphic(g.id, false)
    return enqueue(g.id, () => postEndpoint(g.id, `images/${encodeURIComponent(imageId)}/show`, 'Image not shown'))
  }
}
