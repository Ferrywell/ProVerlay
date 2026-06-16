import { hexFromColor, hexToColor } from '/public/shared/client.js'

const projectTitle = document.getElementById('project-title')
const brandForm = document.getElementById('brand-form')
const brandPreset = document.getElementById('brand-preset')
const assetList = document.getElementById('asset-list')
const designList = document.getElementById('design-list')
const assetUpload = document.getElementById('asset-upload')
const designUpload = document.getElementById('design-upload')
const projectStatus = document.getElementById('project-status')
const canvasForm = document.getElementById('canvas-form')
const canvasWidth = document.getElementById('canvas-width')
const canvasHeight = document.getElementById('canvas-height')
const canvasAspect = document.getElementById('canvas-aspect')
const canvasEditorLink = document.getElementById('canvas-editor-link')
const canvasEditorAnchor = document.getElementById('canvas-editor-anchor')

let projectId = null
let savedCanvasWidth = 1920
let savedCanvasHeight = 1080
let scoreboardGraphicId = null

function setStatus(message, type = '') {
  if (!projectStatus) return
  projectStatus.textContent = message
  projectStatus.classList.remove('is-error', 'is-success')
  if (type) projectStatus.classList.add(type === 'error' ? 'is-error' : 'is-success')
}

function isImage(filename) {
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(filename)
}

function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function assetRow(asset) {
  const preview = isImage(asset.filename)
    ? `<img src="${asset.url}" alt="" />`
    : `<div class="asset-icon" aria-hidden="true">${asset.filename.split('.').pop()?.toUpperCase() || 'FILE'}</div>`
  return `
    <li>
      ${preview}
      <div class="asset-meta">
        <strong>${asset.filename}</strong>
        <span>${formatBytes(asset.size)}</span>
      </div>
      <a class="button button--secondary" href="${asset.url}" target="_blank" rel="noreferrer">Open</a>
    </li>`
}

async function loadAssets() {
  if (!projectId) return
  try {
    const res = await fetch(`/api/projects/${projectId}/assets`)
    if (!res.ok) throw new Error('Failed to load assets')
    const assets = await res.json()
    const designs = assets.filter((a) => /^design-/i.test(a.filename))
    const files = assets.filter((a) => !/^design-/i.test(a.filename))

    assetList.innerHTML = files.length
      ? files.map(assetRow).join('')
      : '<li class="project-status">No assets yet — upload PNGs or fonts.</li>'

    designList.innerHTML = designs.length
      ? designs.map(assetRow).join('')
      : '<li class="project-status">No design references yet.</li>'
  } catch (err) {
    assetList.innerHTML = `<li class="project-status is-error">${err.message}</li>`
    designList.innerHTML = ''
  }
}

async function uploadAsset(file, { design = false } = {}) {
  if (!file || !projectId) return
  const body = new FormData()
  const filename = design && !file.name.startsWith('design-') ? `design-${file.name}` : file.name
  body.append('file', file, filename)
  setStatus('Uploading…')
  try {
    const res = await fetch(`/api/projects/${projectId}/assets`, { method: 'POST', body })
    if (!res.ok) throw new Error('Upload failed')
    await loadAssets()
    setStatus('Upload complete', 'success')
    setTimeout(() => setStatus(''), 2000)
  } catch (err) {
    setStatus(err.message, 'error')
  }
}

assetUpload?.addEventListener('change', async () => {
  const file = assetUpload.files?.[0]
  await uploadAsset(file)
  assetUpload.value = ''
})

designUpload?.addEventListener('change', async () => {
  const file = designUpload.files?.[0]
  await uploadAsset(file, { design: true })
  designUpload.value = ''
})

function fillCanvasForm(settings = {}) {
  const width = settings.canvasWidth || 1920
  const height = settings.canvasHeight || 1080
  savedCanvasWidth = width
  savedCanvasHeight = height
  if (canvasWidth) canvasWidth.value = width
  if (canvasHeight) canvasHeight.value = height
  updateAspectLabel()
}

function gcd(a, b) {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const next = y
    y = x % y
    x = next
  }
  return x || 1
}

