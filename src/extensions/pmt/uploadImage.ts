// @ts-strict-ignore
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.UploadImage2',
  beforeRegisterNodeDef(nodeType, nodeData) {
    Object.keys(nodeData?.input || {}).forEach((t) => {
      Object.keys(nodeData.input[t]).forEach((inputName) => {
        const input = nodeData.input[t][inputName]
        if (input?.[1]?.image_upload2 === false) {
          nodeData.input[t][inputName] = ['STRING'] // file path input
        } else if (input?.[1]?.image_upload2 === true) {
          nodeData.input[t]['upload'] = ['IMAGEUPLOAD2', { widget: inputName }]
        }
      })
    })
  },
  nodeCreated(node) {
    if (node?.comfyClass !== 'input.load_image') {
      return
    }

    // ...
  },
  getCustomWidgets(app) {
    return {
      IMAGEUPLOAD2(node, inputName, inputData, app) {
        const customWidget = node.widgets.find(
          (w) => w.name === (inputData[1]?.widget ?? 'image')
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

          // @ts-expect-error Property 'callback' does not exist on type 'LGraphNode'
          const cb = node.callback
          customWidget.callback = function (...args) {
            if (customWidget.value) {
              showImage()
            }
            if (cb) {
              return cb.apply(this, args)
            }
          }
          requestAnimationFrame(() => {
            if (customWidget.value) {
              showImage()
            }
          })
        }

        let imgUrl
        function showImage() {
          const img = new Image()
          img.onload = () => {
            node.imgs = [img]
            app.graph.setDirtyCanvas(true)
          }
          img.src = imgUrl
          node.setSizeForImage?.()
        }

        async function uploadFile(file, updateNode, pasted = false) {
          const file2base64 = (file: File) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader()
              reader.readAsDataURL(file)
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = reject
            })
          try {
            const formData = new FormData()
            formData.append('image', file)
            if (formData.get('image')) {
              const base64 = await file2base64(file)
              if (customWidget) {
                customWidget.options.values = [file.name]
              }
              if (updateNode) {
                if (customWidget) {
                  customWidget.value = file.name
                }
                imgUrl = base64
                showImage()
              }
            }
          } catch (err) {
            console.error(err)
          }
        }

        const fileInput = document.createElement('input')
        Object.assign(fileInput, {
          type: 'file',
          accept: 'image/*',
          hidden: true,
          onchange: async () => {
            if (fileInput.files.length) {
              const file = fileInput.files[0]
              const ext = file.name.split('.').slice(1).pop()
              if (['jpg', 'jpeg', 'png', 'tiff'].includes(ext)) {
                await uploadFile(file, true)
              }
            }
          }
        })

        const uploadWidget = node.addWidget(
          'button',
          inputName,
          customWidget?.name ?? 'image',
          () => fileInput.click()
        )
        requestAnimationFrame(() => {
          uploadWidget.label = 'CHOOSE FILE'
          app.graph.setDirtyCanvas(true)
        })

        node.onDragOver = function (e) {
          if (e.dataTransfer && e.dataTransfer.items) {
            const image = [...e.dataTransfer.items].find(
              (f) => f.kind === 'file'
            )
            return !!image
          }
          return false
        }
        node.onDragDrop = function (e) {
          let handled = false
          for (const file of e.dataTransfer.files) {
            const ext = file.name.split('.').slice(1).pop()
            if (['jpg', 'jpeg', 'png', 'tiff'].includes(ext)) {
              uploadFile(file, !handled)
              handled = true
            }
          }
          return handled
        }

        return { widget: uploadWidget }
      }
    }
  }
})
