// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { LiteGraph } from '@/lib/litegraph/src/litegraph'

import { ParsedLevel } from '@/constants/pmtCore'
import { app } from '@/scripts/app'
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
    let [_w, _h] = node.size
    let scalarEnabled = false
    let filterEnabled = false
    let filterParams = null
    let filterSelectEl = null
    let filterSelectWidget = null

    let disconnectInputSeries = () => {}
    let oidChangeHandler = () => {}

    if (node?.comfyClass !== 'input.load_nifti') {
      if (node?.comfyClass === 'input.load_series') {
        const shrinkWidth = () => {
          if (node?.inputs?.find((i) => i.type === 'SERIES_FILE_LIST')) {
            // shrink node width
            node.setSize([315, node.size[1]])
            requestAnimationFrame(() => {
              _w = node.size[0]
              _h = node.size[1]
              node.setDirtyCanvas(true)
            })
          }
        }
        const _outputs = node.outputs.slice()

        filterSelectEl = document.createElement('div')
        filterSelectEl.classList.toggle('invisible')
        filterSelectEl.classList.toggle('pointer-events-none')
        filterSelectEl.style.setProperty('width', '100%')
        filterSelectWidget = node.addDOMWidget(
          'filter-select',
          'filter-select',
          filterSelectEl,
          {}
        )

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
            if (pmt_fields.args?.scalar) {
              scalarEnabled = true
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

        const _onAfterGraphConfigured = node.onAfterGraphConfigured
        node.onAfterGraphConfigured = function (...args) {
          shrinkWidth()
          return _onAfterGraphConfigured?.apply(this, args)
        }

        const _onAdded = node.onAdded
        node.onAdded = function (...args) {
          shrinkWidth()
          requestAnimationFrame(() => {
            if (filterSelectWidget && window['VirtualSelect']) {
              const res = VirtualSelect.init({
                ele: filterSelectEl,
                multiple: true,
                options:
                  (filterEnabled &&
                    node.pmt_fields?.filter_options?.map(({ output_name }) => {
                      if (output_name) {
                        return {
                          label: output_name,
                          value: output_name
                        }
                      }
                    })) ||
                  [],
                selectedValue: filterEnabled
                  ? node.outputs.map((o) => o.name)
                  : undefined
              })
              if (filterEnabled) {
                filterSelectEl.classList.remove('invisible')
                filterSelectEl.classList.remove('pointer-events-none')
              }
              requestAnimationFrame(() => {
                $(filterSelectEl).change(function () {
                  if (!filterEnabled) {
                    return
                  }
                  while (node.outputs.length > 0) {
                    node.removeOutput(node.outputs.length - 1)
                  }
                  const pmt_fields = node.pmt_fields as any
                  if (pmt_fields) {
                    pmt_fields.filter_options?.forEach((o) => {
                      const output_name = this.value.find(
                        (output_name) => output_name === o.output_name
                      )
                      if (output_name) {
                        node.addOutput(output_name, 'DICOM_FILE')
                      }
                    })
                    pmt_fields.outputs = this.value.map((output_name) => {
                      const o = pmt_fields.filter_options.find(
                        (o) => o.output_name === output_name
                      )
                      return o || null
                    })
                  }
                  node.setSize(
                    pmt_fields?.outputs?.length
                      ? [
                          node.size[0],
                          160 + ((pmt_fields?.outputs?.length || 1) - 1) * 20
                        ]
                      : [380, 160]
                  )
                  node.setDirtyCanvas(true)
                })
              })
            }
          })
          return _onAdded?.apply(this, args)
        }

        const _onConnectionsChange = node.onConnectionsChange
        node.onConnectionsChange = function (...args) {
          const [type, index, isConnected, link_info, inputOrOutput] = args
          switch (type) {
            case LiteGraph.INPUT: {
              if (isConnected) {
                if (link_info) {
                  const outputNodeInput = node.getInputInfo(
                    link_info.target_slot
                  )
                  if (outputNodeInput?.type === 'SERIES_FILE_LIST') {
                    const inputNode = app.graph.getNodeById(link_info.origin_id)
                    if (inputNode?.type === node.type) {
                      /*
                      const oid =
                        inputNode.widgets.find((w) => {
                          return w.name === 'oid'
                        })?.value || ''
                      if (oid) {
                        const oidWidget = node.widgets.find((w) => {
                          return w.name === 'oid'
                        })
                        if (oidWidget) {
                          oidWidget.value = oid
                          oidChangeHandler(oidWidget.value)
                          filterParams = {
                            oid: oidWidget.value,
                            datasetId: filterParams?.datasetId,
                            projectId: filterParams?.projectId,
                            level: ParsedLevel.SERIES
                          }
                          if (filterEnabled) {
                            void fetchInstancesList(filterParams)
                          } else {
                            oidWidget.handleInputNodeInputChange?.(node, oidWidget)
                          }
                        }
                      }
                      */
                    } else {
                      const pmt_fields = inputNode?.pmt_fields as any
                      if (pmt_fields) {
                        const inputNodeOutput =
                          pmt_fields.outputs?.[link_info.origin_slot]
                        if (inputNodeOutput?.level === ParsedLevel.SERIES) {
                          const filter_params = pmt_fields.filter_params
                          if (filter_params) {
                            const {
                              study_oid,
                              oid,
                              tag_series_number,
                              tag_series_description
                            } = inputNodeOutput
                            if (oid) {
                              const oidWidget = node.widgets.find((w) => {
                                return w.name === 'oid'
                              })
                              if (oidWidget) {
                                oidWidget.value = oid
                                oidChangeHandler(oidWidget.value)
                                filterParams = {
                                  oid: oidWidget.value,
                                  datasetId: filter_params.datasetId,
                                  projectId: filter_params.projectId,
                                  level: inputNodeOutput.level
                                }
                                if (filterEnabled) {
                                  void fetchInstancesList(filterParams)
                                } else {
                                  oidWidget.handleInputNodeInputChange?.(
                                    node,
                                    oidWidget
                                  )
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                } else {
                  break
                }
              } else {
                if (link_info?.type === 'SERIES_FILE_LIST') {
                  const oidWidget = node.widgets.find((w) => {
                    return w.name === 'oid'
                  })
                  if (oidWidget) {
                    oidWidget.value = ''
                    oidChangeHandler(oidWidget.value)
                  }
                } else {
                  break
                }
              }
              // node.setDirtyCanvas(true)
              break
            }
            case LiteGraph.OUTPUT: {
              break
            }
          }
          return _onConnectionsChange?.apply(this, args)
        }

        const scalarWidget = node.widgets.find((w) => {
          return w.name === 'scalar'
        })
        if (scalarWidget) {
          const cb = scalarWidget.callback
          scalarWidget.callback = function (...args) {
            const [value, canvas, node, pos, e] = args
            if (value) {
              scalarEnabled = true
            } else {
              scalarEnabled = false
            }
            return cb?.apply(this, args)
          }
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
              node.setSize([_w, _h])
              node.setDirtyCanvas(true)
              if (filterParams) {
                void fetchInstancesList(filterParams)
              }
            } else {
              const pmt_fields = node.pmt_fields as any
              if (pmt_fields) {
                // delete pmt_fields.filter_params
                pmt_fields.outputs = []
                pmt_fields.filter_options = []
              }
              _outputs.forEach(({ name, type }) => {
                node.addOutput(name, type)
                pmt_fields?.outputs?.push({
                  oid: null,
                  path: null,
                  value: null
                })
              })
              _w = 380
              _h = 160 - 12
              node.setSize([_w, _h])
              node.setDirtyCanvas(true)
            }
            if (filterSelectWidget) {
              filterSelectEl.classList.toggle('invisible')
              filterSelectEl.classList.toggle('pointer-events-none')
              if (!filterEnabled) {
                filterSelectEl.setOptions?.([])
              }
            }
            return cb?.apply(this, args)
          }
        }

        disconnectInputSeries = function disconnectInputSeries() {
          node.inputs.forEach((input, i) => {
            if (input.type === 'SERIES_FILE_LIST') {
              node.disconnectInput(i)
            }
          })
        }
        oidChangeHandler = function oidChangeHandler(value?: string | null) {
          if (value) {
            //
          } else {
            disconnectInputSeries()
            const pmt_fields = node.pmt_fields as any
            if (pmt_fields?.outputs?.[0]?.level) {
              pmt_fields.outputs = []
              pmt_fields.filter_options = []
            }
            if (pmt_fields?.filter_params) {
              delete pmt_fields.filter_params
            }
            if (filterSelectWidget) {
              filterSelectEl.classList.add('invisible')
              filterSelectEl.classList.add('pointer-events-none')
              filterSelectEl.setOptions?.([])
            }
            filterParams = null
            filterEnabled = false
            filterWidget.value = false
            oidWidget.handleInputNodeInputChange?.(node, oidWidget)
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
            _w = 315
            _h = 136 + 24
            node.setSize([_w, _h])
            node.setDirtyCanvas(true)
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
              disconnectInputSeries()
              requestAnimationFrame(() => {
                oidWidget.value = value
                oidChangeHandler(oidWidget.value)
                filterParams = {
                  oid: oidWidget.value,
                  datasetId: filterParams?.datasetId,
                  projectId: filterParams?.projectId,
                  level: ParsedLevel.SERIES
                }
                if (filterEnabled) {
                  void fetchInstancesList(filterParams)
                } else {
                  oidWidget.handleInputNodeInputChange?.(node, oidWidget)
                }
              })
            } else {
              oidChangeHandler(value)
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
              oidChangeHandler(oidWidget.value)
              const pmt_fields = node.pmt_fields as any
              node.pmt_fields = {
                ...(pmt_fields || {}),
                filter_params: {
                  oid: oidWidget.value,
                  datasetId: json.datasetId,
                  projectId: json.projectId,
                  level: json.level
                }
              }
              filterParams = node.pmt_fields.filter_params
              if (filterEnabled) {
                void fetchInstancesList(filterParams)
                if (node.pmt_fields.status) {
                  node.pmt_fields.status = null
                }
              } else {
                oidWidget.handleInputNodeInputChange?.(node, oidWidget)
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
              oidChangeHandler(oidWidget.value)
              const pmt_fields = node.pmt_fields as any
              node.pmt_fields = {
                ...(pmt_fields || {}),
                filter_params: {
                  oid: oidWidget.value,
                  datasetId: json.datasetId,
                  projectId: json.projectId,
                  level: json.level
                }
              }
              filterParams = node.pmt_fields.filter_params
              if (filterEnabled) {
                void fetchInstancesList(filterParams)
                if (node.pmt_fields.status) {
                  node.pmt_fields.status = null
                }
              } else {
                oidWidget.handleInputNodeInputChange?.(node, oidWidget)
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
      return fetch('h3://localhost/api/data-cleaning-search', {
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
            node.setSize([node.size[0], _h])
            node.setDirtyCanvas(true)
            const pmt_fields = node.pmt_fields as any
            node.pmt_fields = {
              ...(pmt_fields || {}),
              filter_params: {
                oid: seriesOid,
                datasetId,
                projectId,
                level,
                tags: formData.tags
              },
              filter_options: instancesList.map(
                ({
                  // id,
                  oid,
                  tagInstanceNumber,
                  tagImageType,
                  tagSliceLocation
                }) => ({
                  output_name: `#${tagInstanceNumber} (Slice Location: ${tagSliceLocation}, Image Type: ${tagImageType})`,
                  level: ParsedLevel.INSTANCE,
                  series_oid: seriesOid,
                  tag_instance_number: tagInstanceNumber,
                  oid: oid || null,
                  path: null,
                  value: null
                })
              ),
              outputs: pmt_fields?.outputs || []
            }
            filterParams = node.pmt_fields.filter_params
            filterSelectEl?.setOptions?.(
              node.pmt_fields.filter_options.map(({ output_name }) => {
                if (output_name) {
                  return {
                    label: output_name,
                    value: output_name
                  }
                }
              })
            )
            /*
            node.pmt_fields.filter_options.forEach(o => {
              if (o.output_name) {
                node.addOutput(output_name, 'DICOM_FILE')
                node.pmt_fields.outputs.push(o)
              }
            })
            */
          }
        })
        .catch((err) => {
          console.error(err)
        })
    }

    const _onDrawBackground = node.onDrawBackground
    node.onDrawBackground = function (...args) {
      if (filterEnabled) {
        if (
          node.inputs.length !== 1 &&
          !node.inputs.find((i) => i.type === 'SERIES_FILE_LIST')
        ) {
          node.addInput('SERIES_FILE_LIST', 'SERIES_FILE_LIST')
        } else {
          const nodeInputSlotIndex = node.inputs.findIndex(
            (i) => i.type === 'SERIES_FILE_LIST'
          )
          if (nodeInputSlotIndex !== -1) {
            const link_info = node.getInputLink(nodeInputSlotIndex)
            const inputNode =
              link_info && link_info.origin_id
                ? app.graph.getNodeById(link_info.origin_id)
                : null
            if (inputNode) {
              const oidWidget_ = inputNode.widgets.find((w) => {
                return w.name === 'oid'
              })
              const _oidWidget = node.widgets.find((w) => {
                return w.name === 'oid'
              })
              if (oidWidget_ && _oidWidget) {
                if (oidWidget_.value !== _oidWidget.value) {
                  _oidWidget.value = oidWidget_.value
                  oidChangeHandler(_oidWidget.value)
                  if (_oidWidget.value) {
                    const filter_params = inputNode.pmt_fields?.filter_params
                    filterParams = {
                      ...(filterParams || {}),
                      ...(filter_params || {}),
                      oid: _oidWidget.value,
                      level: ParsedLevel.SERIES
                    }
                    void fetchInstancesList(filterParams)
                  }
                }
              }
            }
          }
        }
      } else {
        if (
          node.inputs.length !== 0 &&
          node.inputs.find((i) => i.type === 'SERIES_FILE_LIST')
        ) {
          node.removeInput(
            node.inputs.findIndex((i) => i.type === 'SERIES_FILE_LIST')
          )
        }
      }
      return _onDrawBackground?.apply(this, args)
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
