// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// import { LiteGraph } from '@comfyorg/litegraph'
import { app } from '@/scripts/app'
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.StatusFloat',
  nodeCreated(node) {
    if (
      document.location.href.includes('projectId=') ||
      document.location.href.includes('pipelineEmbedded=embedded')
    ) {
      //
    } else {
      return
    }

    if (node) {
      if (
        node.comfyClass.startsWith('rag_llm.') ||
        node.comfyClass.startsWith('preview.')
      ) {
        return
      }

      const div = document.createElement('div')
      div.classList.add(
        'relative',
        'overflow-hidden',
        'flex',
        'items-center',
        'justify-between',
        'select-none'
      )

      if (node.comfyClass !== 'manual.segmentation') {
        const countEl = document.createElement('span')
        countEl.textContent = `0/0`
        countEl.style.visibility = 'hidden'
        countEl.classList.add('text-sm')
        div.appendChild(countEl)
      }

      if (!node.comfyClass.startsWith('output.')) {
        const label = document.createElement('label')
        label.classList.add(
          '!pointer-events-auto',
          // '!cursor-pointer',
          'flex',
          'items-center',
          'justify-start',
          'text-xs',
          'ml-auto'
        )
        // checkpoint checkbox
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.classList.add('my-0')
        checkbox.addEventListener('change', handleCheckpointChange)
        label.appendChild(checkbox)
        // startpoint radio
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'startpoint'
        radio.classList.add('my-0')
        radio.addEventListener('change', handleStartPointChange)
        radio.addEventListener('click', (e) => e.stopPropagation())
        // label.appendChild(radio)
        label.appendChild(document.createTextNode('checkpoint')) // 'cache'
        label.addEventListener('click', handleLabelClick)
        div.appendChild(label)

        function handleCheckpointChange(e) {
          // @ts-expect-error custom pmt_fields
          const pmt_fields = node.pmt_fields as any
          if (pmt_fields) {
            if (e.target.checked) {
              pmt_fields.checkpoint = true
            } else {
              delete pmt_fields.checkpoint
              if (e.srcElement && pmt_fields.startpoint) {
                handleStartPointChange({ target: { checked: false } })
              }
            }
            const saveBtn = document.querySelector('.btn-sav')
            if (saveBtn) {
              // @ts-expect-error injected saveCheckpoints
              saveBtn.saveCheckpoints?.(node.id, !!pmt_fields.checkpoint)
            }
          }
        }
        function handleStartPointChange(e) {
          // @ts-expect-error custom pmt_fields
          const pmt_fields = node.pmt_fields as any
          if (pmt_fields) {
            if (e.target.checked) {
              pmt_fields.startpoint = true
            } else {
              delete pmt_fields.startpoint
            }
            const saveBtn = document.querySelector('.btn-sav')
            if (saveBtn) {
              // @ts-expect-error injected saveStartPoints
              saveBtn.saveStartPoints?.(node.id, !!pmt_fields.startpoint)
            }
          }
        }
        function handleLabelClick(e) {
          e.stopPropagation()
          if (this.firstChild === radio) {
            if (radio.checked) {
              requestAnimationFrame(() => {
                radio.checked = false
                handleStartPointChange({ target: { checked: false } })
              })
            }
          }
        }

        const _onDrawBackground = node.onDrawBackground
        node.onDrawBackground = function (...args) {
          // @ts-expect-error custom pmt_fields
          const pmt_fields = node.pmt_fields as any
          const has_status =
            !!pmt_fields?.status ||
            app.graph.nodes.findIndex((node) => node.pmt_fields?.status) !== -1
          if (pmt_fields) {
            let linkedToExport = false
            node.outputs.forEach((o, idx) => {
              if (o?.links?.length) {
                const outputNodes = node.getOutputNodes(o.slot_index ?? idx)
                linkedToExport =
                  outputNodes.findIndex(
                    (outputNode) => outputNode.type === 'output.export'
                  ) !== -1
              }
            })
            if (
              linkedToExport ||
              node.comfyClass.startsWith('input.') ||
              node.comfyClass.startsWith('manual.')
            ) {
              if (pmt_fields.checkpoint) {
                handleCheckpointChange({ target: { checked: false } })
              }
              checkbox.checked = true
              checkbox.disabled = true
            } else {
              if (pmt_fields.checkpoint) {
                checkbox.checked = true
              }
              checkbox.disabled = pmt_fields.status === 'done'
            }
            if (pmt_fields.startpoint) {
              radio.checked = true
            }
          }
          /*
          if (has_status) {
            checkbox.disabled = true
            if (checkbox.checked) {
              label.innerHTML = ''
              label.appendChild(radio)
              label.appendChild(document.createTextNode('startpoint'))
            } else {
              label.innerHTML = ''
            }
          }
          */
          return _onDrawBackground?.apply(this, args)
        }
      }

      const widget = node.addDOMWidget('status-float', 'status-float', div, {})
    }
  }
})
