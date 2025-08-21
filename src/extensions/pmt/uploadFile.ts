// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.UploadFile',
  beforeRegisterNodeDef(nodeType, nodeData) {
    Object.keys(nodeData?.input || {}).forEach((t) => {
      Object.keys(nodeData.input[t]).forEach((inputName) => {
        const input = nodeData.input[t][inputName]
        if (input?.[0] === 'FILE' && input?.[1]?.file_upload === true) {
          const { file_upload, ...options } = input[1]
          nodeData.input[t]['upload'] = ['FILEUPLOAD', { widget: inputName, options }]
        }
      })
    })
  },
  getCustomWidgets(app) {
    return {
      FILEUPLOAD(node, inputName, inputData, app) {
        const pmt_fields = node.pmt_fields as any

        const isOptional = inputData?.[1]?.isOptional === true
        const options = inputData?.[1]?.options || {}
        const acceptedExtensions = options.extensions || []

        const input_slot = node.inputs.findIndex((i) => i.name === inputData?.[1]?.widget)
        const input_name = node.inputs[input_slot]?.name ?? 'file'

        if (isOptional && input_slot !== -1) {
          node.removeInput(input_slot)
        }

        let fileUploaded: File | null = null

        const fileInput = document.createElement('input')

        const uploadWidget = node.addWidget(
          'button', // type
          inputName, // name: 'upload'
          input_name, // default value: 'file'
          () => {
            if (fileUploaded) {
              uploadFile(null)
            }
            fileInput.click()
            requestAnimationFrame(() => {
              node.setDirtyCanvas(true)
            })
          }
        )
        requestAnimationFrame(() => {
          uploadWidget.label = 'CHOOSE FILE'
          app.graph.setDirtyCanvas(true)
        })

        Object.assign(fileInput, {
          type: 'file',
          accept: acceptedExtensions.length ? acceptedExtensions.join(',') : undefined,
          hidden: true,
          onchange: async () => {
            if (fileInput.files.length) {
              const file = fileInput.files[0]
              if (file) {
                uploadFile(file)
              }
            }
          }
        })

        async function uploadFile(file: File | null) {
          if (file !== null) {
            let value = ''
            if (window.$electron && typeof window.$electron.getPathForFile === 'function') {
              const path = await window.$electron.getPathForFile(file)
              if (path) {
                value = path
              }
            } else {
              // value = URL.createObjectURL(file)
            }
            node.pmt_fields = {
              ...(node.pmt_fields || {}),
              args: {
                [uploadWidget.value]: value
              }
            }
            fileUploaded = file
            uploadWidget.label = file.name
          } else {
            node.pmt_fields = {
              ...(node.pmt_fields || {}),
              args: {
                [uploadWidget.value]: null
              }
            }
            fileUploaded = null
            uploadWidget.label = 'CHOOSE FILE'
          }
        }

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
            if (file) {
              let accepted = false
              if (
                !fileInput.accept ||
                acceptedExtensions.includes(file.type) ||
                acceptedExtensions.includes('.' + file.name.split('.').pop())
              ) {
                accepted = true
              }
              if (accepted) {
                uploadFile(file)
              }
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
