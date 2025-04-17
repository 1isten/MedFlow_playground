// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { ParsedLevel } from '@/constants/pmtCore'
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.UploadNifti',
  beforeRegisterNodeDef(nodeType, nodeData) {
    Object.keys(nodeData?.input || {}).forEach((t) => {
      Object.keys(nodeData.input[t]).forEach((inputName) => {
        const input = nodeData.input[t][inputName]
        if (input?.[1]?.nifti_upload === false) {
          nodeData.input[t][inputName] = ['STRING'] // oid text input
        } else if (input?.[1]?.nifti_upload === true) {
          nodeData.input[t]['upload'] = ['NIFTIUPLOAD', { widget: inputName }]
        }
      })
    })
  },
  nodeCreated(node) {
    let filterEnabled = false
    let filterParams = null

    if (node?.comfyClass !== 'input.load_nifti') {
      if (node?.comfyClass === 'input.load_series') {
        const [_w, _h] = node.size
        const _outputs = node.outputs.slice()

        const _onConfigure = node.onConfigure
        node.onConfigure = function (...args) {
          const [serialisedNode] = args
          const pmt_fields = serialisedNode?.pmt_fields as any
          if (pmt_fields) {
            if (pmt_fields.outputs) {
              node.outputs.forEach((output, o) => {
                const output_name = pmt_fields.outputs[o]?.output_name
                if (output_name && output_name !== output.name) {
                  output.name = output_name
                  output.localized_name = undefined
                  output.type = 'DICOM_FILE'
                }
              })
            }
            if (pmt_fields.args?.filter) {
              filterEnabled = true
            }
            if (pmt_fields.filter_params) {
              filterParams = pmt_fields.filter_params
            }
          }
          return _onConfigure?.apply(this, args)
        }

        const filterWidget = node.widgets.find((w) => {
          return w.name === 'filter'
        })
        if (filterWidget) {
          const cb = filterWidget.callback
          filterWidget.callback = function (...args) {
            const [value, canvas, node, pos, e] = args
            filterEnabled = value
            while (node.outputs.length > 0) {
              node.removeOutput(node.outputs.length - 1)
            }
            if (filterEnabled) {
              node.setSize([_w, 60])
              node.setDirtyCanvas(true)
              if (filterParams) {
                void fetchInstancesList(filterParams)
              }
            } else {
              const pmt_fields = node.pmt_fields as any
              if (pmt_fields) {
                // delete pmt_fields.filter_params
                pmt_fields.outputs = []
              }
              _outputs.forEach(({ name, type }) => {
                node.addOutput(name, type)
                pmt_fields?.outputs?.push({
                  oid: null,
                  path: null,
                  value: null
                })
              })
              node.setSize([_w, 80])
              node.setDirtyCanvas(true)
            }
            return cb?.apply(this, args)
          }
        }

        const oidWidget = node.widgets.find((w) => {
          return w.name === 'oid'
        })
        if (oidWidget) {
          const cb = oidWidget.callback
          oidWidget.callback = function (...args) {
            const [value, canvas, node, pos, e] = args
            if (value) {
              //
            } else {
              const pmt_fields = node.pmt_fields as any
              if (pmt_fields?.outputs?.[0]?.level) {
                pmt_fields.outputs = []
              }
              if (pmt_fields?.filter_params) {
                delete pmt_fields.filter_params
              }
              filterParams = null
              filterEnabled = false
              filterWidget.value = false
              while (node.outputs.length > 0) {
                node.removeOutput(node.outputs.length - 1)
              }
              _outputs.forEach(({ name, type }) => {
                node.addOutput(name, type)
                pmt_fields?.outputs?.push({
                  oid: null,
                  path: null,
                  value: null
                })
              })
              node.setSize([_w, 80])
              node.setDirtyCanvas(true)
            }
            return cb?.apply(this, args)
          }
        }
      } else {
        return
      }
    }

    if (node.onDragOver) {
      const _onDragOver = node.onDragOver
      node.onDragOver = function (e, ...args) {
        let handled = _onDragOver?.apply(this, [e, ...args])
        if (e.dataTransfer && e.dataTransfer.items) {
          const text = [...e.dataTransfer.items].find(
            (f) => f.kind === 'string'
          )
          if (text) {
            handled = true
          }
        }
        return handled
      }
    } else {
      node.onDragOver = function (e) {
        if (e.dataTransfer && e.dataTransfer.items) {
          const text = [...e.dataTransfer.items].find(
            (f) => f.kind === 'string'
          )
          return !!text
        }
        return false
      }
    }

    if (node.onDragDrop) {
      const _onDragDrop = node.onDragDrop
      node.onDragDrop = function (e, ...args) {
        let handled = _onDragDrop?.apply(this, [e, ...args])
        const text = e.dataTransfer.getData('text')
        if (text && text.startsWith('{')) {
          const json = JSON.parse(text)
          if (
            json &&
            json.oid &&
            json.$typeName?.split('.').pop() === 'Series'
          ) {
            const oidWidget = node.widgets.find((w) => {
              return w.name === 'oid'
            })
            if (oidWidget) {
              oidWidget.value = json.oid
              filterParams = {
                oid: json.oid,
                datasetId: json.datasetId,
                projectId: json.projectId,
                level: json.level
              }
              if (filterEnabled) {
                void fetchInstancesList(filterParams)
              }
            }
            handled = true
          }
        }
        return handled
      }
    } else {
      node.onDragDrop = function (e) {
        let handled = false
        const text = e.dataTransfer.getData('text')
        if (text && text.startsWith('{')) {
          const json = JSON.parse(text)
          if (
            json &&
            json.oid &&
            json.$typeName?.split('.').pop() === 'Series'
          ) {
            const oidWidget = node.widgets.find((w) => {
              return w.name === 'oid'
            })
            if (oidWidget) {
              oidWidget.value = json.oid
              filterParams = {
                oid: json.oid,
                datasetId: json.datasetId,
                projectId: json.projectId,
                level: json.level
              }
              if (filterEnabled) {
                void fetchInstancesList(filterParams)
              }
            }
            handled = true
          }
        }
        return handled
      }
    }

    function fetchInstancesList(params: any, tags: any[] = []) {
      const { oid: seriesOid, datasetId, projectId, level } = params
      if (seriesOid && level !== ParsedLevel.SERIES) {
        return
      }
      const formData = {
        datasetId,
        projectId,
        tags:
          tags.length > 0
            ? tags
            : [
                // {
                //   key: 'ImageType',
                //   value: '*'
                // },
                // {
                //   key: 'SliceLocation',
                //   value: '*'
                // }
              ],
        level: ParsedLevel.INSTANCE,
        seriesOid
      }
      return fetch('connect://localhost/api/data-cleaning-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })
        .then((res) => {
          if (res.ok) {
            return res.json()
          } else {
            throw new Error('Failed to fetch instances list')
          }
        })
        .then(({ data, error, message }) => {
          if (error) {
            throw new Error(message)
          }
          const instancesList = (data.instances || []).map(
            ({ $typeName, ...instance }) => instance
          )
          if (instancesList.length > 0) {
            instancesList.sort(
              (a, b) => +a.tagInstanceNumber - +b.tagInstanceNumber
            )
            while (node.outputs.length > 0) {
              node.removeOutput(node.outputs.length - 1)
            }
            node.setSize([node.size[0], 60])
            node.setDirtyCanvas(true)
            const pmt_fields = node.pmt_fields as any
            node.pmt_fields = {
              ...(pmt_fields || {}),
              outputs: instancesList.map(
                ({
                  id,
                  tagInstanceNumber,
                  tagImageType,
                  tagSliceLocation
                }) => ({
                  output_name: `#${tagInstanceNumber} (Slice Location: ${tagSliceLocation}, Image Type: ${tagImageType})`,
                  level: ParsedLevel.INSTANCE,
                  series_oid: seriesOid,
                  tag_instance_number: tagInstanceNumber,
                  oid: null,
                  path: null,
                  value: null
                })
              ),
              filter_params: {
                oid: seriesOid,
                datasetId,
                projectId,
                level,
                tags: formData.tags
              }
            }
            filterParams = node.pmt_fields.filter_params
            node.addOutputs(
              node.pmt_fields.outputs.map(({ output_name }) => [
                output_name,
                'DICOM_FILE'
              ])
            )
          }
        })
        .catch((err) => {
          console.error(err)
        })
    }

    // ...
  },
  getCustomWidgets(app) {
    return {
      NIFTIUPLOAD(node, inputName, inputData, app) {
        const customWidget = node.widgets.find(
          (w) => w.name === (inputData[1]?.widget ?? 'nifti')
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
              showImage(customWidget.value)
            }
            if (cb) {
              return cb.apply(this, args)
            }
          }
          requestAnimationFrame(() => {
            if (customWidget.value) {
              showImage(customWidget.value)
            }
          })
        }

        function showImage(filename) {
          // const img = new Image()
          // img.onload = () => {
          //   node.imgs = [img]
          //   app.graph.setDirtyCanvas(true)
          // }
          // img.src = `/some/path/${filename}`
          // node.setSizeForImage?.()
        }

        async function uploadFile(file, updateNode, pasted = false) {
          try {
            const formData = new FormData()
            formData.append('nifti', file)
            if (formData.get('nifti')) {
              console.log(file)
              // [POST] /upload api...
              if (customWidget) {
                customWidget.options.values = [file.name]
              }
              if (updateNode) {
                if (customWidget) {
                  customWidget.value = file.name
                }
                showImage(customWidget.value)
              }
            }
          } catch (err) {
            console.error(err)
          }
        }

        const fileInput = document.createElement('input')
        Object.assign(fileInput, {
          type: 'file',
          accept: 'application/vnd.unknown.nifti-1,application/gzip',
          hidden: true,
          onchange: async () => {
            if (fileInput.files.length) {
              const file = fileInput.files[0]
              const filename = file.name.toLowerCase()
              if (filename.endsWith('.nii') || filename.endsWith('.nii.gz')) {
                await uploadFile(file, true)
              }
            }
          }
        })

        const uploadWidget = node.addWidget(
          'button',
          inputName,
          customWidget?.name ?? 'nifti',
          () => fileInput.click()
        )
        requestAnimationFrame(() => {
          uploadWidget.label = 'CHOOSE FILE'
          app.graph.setDirtyCanvas(true)
        })

        node.onDragOver = function (e) {
          if (e.dataTransfer && e.dataTransfer.items) {
            const nifti = [...e.dataTransfer.items].find(
              (f) => f.kind === 'file'
            )
            return !!nifti
          }
          return false
        }
        node.onDragDrop = function (e) {
          let handled = false
          for (const file of e.dataTransfer.files) {
            const filename = file.name.toLowerCase()
            if (
              file.type === 'application/vnd.unknown.nifti-1' ||
              file.type === 'application/gzip' ||
              filename.endsWith('.nii') ||
              filename.endsWith('.nii.gz')
            ) {
              void uploadFile(file, !handled)
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
