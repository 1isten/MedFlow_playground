// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.UploadJson',
  beforeRegisterNodeDef(nodeType, nodeData) {
    Object.keys(nodeData?.input || {}).forEach((t) => {
      Object.keys(nodeData.input[t]).forEach((inputName) => {
        const input = nodeData.input[t][inputName]
        if (input?.[1]?.json_upload === false) {
          nodeData.input[t][inputName] = ['STRING'] // file path input
        } else if (input?.[1]?.json_upload === true) {
          nodeData.input[t]['upload'] = ['JSONUPLOAD', { widget: inputName }]
        }
      })
    })
  },
  nodeCreated(node) {
    if (node?.comfyClass !== 'input.load_json') {
      return
    }

    const _onConnectOutput = node.onConnectOutput
    node.onConnectOutput = function (...args) {
      const pmt_fields = node.pmt_fields as any
      const json = pmt_fields?.outputs?.[0]?.value
      if (json) {
        const [slot, type, input, target_node, target_slot] = args
        console.log(target_node, target_node.inputs?.[target_slot], json)
      }
      return _onConnectOutput?.apply(this, args)
    }

    // ...
  },
  getCustomWidgets(app) {
    return {
      JSONUPLOAD(node, inputName, inputData, app) {
        const customWidget = node.widgets.find(
          (w) => w.name === (inputData[1]?.widget ?? 'file')
        )
        if (customWidget) {
          const default_value = customWidget.value
          Object.defineProperty(customWidget, 'value', {
            get: function () {
              if (!this._real_value) {
                return default_value
              }
              let value = this._real_value
              if (value.filename) {
                const real_value = value
                value = ''
                value += real_value.filename
                if (real_value.type && real_value.type !== 'input')
                  value += ` [${real_value.type}]`
              }
              return value
            },
            set: function (value) {
              this._real_value = value
            }
          })
        }

        function loadDict(json) {
          if (json) {
            const pmt_fields = node.pmt_fields as any
            node.pmt_fields = {
              ...(pmt_fields || {}),
              outputs: [{ oid: null, path: null, value: json }]
            }
            node.setDirtyCanvas(true)
          }
        }

        async function uploadFile(file, updateNode, pasted = false) {
          const reader = new FileReader()
          reader.onload = async () => {
            const readerResult = reader.result
            try {
              const jsonContent = JSON.parse(readerResult)
              const formData = new FormData()
              formData.append('file', file)
              if (formData.get('file')) {
                if (customWidget) {
                  customWidget.options.values = [file.name]
                }
                if (updateNode) {
                  if (customWidget) {
                    customWidget.value = file.name
                  }
                  loadDict(jsonContent)
                }
              }
            } catch (err) {
              console.error(err)
            }
          }
          reader.readAsText(file)
        }

        const fileInput = document.createElement('input')
        Object.assign(fileInput, {
          type: 'file',
          accept: 'application/json',
          hidden: true,
          onchange: async () => {
            if (fileInput.files.length) {
              const file = fileInput.files[0]
              const ext = file.name.split('.').slice(1).pop()?.toLowerCase()
              if (['json'].includes(ext)) {
                await uploadFile(file, true)
              }
            }
          }
        })

        const uploadWidget = node.addWidget(
          'button',
          inputName,
          customWidget?.name ?? 'file',
          () => fileInput.click()
        )
        requestAnimationFrame(() => {
          uploadWidget.label = 'CHOOSE FILE'
          app.graph.setDirtyCanvas(true)
        })

        node.onDragOver = function (e) {
          window['__drag_over_node'] = true
          if (e.dataTransfer && e.dataTransfer.items) {
            const file = [...e.dataTransfer.items].find(
              (f) => f.kind === 'file'
            )
            return !!file
          }
          return false
        }
        node.onDragDrop = function (e) {
          let handled = false
          for (const file of e.dataTransfer.files) {
            const ext = file.name.split('.').slice(1).pop()?.toLowerCase()
            if (['json'].includes(ext)) {
              uploadFile(file, !handled)
              handled = true
            }
          }
          // delete window['__drag_over_node']
          return handled
        }

        return { widget: uploadWidget }
      }
    }
  }
})
