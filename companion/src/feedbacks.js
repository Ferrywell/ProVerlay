import { combineRgb } from '@companion-module/base'

export default {
  initFeedbacks() {
    const feedbacks = {
      graphic_visible: {
        type: 'boolean',
        name: 'Graphic is visible (main)',
        description: 'Highlight when the selected graphic is on the combined /render output',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Graphic',
            default: this.graphics[0]?.id,
            choices: this.graphics
          }
        ],
        defaultStyle: {
          color: combineRgb(255, 255, 255),
          bgcolor: combineRgb(220, 38, 38)
        },
        callback: (feedback) => {
          const graphic = this.state.graphics?.find((g) => g.id === feedback.options.graphic)
          return Boolean(graphic?.visible)
        }
      },
      graphic_solo_visible: {
        type: 'boolean',
        name: 'Graphic is visible (solo)',
        description: 'Highlight when the selected graphic is on the solo ?graphic= URL',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Graphic',
            default: this.graphics[0]?.id,
            choices: this.graphics
          }
        ],
        defaultStyle: {
          color: combineRgb(255, 255, 255),
          bgcolor: combineRgb(55, 138, 221)
        },
        callback: (feedback) => {
          const graphic = this.state.graphics?.find((g) => g.id === feedback.options.graphic)
          return Boolean(graphic?.soloVisible)
        }
      },
      lower_third_visible: {
        type: 'boolean',
        name: 'Speaker lower third on air',
        description: 'Highlight when a speaker is shown on the selected roster',
        options: [
          {
            type: 'dropdown',
            id: 'graphic',
            label: 'Speaker roster',
            default: this.graphics[0]?.id,
            choices: this.graphics.filter((g) => {
              const full = this.state.graphics?.find((sg) => sg.id === g.id)
              return full?.type === 'lowerThirdShow'
            })
          }
        ],
        defaultStyle: {
          color: combineRgb(255, 255, 255),
          bgcolor: combineRgb(37, 99, 235)
        },
        callback: (feedback) => {
          const graphic = this.state.graphics?.find((g) => g.id === feedback.options.graphic)
          return Boolean(graphic?.type === 'lowerThirdShow' && graphic.visible && graphic.data?.activeEntryId)
        }
      }
    }

    this.setFeedbackDefinitions(feedbacks)
  }
}
