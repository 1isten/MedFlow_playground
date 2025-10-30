// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.SelectStatics',
  getCustomWidgets(app) {
    return {
      STATICSLIST(node, inputName, inputData, app) {
        const pmt_fields = node.pmt_fields as any

        const isOptional = true // inputData?.[1]?.isOptional === true
        const options = inputData?.[1]?.options || {}

        const input_slot = node.inputs.findIndex(
          (i) => i.name === inputData?.[1]?.widget
        )
        const input_name = node.inputs[input_slot]?.name ?? 'statics'

        const plugin_name = node?.comfyClass?.startsWith('plugin.')
          ? node.comfyClass.split('.')[1]
          : null

        if (isOptional && input_slot !== -1) {
          node.removeInput(input_slot)
        }

        const selectWidget = node.addWidget(
          'combo', // type
          input_name, // name
          '', // value
          (value) => {}, // callback
          {
            values: []
          }
        )

        if (window.$electron && plugin_name) {
          let loading = false
          async function getPluginStatics(pluginName) {
            if (loading) {
              return
            }
            loading = true
            return fetch(`h3://localhost/api/plugins/${pluginName}/statics`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            })
              .then((res) => {
                if (res.ok) {
                  return res.json()
                } else {
                  throw new Error('Failed to fetch plugin statics list')
                }
              })
              .then(({ data, error, message }) => {
                if (error) {
                  throw new Error(message)
                }
                const staticsList = []
                if (data?.length > 0) {
                  data.forEach(({ isFolder, name, path }) => {
                    if (isFolder) {
                      return
                    }
                    staticsList.push(path)
                  })
                }
                selectWidget.options.values = staticsList
                if (
                  selectWidget.value &&
                  !staticsList.includes(selectWidget.value)
                ) {
                  selectWidget.value = ''
                }
              })
              .catch((err) => {
                console.error(err)
              })
              .finally(() => {
                node.setDirtyCanvas(true)
                loading = false
              })
          }

          const _onAdded = node.onAdded
          node.onAdded = function (...args) {
            void getPluginStatics(plugin_name)
            return _onAdded?.apply(this, args)
          }
          /*
          const _onMouseEnter = node.onMouseEnter
          node.onMouseEnter = function (...args) {
            void getPluginStatics(plugin_name)
            return _onMouseEnter?.apply(this, args)
          }
          */
          const _onPointerDown = selectWidget.onPointerDown
          selectWidget.onPointerDown = function (...args) {
            void getPluginStatics(plugin_name)
            return _onPointerDown?.apply(this, args)
          }
        }

        return { widget: selectWidget }
      }
    }
  }
})
