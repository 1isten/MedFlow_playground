// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { LiteGraph } from '@comfyorg/litegraph'

import { app } from '@/scripts/app'
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.ToExport',
  nodeCreated(node) {
    if (node?.comfyClass === 'output.export') {
      const _inputs = node.inputs.map((i) => {
        // i.localized_name = `* ${i.name}`
        return { name: i.name, type: i.type }
      })
      // node.setDirtyCanvas(true)

      const _onConfigure = node.onConfigure
      node.onConfigure = function (...args) {
        // shrink node height to remove empty space
        node.setSize([node.size[0], 0])
        return _onConfigure?.apply(this, args)
      }

      const _onAfterGraphConfigured = node.onAfterGraphConfigured
      node.onAfterGraphConfigured = function (...args) {
        const pmt_fields = node.pmt_fields as any
        if (pmt_fields) {
          delete node.pmt_fields
        }
        return _onAfterGraphConfigured?.apply(this, args)
      }

      const _onConnectionsChange = node.onConnectionsChange
      node.onConnectionsChange = function (...args) {
        const [type, index, isConnected, link_info, inputOrOutput] = args
        switch (type) {
          case LiteGraph.INPUT: {
            if (isConnected) {
              if (link_info) {
                const inputNode = app.graph.getNodeById(link_info.origin_id)
                const inputNodeOutput = inputNode?.getOutputInfo(
                  link_info.origin_slot
                )
                const outputNodeInput = node.getInputInfo(link_info.target_slot)
                if (outputNodeInput?.type === '*') {
                  if (inputNodeOutput?.type) {
                    node.inputs[link_info.target_slot].name =
                      inputNodeOutput.name
                    node.inputs[link_info.target_slot].type =
                      inputNodeOutput.type
                  }
                } else {
                  while (node.inputs.find((i) => i.type !== link_info.type)) {
                    node.removeInput(
                      node.inputs.findIndex((i) => i.type !== link_info.type)
                    )
                  }
                }
              } else {
                break
              }
            } else {
              const linkedInputSlot = node.inputs.findIndex((i) => !!i.link)
              if (linkedInputSlot === -1) {
                while (node.inputs.length > 0) {
                  node.removeInput(node.inputs.length - 1)
                }
                _inputs.forEach(({ name, type }) => {
                  const input = node.addInput(name, type)
                  // input.localized_name = `* ${name}`
                })
              } else {
                break
              }
            }
            node.setDirtyCanvas(true)
            break
          }
          case LiteGraph.OUTPUT: {
            break
          }
        }
        return _onConnectionsChange?.apply(this, args)
      }
    } else {
      return
    }

    if (
      !node ||
      node.comfyClass.startsWith('rag_llm.') ||
      node.comfyClass.startsWith('preview.') ||
      node.comfyClass.startsWith('output.')
    ) {
      return
    }

    let savedToExportStatus = []
    let outputsList = ''
    const getSelectTemplate = (outputsList, savedStatus) => `
      <select x-data="{ outputs: [${outputsList}] }" multiple class="block w-full h-full text-sm text-right">
        <template x-for="(output, o) in outputs" :key="o + output">
          <option :value="o" x-text="output"></option>
        </template>
      </select>
    `
    const div = document.createElement('div')
    div.classList.add('relative', 'overflow-hidden')
    div.style.height = '100%'

    let _h = node.size[1]
    let addingDOMWidget = false
    function addDOMWidget(name = 'to-export-select') {
      if (addingDOMWidget) {
        return
      }
      addingDOMWidget = true
      outputsList = node.outputs.map((o) => `'${o.name}'`).join(',')
      div.innerHTML = getSelectTemplate(outputsList)
      if (savedToExportStatus?.length && savedToExportStatus.includes(1)) {
        requestAnimationFrame(() => {
          const select = div.firstElementChild
          if (select) {
            ;[...select.options].forEach((opt, o) => {
              if (savedToExportStatus[o] === 1) {
                opt.selected = true
              }
            })
          }
          savedToExportStatus = null
        })
      }
      _h = node.size[1]
      const w = node.addDOMWidget(name, name, div, {})
      addingDOMWidget = false
      requestAnimationFrame(() => {
        if (node.outputs.length >= 2) {
          node.setSize([
            node.size[0],
            node.size[1] + (node.outputs.length === 2 ? 10 : 70)
          ])
        }
        node.setDirtyCanvas(true)
      })
      return w
    }
    function removeDOMWidget(name = 'to-export-select') {
      const i = node.widgets.findIndex((w) => w.name === name)
      if (i > -1) {
        node.widgets[i].onRemove?.()
        node.widgets.splice(i, 1)
        div.innerHTML = ''
        outputsList = ''
        requestAnimationFrame(() => {
          node.setSize([node.size[0], _h])
          node.setDirtyCanvas(true)
        })
      }
    }

    let addingWidget = false
    function addWidget(name = 'to-export') {
      const widgetIdx = node.widgets?.findIndex((w) => w.name === name)
      if (widgetIdx !== -1) {
        return node.widgets[widgetIdx]
      }
      if (addingWidget) {
        return
      }
      addingWidget = true
      const toExport = node.addWidget(
        'toggle',
        'to-export',
        false,
        (value, canvas, node, pos, e) => {
          if (value) {
            addDOMWidget()
          } else {
            removeDOMWidget()
          }
        }
      )
      toExport.label = 'to export'
      addingWidget = false
      node.setDirtyCanvas(true)
      return toExport
    }
    function removeWidget(name = 'to-export') {
      const widgetIdx = node.widgets?.findIndex((w) => w.name === name)
      if (widgetIdx > -1) {
        node.widgets[widgetIdx].onRemove?.()
        node.widgets.splice(widgetIdx, 1)
        removeDOMWidget()
      }
    }

    const _onConfigure = node.onConfigure
    node.onConfigure = function (...args) {
      const [serialisedNode] = args
      const pmt_fields = serialisedNode?.pmt_fields as any
      if (pmt_fields && pmt_fields.args?.['to-export']) {
        if (pmt_fields.outputs?.length) {
          pmt_fields.outputs.forEach((output, o) => {
            savedToExportStatus[o] = output.to_export ? 1 : 0
          })
          // shrink node height to remove empty space
          node.setSize([node.size[0], 0])
        }
      }
      return _onConfigure?.apply(this, args)
    }

    const _onAfterGraphConfigured = node.onAfterGraphConfigured
    node.onAfterGraphConfigured = function (...args) {
      if (savedToExportStatus.includes(1)) {
        const w = addWidget()
        if (w) {
          w.value = true
          addDOMWidget()
        }
      }
      return _onAfterGraphConfigured?.apply(this, args)
    }

    const _onDrawBackground = node.onDrawBackground
    node.onDrawBackground = function (...args) {
      const widgetIdx = node.widgets?.findIndex((w) => w.name === 'to-export')
      if (node?.outputs?.length) {
        if (widgetIdx === -1) {
          addWidget()
        }
        const pmt_fields = node.pmt_fields as any
        if (pmt_fields) {
          const select = div.firstElementChild
          const selectedOpts = select
            ? [...select.options].map((opt) => (opt.selected ? 1 : 0))
            : []
          pmt_fields.outputs?.forEach((output, o) => {
            output.to_export = !!selectedOpts[o]
          })
        } else {
          const select = div.firstElementChild
          const selectedOpts = select
            ? [...select.options].map((opt) => (opt.selected ? 1 : 0))
            : []
          node.pmt_fields = {
            outputs: node.outputs.map((output, o) => ({
              to_export: !!selectedOpts[o]
            }))
          }
        }
      } else {
        if (widgetIdx > -1) {
          removeWidget()
        }
        const pmt_fields = node.pmt_fields as any
        if (pmt_fields) {
          pmt_fields.outputs?.forEach((output, o) => {
            delete output.to_export
          })
        }
      }
      return _onDrawBackground?.apply(this, args)
    }

    const _onOutputRemoved = node.onOutputRemoved
    node.onOutputRemoved = function (...args) {
      removeWidget()
      requestAnimationFrame(() => {
        node.setSize([node.size[0], 110])
        node.setDirtyCanvas(true)
      })
      return _onOutputRemoved?.apply(this, args)
    }
  }
})
