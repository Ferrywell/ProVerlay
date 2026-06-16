import { combineRgb } from '@companion-module/base'

export default {
  initPresets() {
    const activeBg = combineRgb(220, 38, 38)
    const inactiveBg = combineRgb(30, 41, 59)
    const text = combineRgb(255, 255, 255)

    const presets = {}
    const presetIds = []

    const speakerPresetIds = []

    for (const graphic of this.state.graphics || []) {
      if (!graphic.id) continue

      const id = `toggle_${graphic.id}`
      presetIds.push(id)
      presets[id] = {
        type: 'simple',
        name: `Main: ${graphic.name || graphic.type}`,
        style: {
          text: graphic.name || graphic.type,
          size: '18',
          color: text,
          bgcolor: inactiveBg
        },
        options: {},
        steps: [
          {
            down: [{ actionId: 'showGraphic', options: { graphic: graphic.id } }],
            up: []
          },
          {
            down: [{ actionId: 'hideGraphic', options: { graphic: graphic.id } }],
            up: []
          }
        ],
        feedbacks: [
          {
            feedbackId: 'graphic_visible',
            options: { graphic: graphic.id },
            style: { color: text, bgcolor: activeBg }
          }
        ]
      }

      const soloId = `solo_toggle_${graphic.id}`
      presetIds.push(soloId)
      presets[soloId] = {
        type: 'simple',
        name: `Solo: ${graphic.name || graphic.type}`,
        style: {
          text: `Solo\n${graphic.name || graphic.type}`,
          size: '14',
          color: text,
          bgcolor: inactiveBg
        },
        options: {},
        steps: [
          {
            down: [{ actionId: 'showGraphicSolo', options: { graphic: graphic.id } }],
            up: []
          },
          {
            down: [{ actionId: 'hideGraphicSolo', options: { graphic: graphic.id } }],
            up: []
          }
        ],
        feedbacks: [
          {
            feedbackId: 'graphic_solo_visible',
            options: { graphic: graphic.id },
            style: { color: text, bgcolor: combineRgb(55, 138, 221) }
          }
        ]
      }

      if (graphic.type === 'lowerThirdShow') {
        for (const entry of graphic.data?.entries || []) {
          const speakerId = `speaker_${graphic.id}_${entry.id}`
          speakerPresetIds.push(speakerId)
          presets[speakerId] = {
            type: 'button',
            name: `${graphic.name}: ${entry.name}`,
            style: {
              text: entry.name,
              size: '18',
              color: text,
              bgcolor: inactiveBg
            },
            options: {},
            steps: [
              {
                down: [
                  {
                    actionId: 'showLowerThirdEntry',
                    options: { speaker: `${graphic.id}|${entry.id}` }
                  }
                ],
                up: []
              }
            ],
            feedbacks: [
              {
                feedbackId: 'lower_third_visible',
                options: { graphic: graphic.id },
                style: { color: text, bgcolor: combineRgb(37, 99, 235) }
              }
            ]
          }
        }
      }
    }

    const structure = [
      {
        id: 'graphics',
        name: 'Graphics',
        definitions: presetIds
      }
    ]

    if (speakerPresetIds.length) {
      structure.push({
        id: 'speakers',
        name: 'Speakers',
        definitions: speakerPresetIds
      })
    }

    this.setPresetDefinitions(structure, presets)
  }
}
