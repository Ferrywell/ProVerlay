export default {
  initVariables() {
    this.setVariableDefinitions({
      theme: { name: 'Theme' },
      graphic_count: { name: 'Graphic count' },
      visible_count: { name: 'Visible count' }
    })

    this.setVariableValues({
      theme: this.state.theme || '',
      graphic_count: String(this.state.graphics?.length || 0),
      visible_count: String(this.state.graphics?.filter((g) => g.visible).length || 0)
    })
  }
}
