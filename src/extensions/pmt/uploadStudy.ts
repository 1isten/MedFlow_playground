// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { ParsedLevel } from '@/constants/pmtCore'
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.UploadStudy',
  nodeCreated(node) {
    let filterEnabled = false
    let filterParams = null

    if (node?.comfyClass !== 'input.load_study') {
      return
    } else {
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
                output.type = 'SERIES_FILE_LIST'
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
              void fetchSeriesList(filterParams)
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
            json.$typeName?.split('.').pop() === 'Study'
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
                void fetchSeriesList(filterParams)
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
            json.$typeName?.split('.').pop() === 'Study'
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
                void fetchSeriesList(filterParams)
              }
            }
            handled = true
          }
        }
        return handled
      }
    }

    function fetchSeriesList(params: any) {
      const { oid: studyOid, datasetId, projectId, level } = params
      if (studyOid && level !== ParsedLevel.STUDY) {
        return
      }
      const formData = {
        datasetId,
        projectId,
        tags: [],
        level: ParsedLevel.SERIES
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
            throw new Error('Failed to fetch series list')
          }
        })
        .then(({ data, error, message }) => {
          if (error) {
            throw new Error(message)
          }
          const seriesList = (data.series || []).map(
            ({ $typeName, ...series }) => series
          )
          if (seriesList.length > 0) {
            seriesList.sort((a, b) => +a.tagSeriesNumber - +b.tagSeriesNumber)
            while (node.outputs.length > 0) {
              node.removeOutput(node.outputs.length - 1)
            }
            node.setSize([node.size[0], 60])
            node.setDirtyCanvas(true)
            const pmt_fields = node.pmt_fields as any
            node.pmt_fields = {
              ...(pmt_fields || {}),
              outputs: seriesList.map(
                ({ id, tagSeriesNumber, tagSeriesDescription }) => ({
                  output_name: `${tagSeriesDescription} #${tagSeriesNumber}`,
                  level: ParsedLevel.SERIES,
                  study_oid: studyOid,
                  tag_series_number: tagSeriesNumber,
                  tag_series_description: tagSeriesDescription,
                  oid: null,
                  path: null,
                  value: null
                })
              ),
              filter_params: {
                oid: studyOid,
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
                'SERIES_FILE_LIST'
              ])
            )
          }
        })
        .catch((err) => {
          console.error(err)
        })
    }

    // ...
  }
})
