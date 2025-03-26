// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { ParsedLevel } from '@/constants/pmtCore'
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.UploadStudy',
  nodeCreated(node) {
    if (node?.comfyClass !== 'input.load_study') {
      return
    } else {
      const [_w, _h] = node.size
      const _outputs = node.outputs.slice()

      const oidWidget = node.widgets.find((w) => {
        return w.name === 'oid'
      })
      if (oidWidget) {
        const cb = oidWidget.callback
        oidWidget.callback = function (...args) {
          const [value, canvas, node, pos, e] = args
          if (!value) {
            const pmt_fields = node.pmt_fields as any
            if (pmt_fields?.outputs?.[0]?.level) {
              pmt_fields.outputs = []
              while (node.outputs.length > 0) {
                node.removeOutput(node.outputs.length - 1)
              }
              _outputs.forEach(({ name, type }) => {
                node.addOutput(name, type)
                pmt_fields.outputs.push({
                  oid: null,
                  path: null,
                  value: null
                })
              })
              node.setSize([_w, 60])
              node.setDirtyCanvas(true)
            }
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
              fetchSeriesList(json.oid)
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
              fetchSeriesList(json.oid)
            }
            handled = true
          }
        }
        return handled
      }
    }

    function fetchSeriesList(studyOid) {
      return fetch(
        `connect://localhost/orthanc/studies/${studyOid}/series?requestedTags=SeriesDescription;SeriesNumber`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
        .then((res) => {
          if (res.ok) {
            return res.json()
          } else {
            throw new Error('Failed to fetch series list')
          }
        })
        .then((data) => {
          const seriesList = []
          data.forEach((info) => {
            const { SeriesDescription, SeriesNumber } =
              info['RequestedTags'] || {}
            if (!SeriesNumber || SeriesNumber === '0') {
              return
            }
            const oid = info['ID']
            const name = `${SeriesDescription} #${SeriesNumber}`
            if (seriesList.findIndex((s) => s.name === name) === -1) {
              seriesList.push({
                oid,
                name,
                tagSeriesDescription: SeriesDescription,
                tagSeriesNumber: SeriesNumber
              })
            }
          })
          if (seriesList.length > 0) {
            seriesList.sort((a, b) => +a.tagSeriesNumber - +b.tagSeriesNumber)
            while (node.outputs.length > 0) {
              node.removeOutput(node.outputs.length - 1)
            }
            seriesList.forEach(({ name }, o) => {
              node.addOutput(name, 'SERIES_FILE_LIST')
            })
            const pmt_fields = node.pmt_fields as any
            node.pmt_fields = {
              ...(pmt_fields || {}),
              outputs: seriesList.map(
                ({ oid, tagSeriesDescription, tagSeriesNumber }) => ({
                  level: ParsedLevel.SERIES,
                  studyOid,
                  tagSeriesDescription,
                  tagSeriesNumber,
                  oid,
                  path: null,
                  value: null
                })
              )
            }
          }
        })
        .catch((err) => {
          console.error(err)
        })
    }

    // ...
  }
})
