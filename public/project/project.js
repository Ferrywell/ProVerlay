import { sharedSocket } from '/public/shared/connection.js'
import { hexFromColor, hexToColor } from '/public/shared/client.js'
import { showToast, withPending } from '/public/shared/toast.js'

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
  if (brandPreset) brandPreset.value = state.brandId || ''
}

async function loadBrandPresets(state) {
  if (!brandPreset) return
  const res = await fetch('/api/brands')
  const brands = await res.json()
  // Default is "None": a preset only applies when the user picks one.
  brandPreset.innerHTML = [
    '<option value="">None</option>',
    ...brands.map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`)
  ].join('')
  brandPreset.value = state?.brandId || ''
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

brandPreset?.addEventListener('change', async () => {
  if (!brandPreset.value) return
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

/* ------------------------------------------------------------- helpers */

async function apiJson(url, options = {}) {
  const init = { ...options }
  if (init.body !== undefined && typeof init.body !== 'string') {
    init.headers = { 'Content-Type': 'application/json', ...(init.headers || {}) }
    init.body = JSON.stringify(init.body)
  }
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

/* ------------------------------------------------------- active project */

async function loadActiveProject() {
  const state = await apiJson('/api/state')
  projectId = state.projectId
  scoreboardGraphicId = (state.graphics || []).find((g) => g.type === 'matchScoreboard')?.id || null
  fillCanvasForm(state.settings)
  updateTitle(state)
  await loadBrandPresets(state)
  fillBrandForm(state)
  await Promise.all([loadAssets(), loadCustomCss()])
}

function updateTitle(state) {
  const name = state.projectName || state.brand?.name || state.client?.name || projectId
  if (projectTitle) projectTitle.textContent = `Edit ${name || 'project'}`
  document.title = `ProVerlay — Edit ${name || 'project'}`
}

/* ------------------------------------------------------------ projects */

const projectList = document.getElementById('project-list')
const nameDialog = document.getElementById('project-name-dialog')
const nameForm = document.getElementById('project-name-form')
const nameTitle = document.getElementById('project-name-title')
const nameInput = document.getElementById('project-name-input')
const nameOk = document.getElementById('project-name-ok')
const nameCancel = document.getElementById('project-name-cancel')
const deleteDialog = document.getElementById('project-delete-dialog')
const deleteForm = document.getElementById('project-delete-form')
const deleteText = document.getElementById('project-delete-text')
const deleteCancel = document.getElementById('project-delete-cancel')

let projects = []

/** Modal name prompt. Resolves to the trimmed name or null (cancelled). */
function askName({ title, okLabel, value }) {
  if (!nameDialog?.showModal) {
    const answer = window.prompt(title, value)
    return Promise.resolve(answer?.trim() || null)
  }
  return new Promise((resolve) => {
    nameTitle.textContent = title
    nameOk.textContent = okLabel
    nameInput.value = value
    const finish = (result) => {
      nameForm.removeEventListener('submit', onSubmit)
      nameCancel.removeEventListener('click', onCancel)
      nameDialog.removeEventListener('cancel', onCancel)
      if (nameDialog.open) nameDialog.close()
      resolve(result)
    }
    const onSubmit = (event) => {
      event.preventDefault()
      const result = nameInput.value.trim()
      if (result) finish(result)
    }
    const onCancel = (event) => {
      event?.preventDefault()
      finish(null)
    }
    nameForm.addEventListener('submit', onSubmit)
    nameCancel.addEventListener('click', onCancel)
    nameDialog.addEventListener('cancel', onCancel)
    nameDialog.showModal()
    nameInput.focus()
    nameInput.select()
  })
}

/** Modal delete confirmation naming the project. Resolves to true/false. */
function confirmDelete(project) {
  const message = `"${project.name}" will be removed from the project list. Its folder is moved to the trash folder in the ProVerlay data directory, so it can still be recovered by hand.`
  if (!deleteDialog?.showModal) return Promise.resolve(window.confirm(message))
  return new Promise((resolve) => {
    deleteText.textContent = message
    document.getElementById('project-delete-title').textContent = `Delete "${project.name}"?`
    const finish = (result) => {
      deleteForm.removeEventListener('submit', onSubmit)
      deleteCancel.removeEventListener('click', onCancel)
      deleteDialog.removeEventListener('cancel', onCancel)
      if (deleteDialog.open) deleteDialog.close()
      resolve(result)
    }
    const onSubmit = (event) => {
      event.preventDefault()
      finish(true)
    }
    const onCancel = (event) => {
      event?.preventDefault()
      finish(false)
    }
    deleteForm.addEventListener('submit', onSubmit)
    deleteCancel.addEventListener('click', onCancel)
    deleteDialog.addEventListener('cancel', onCancel)
    deleteDialog.showModal()
    deleteCancel.focus()
  })
}

function projectRow(project) {
  const only = projects.length <= 1
  const deleteHint = project.active
    ? 'Activate another project before deleting this one'
    : only
      ? 'The last project cannot be deleted'
      : `Delete ${project.name}`
  return `
    <li class="project-row${project.active ? ' is-active' : ''}" data-id="${escapeHtml(project.id)}">
      <div class="project-row__meta">
        <strong class="project-row__name">${escapeHtml(project.name)}</strong>
        <span class="project-row__id">${escapeHtml(project.id)}</span>
      </div>
      ${project.active ? '<span class="pill pill--live project-row__badge">Active</span>' : ''}
      <div class="project-row__actions">
        ${
          project.active
            ? ''
            : `<button type="button" class="button button--tinted button--compact" data-action="activate" aria-label="Activate ${escapeHtml(project.name)}">Activate</button>`
        }
        <button type="button" class="button button--secondary button--compact" data-action="rename" aria-label="Rename ${escapeHtml(project.name)}">Rename</button>
        <button type="button" class="button button--secondary button--compact" data-action="duplicate" aria-label="Duplicate ${escapeHtml(project.name)}">Duplicate</button>
        <button type="button" class="button button--danger button--compact" data-action="delete" aria-label="${escapeHtml(deleteHint)}" title="${escapeHtml(deleteHint)}"${project.active || only ? ' disabled' : ''}>Delete</button>
      </div>
    </li>`
}

function renderProjects() {
  if (!projectList) return
  projectList.innerHTML = projects.length
    ? projects.map(projectRow).join('')
    : '<li class="project-status">No projects found.</li>'
}

async function loadProjects() {
  try {
    projects = await apiJson('/api/projects')
    renderProjects()
  } catch (err) {
    if (projectList) projectList.innerHTML = `<li class="project-status is-error">${escapeHtml(err.message)}</li>`
  }
}

async function runProjectAction(action, project, button) {
  if (action === 'activate') {
    await withPending(button, async () => {
      await apiJson(`/api/projects/${encodeURIComponent(project.id)}/activate`, { method: 'POST' })
      showToast(`"${project.name}" is now the active project`, { type: 'success' })
      await Promise.all([loadProjects(), loadActiveProject()])
    })
  } else if (action === 'rename') {
    const name = await askName({ title: `Rename "${project.name}"`, okLabel: 'Rename', value: project.name })
    if (!name || name === project.name) return
    await withPending(button, async () => {
      await apiJson(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'PATCH', body: { name } })
      showToast(`Renamed to "${name}"`, { type: 'success' })
      await loadProjects()
      if (project.active) updateTitle({ projectName: name })
    })
  } else if (action === 'duplicate') {
    const name = await askName({
      title: `Duplicate "${project.name}"`,
      okLabel: 'Duplicate',
      value: `${project.name} copy`
    })
    if (!name) return
    await withPending(button, async () => {
      const copy = await apiJson(`/api/projects/${encodeURIComponent(project.id)}/duplicate`, {
        method: 'POST',
        body: { name }
      })
      showToast(`Created "${copy.name}" (not active)`, { type: 'success' })
      await loadProjects()
    })
  } else if (action === 'delete') {
    if (!(await confirmDelete(project))) return
    await withPending(button, async () => {
      await apiJson(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' })
      showToast(`"${project.name}" moved to the trash folder`, { type: 'success' })
      await loadProjects()
    })
  }
}

projectList?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]')
  if (!button) return
  const id = button.closest('[data-id]')?.dataset.id
  const project = projects.find((p) => p.id === id)
  if (!project) return
  try {
    await runProjectAction(button.dataset.action, project, button)
  } catch (err) {
    showToast(err.message || 'Something went wrong', { type: 'error' })
    await loadProjects()
  }
})

/* ---------------------------------------------------------- custom CSS */

const cssForm = document.getElementById('custom-css-form')
const cssInput = document.getElementById('custom-css-input')
const cssSave = document.getElementById('custom-css-save')
const cssRevert = document.getElementById('custom-css-revert')
const cssSize = document.getElementById('custom-css-size')
let savedCss = ''
let cssMaxBytes = 200 * 1024
const encoder = new TextEncoder()

function updateCssSize() {
  if (!cssInput || !cssSize) return
  const bytes = encoder.encode(cssInput.value).length
  const dirty = cssInput.value !== savedCss
  cssSize.textContent = `${formatBytes(bytes) === '—' ? '0 B' : formatBytes(bytes)} of ${formatBytes(cssMaxBytes)}${dirty ? ' · unsaved changes' : ''}`
  cssSize.classList.toggle('is-error', bytes > cssMaxBytes)
  if (cssRevert) cssRevert.disabled = !dirty
}

async function loadCustomCss() {
  if (!projectId || !cssInput) return
  try {
    const data = await apiJson(`/api/projects/${encodeURIComponent(projectId)}/custom-css`)
    savedCss = data.css || ''
    cssMaxBytes = data.maxBytes || cssMaxBytes
    cssInput.value = savedCss
    updateCssSize()
  } catch (err) {
    showToast(`Custom CSS could not be loaded: ${err.message}`, { type: 'error' })
  }
}

cssInput?.addEventListener('input', updateCssSize)

// Tab inserts two spaces instead of leaving the editor (Esc then Tab still moves focus).
let tabEscapes = false
cssInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    tabEscapes = true
    return
  }
  if (event.key === 'Tab' && !event.shiftKey && !tabEscapes && !event.metaKey && !event.ctrlKey) {
    event.preventDefault()
    const { selectionStart: start, selectionEnd: end, value } = cssInput
    cssInput.value = `${value.slice(0, start)}  ${value.slice(end)}`
    cssInput.selectionStart = cssInput.selectionEnd = start + 2
    updateCssSize()
    return
  }
  tabEscapes = false
})

cssRevert?.addEventListener('click', () => {
  if (!cssInput) return
  cssInput.value = savedCss
  updateCssSize()
})

cssForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!projectId || !cssInput) return
  if (encoder.encode(cssInput.value).length > cssMaxBytes) {
    showToast(`Custom CSS is too large (max ${formatBytes(cssMaxBytes)})`, { type: 'error' })
    return
  }
  try {
    await withPending(cssSave, async () => {
      const result = await apiJson(`/api/projects/${encodeURIComponent(projectId)}/custom-css`, {
        method: 'PUT',
        body: { css: cssInput.value }
      })
      await loadCustomCss()
      if (result.removedImports) {
        showToast(
          `Saved. ${result.removedImports} @import ${result.removedImports === 1 ? 'rule was' : 'rules were'} removed: custom CSS cannot load other stylesheets.`,
          { type: 'warning' }
        )
      } else {
        showToast(result.version ? 'Custom CSS saved — render updated' : 'Custom CSS removed', { type: 'success' })
      }
    })
  } catch (err) {
    showToast(err.message || 'Saving custom CSS failed', { type: 'error' })
  }
})

// Cmd/Ctrl+S saves the stylesheet while editing it.
cssInput?.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    cssForm?.requestSubmit()
  }
})

window.addEventListener('beforeunload', (event) => {
  if (cssInput && cssInput.value !== savedCss) event.preventDefault()
})

/* -------------------------------------------------------------- startup */

loadProjects()
loadActiveProject().catch((err) => setStatus(err.message || 'Failed to load project', 'error'))

// Live updates: project list changes from any client, and a project switch
// made elsewhere (dashboard, Companion) reloads this page's forms.
const socket = sharedSocket()
if (socket) {
  socket.on('projectsChanged', (list) => {
    if (!Array.isArray(list)) return
    projects = list
    renderProjects()
  })
  socket.on('stateChanged', (state) => {
    if (!state?.projectId) return
    if (projectId && state.projectId !== projectId) {
      if (cssInput && cssInput.value !== savedCss) {
        showToast('The active project changed. Unsaved custom CSS was discarded.', { type: 'warning' })
      }
      loadActiveProject().catch((err) => setStatus(err.message, 'error'))
    } else if (state.projectName) {
      updateTitle(state)
    }
  })
}