function formatAspectRatio(width, height) {
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

function updateAspectLabel() {
  if (!canvasAspect) return
  const width = Number(canvasWidth?.value) || savedCanvasWidth
  const height = Number(canvasHeight?.value) || savedCanvasHeight
  canvasAspect.textContent = `${formatAspectRatio(width, height)} · ${width}×${height}`
}

function showEditorLink() {
  if (!canvasEditorLink || !canvasEditorAnchor) return
  canvasEditorLink.hidden = false
  if (scoreboardGraphicId) {
    canvasEditorAnchor.href = `/editor?graphic=${scoreboardGraphicId}`
  } else {
    canvasEditorAnchor.href = '/editor'
  }
}

canvasWidth?.addEventListener('input', updateAspectLabel)
canvasHeight?.addEventListener('input', updateAspectLabel)

document.querySelectorAll('[data-canvas]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [w, h] = btn.dataset.canvas.split('x').map(Number)
    if (canvasWidth) canvasWidth.value = w
    if (canvasHeight) canvasHeight.value = h
    updateAspectLabel()
  })
})

canvasForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const width = Number(canvasWidth?.value) || 1920
  const height = Number(canvasHeight?.value) || 1080
  const changed = width !== savedCanvasWidth || height !== savedCanvasHeight
  if (changed) {
    const ok = window.confirm(
      `Change canvas to ${width}×${height}? Set OBS browser sources to the same size.`
    )
    if (!ok) return
  }
  setStatus('Saving canvas…')
  try {
    const res = await fetch('/api/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { canvasWidth: width, canvasHeight: height } })
    })
    if (!res.ok) throw new Error('Save failed')
    savedCanvasWidth = width
    savedCanvasHeight = height
    updateAspectLabel()
    showEditorLink()
    setStatus(`Canvas set to ${width}×${height}`, 'success')
    setTimeout(() => setStatus(''), 2500)
  } catch (err) {
    setStatus(err.message, 'error')
  }
})

function fillBrandForm(state) {
  if (!brandForm) return
  const brand = state.brand || {}
  const colors = brand.colors || {}
  brandForm.brandName.value = brand.name || ''
  brandForm.fontFamily.value = brand.fontFamily || ''
  brandForm.fontUrl.value = brand.fontUrl || ''
  brandForm.fontSize.value = state.settings?.fontSize ?? 2.2
  brandForm.primary.value = hexFromColor(colors.primary || '#007aff')
  brandForm.secondary.value = hexFromColor(colors.secondary || '#5856d6')
  brandForm.text.value = hexFromColor(colors.text || '#1d1d1f')
  brandForm.background.value = hexFromColor(colors.background || '#ffffff')
  if (brandPreset && state.brandId) brandPreset.value = state.brandId
}

async function loadBrandPresets(state) {
  if (!brandPreset) return
  const res = await fetch('/api/brands')
  const brands = await res.json()
  brandPreset.innerHTML = brands.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')
  if (state?.brandId) brandPreset.value = state.brandId
}

brandPreset?.addEventListener('change', async () => {
  setStatus('Applying preset…')
  try {
    const res = await fetch(`/api/brands/${brandPreset.value}/apply`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to apply preset')
    const state = await fetch('/api/state').then((r) => r.json())
    fillBrandForm(state)
    setStatus('Preset applied', 'success')
    setTimeout(() => setStatus(''), 2000)
  } catch (err) {
    setStatus(err.message, 'error')
  }
})

brandForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const data = new FormData(brandForm)
  setStatus('Saving branding…')
  try {
    const res = await fetch('/api/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: {
          name: data.get('brandName'),
          fontFamily: data.get('fontFamily'),
          fontUrl: data.get('fontUrl'),
          colors: {
            primary: hexToColor(data.get('primary')),
            secondary: hexToColor(data.get('secondary')),
            text: hexToColor(data.get('text')),
            background: hexToColor(data.get('background'), 0.78)
          }
        },
        settings: { fontSize: Number(data.get('fontSize')) }
      })
    })
    if (!res.ok) throw new Error('Save failed')
    setStatus('Branding saved', 'success')
    setTimeout(() => setStatus(''), 2000)
  } catch (err) {
    setStatus(err.message, 'error')
  }
})

fetch('/api/state')
  .then((res) => res.json())
  .then(async (state) => {
    projectId = state.projectId
    scoreboardGraphicId = (state.graphics || []).find((g) => g.type === 'matchScoreboard')?.id || null
    fillCanvasForm(state.settings)
    const clientName = state.brand?.name || state.client?.name || projectId
    if (projectTitle) projectTitle.textContent = `Edit ${clientName || 'project'}`
    await loadBrandPresets(state)
    fillBrandForm(state)
    await loadAssets()
  })
  .catch((err) => setStatus(err.message || 'Failed to load project', 'error'))
