/**
 * Canonical blank project + registry voor nieuwe installaties.
 * Wordt gebruikt door server (ensureProjectsLayout) én door scripts/generate-seed-data.mjs.
 */

export const BLANK_PROJECT = {
  version: 4,
  client: {
    name: '',
    notes: ''
  },
  brandId: null,
  brand: {
    name: '',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
    fontUrl: '',
    colors: {
      primary: '#007AFF',
      secondary: '#5856D6',
      text: '#1D1D1F',
      background: 'rgba(255, 255, 255, 0.78)',
      accent: '#34C759'
    }
  },
  settings: {
    canvasWidth: 1920,
    canvasHeight: 1080,
    fontSize: 2.2,
    padding: 2.5,
    canvasBackground: 'transparent'
  },
  graphics: []
}

export const SEED_REGISTRY = {
  activeProjectId: 'blank',
  projects: [
    {
      id: 'blank',
      name: 'New client',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
  ]
}
