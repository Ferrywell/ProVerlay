import { combineRgb, splitRgb } from '@companion-module/base'

const SCORE_TYPES = new Set(['footballScore', 'matchScoreboard'])

function isScoreGraphic(graphic) {
  return graphic && SCORE_TYPES.has(graphic.type)
}

export default {
  initActions() {
    const scoreGraphics = this.graphics.filter((g) => {
      const full = this.state.graphics?.find((sg) => sg.id === g.id)
      return isScoreGraphic(full)
    })

    const lowerThirdShows = this.graphics.filter((g) => {
      const full = this.state.graphics?.find((sg) => sg.id === g.id)
      return full?.type === 'lowerThirdShow'
    })

    const speakerChoices = this.buildSpeakerEntryChoices()

    const actions = {
      showGraphic: {
        name: 'Show graphic (main)',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Graphic',
            default: this.graphics[0]?.id,
            choices: this.graphics
          }
        ],
        callback: async (action) => {
          await this.setGraphicVisibility(action.options.graphic, true)
        }
      },
      hideGraphic: {
        name: 'Hide graphic (main)',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Graphic',
            default: this.graphics[0]?.id,
            choices: this.graphics
          }
        ],
        callback: async (action) => {
          await this.setGraphicVisibility(action.options.graphic, false)
        }
      },
      toggleGraphic: {
        name: 'Toggle graphic (main)',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Graphic',
            default: this.graphics[0]?.id,
            choices: this.graphics
          }
        ],
        callback: async (action) => {
          const graphic = this.state.graphics?.find((g) => g.id === action.options.graphic)
          await this.setGraphicVisibility(action.options.graphic, !graphic?.visible)
        }
      },
      showGraphicSolo: {
        name: 'Show graphic (solo)',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Graphic',
            default: this.graphics[0]?.id,
            choices: this.graphics
          }
        ],
        callback: async (action) => {
          await this.setGraphicSoloVisibility(action.options.graphic, true)
        }
      },
      hideGraphicSolo: {
        name: 'Hide graphic (solo)',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Graphic',
            default: this.graphics[0]?.id,
            choices: this.graphics
          }
        ],
        callback: async (action) => {
          await this.setGraphicSoloVisibility(action.options.graphic, false)
        }
      },
      toggleGraphicSolo: {
        name: 'Toggle graphic (solo)',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Graphic',
            default: this.graphics[0]?.id,
            choices: this.graphics
          }
        ],
        callback: async (action) => {
          const graphic = this.state.graphics?.find((g) => g.id === action.options.graphic)
          await this.setGraphicSoloVisibility(action.options.graphic, !graphic?.soloVisible)
        }
      },
      startCountdownDuration: {
        name: 'Start countdown (minutes + seconds)',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Countdown',
            default: this.graphics[0]?.id,
            choices: this.graphics
          },
          {
            type: 'number',
            id: 'minutes',
            label: 'Minutes',
            default: 15,
            min: 0,
            max: 999
          },
          {
            type: 'number',
            id: 'seconds',
            label: 'Seconds',
            default: 0,
            min: 0,
            max: 59
          }
        ],
        callback: async (action) => {
          const graphic = this.state.graphics?.find((g) => g.id === action.options.graphic)
          if (graphic?.type !== 'streamCountdown') return
          const minutes = Number(action.options.minutes) || 0
          const seconds = Number(action.options.seconds) || 0
          const totalSec = Math.max(0, minutes * 60 + seconds)
          const targetDateTime = new Date(Date.now() + totalSec * 1000).toISOString()
          await this.patchGraphic(action.options.graphic, {
            data: { ...graphic.data, targetDateTime }
          })
        }
      },
      scorePlus: {
        name: 'Score +1',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Score overlay',
            default: scoreGraphics[0]?.id,
            choices: scoreGraphics.length ? scoreGraphics : this.graphics
          },
          {
            type: 'dropdown',
            id: 'side',
            label: 'Team',
            default: 'home',
            choices: [
              { id: 'home', label: 'Home' },
              { id: 'away', label: 'Away' }
            ]
          }
        ],
        callback: async (action) => {
          const graphic = this.state.graphics?.find((g) => g.id === action.options.graphic)
          if (!isScoreGraphic(graphic)) return
          const data = { ...graphic.data }
          if (action.options.side === 'away') data.awayScore = (data.awayScore ?? 0) + 1
          else data.homeScore = (data.homeScore ?? 0) + 1
          await this.patchGraphic(action.options.graphic, { data })
        }
      },
      scoreMinus: {
        name: 'Score −1',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Score overlay',
            default: scoreGraphics[0]?.id,
            choices: scoreGraphics.length ? scoreGraphics : this.graphics
          },
          {
            type: 'dropdown',
            id: 'side',
            label: 'Team',
            default: 'home',
            choices: [
              { id: 'home', label: 'Home' },
              { id: 'away', label: 'Away' }
            ]
          }
        ],
        callback: async (action) => {
          const graphic = this.state.graphics?.find((g) => g.id === action.options.graphic)
          if (!isScoreGraphic(graphic)) return
          const data = { ...graphic.data }
          if (action.options.side === 'away') {
            data.awayScore = Math.max(0, (data.awayScore ?? 0) - 1)
          } else {
            data.homeScore = Math.max(0, (data.homeScore ?? 0) - 1)
          }
          await this.patchGraphic(action.options.graphic, { data })
        }
      },
      clockStart: {
        name: 'Start match clock',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Score overlay',
            default: scoreGraphics[0]?.id,
            choices: scoreGraphics.length ? scoreGraphics : this.graphics
          }
        ],
        callback: async (action) => {
          const graphic = this.state.graphics?.find((g) => g.id === action.options.graphic)
          if (graphic?.type !== 'matchScoreboard') return
          const clock = { ...(graphic.data?.clock || {}), running: true, runningSince: new Date().toISOString() }
          await this.patchGraphic(action.options.graphic, { data: { clock } })
        }
      },
      clockPause: {
        name: 'Pause match clock',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Score overlay',
            default: scoreGraphics[0]?.id,
            choices: scoreGraphics.length ? scoreGraphics : this.graphics
          }
        ],
        callback: async (action) => {
          const graphic = this.state.graphics?.find((g) => g.id === action.options.graphic)
          if (graphic?.type !== 'matchScoreboard') return
          const clk = graphic.data?.clock || {}
          const elapsed = clk.runningSince
            ? Math.floor((Date.now() - new Date(clk.runningSince).getTime()) / 1000)
            : 0
          const base = (clk.minute ?? 0) * 60 + (clk.second ?? 0) + elapsed
          const clock = {
            ...clk,
            minute: Math.floor(base / 60),
            second: base % 60,
            running: false,
            runningSince: null
          }
          await this.patchGraphic(action.options.graphic, { data: { clock } })
        }
      },
      showLowerThirdEntry: {
        name: 'Show speaker',
        options: [
          {
            type: 'dropdown',
            id: 'speaker',
            label: 'Speaker',
            default: speakerChoices[0]?.id,
            choices: speakerChoices
          }
        ],
        callback: async (action) => {
          const ref = action.options.speaker
          if (!ref || !ref.includes('|')) return
          const [graphicId, entryId] = ref.split('|')
          await this.showLowerThirdEntry(graphicId, entryId)
          await this.refreshState()
        }
      },
      hideLowerThirdShow: {
        name: 'Hide speaker lower third',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Speaker roster',
            default: lowerThirdShows[0]?.id,
            choices: lowerThirdShows.length ? lowerThirdShows : [{ id: '', label: 'Geen roster' }]
          }
        ],
        callback: async (action) => {
          if (!action.options.graphic) return
          await this.hideLowerThirdShow(action.options.graphic)
          await this.refreshState()
        }
      },
      setPrimaryColor: {
        name: 'Set primary color',
        options: [
          {
            type: 'colorpicker',
            id: 'color',
            label: 'Color',
            default: combineRgb(220, 38, 38)
          }
        ],
        callback: async (action) => {
          const { r, g, b } = splitRgb(action.options.color)
          await this.patchState({ colors: { primary: `rgba(${r}, ${g}, ${b}, 1)` } })
        }
      }
    }

    this.setActionDefinitions(actions)
  }
}
