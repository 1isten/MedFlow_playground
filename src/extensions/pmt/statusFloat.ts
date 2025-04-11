// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
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
        'justify-between'
      )

      if (node.comfyClass !== 'manual.segmentation') {
        const countEl = document.createElement('span')
        countEl.textContent = `0/0`
        // countEl.style.visibility = 'hidden'
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
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.addEventListener('change', handleCheckpointChange)
        label.appendChild(checkbox)
        label.appendChild(document.createTextNode('checkpoint')) // 'cache'
        label.addEventListener('click', (e) => e.stopPropagation())
        div.appendChild(label)

        function handleCheckpointChange(e) {
          // @ts-expect-error custom pmt_fields
          const pmt_fields = node.pmt_fields as any
          if (pmt_fields) {
            if (e.target.checked) {
              pmt_fields.checkpoint = true
            } else {
              delete pmt_fields.checkpoint
            }
            const saveBtn = document.querySelector('.btn-sav')
            if (saveBtn) {
              // @ts-expect-error injected saveCheckpoints
              saveBtn.saveCheckpoints?.(node.id, !!pmt_fields.checkpoint)
            }
          }
        }

        const _onDrawBackground = node.onDrawBackground
        node.onDrawBackground = function (...args) {
          // @ts-expect-error custom pmt_fields
          const pmt_fields = node.pmt_fields as any
          if (pmt_fields) {
            let linkedToExport = false
            node.outputs.forEach((o) => {
              if (o?.links?.length) {
                const outputNodes = node.getOutputNodes(o.slot_index)
                linkedToExport =
                  outputNodes.findIndex(
                    (outputNode) => outputNode.type === 'output.export'
                  ) !== -1
              }
            })
            if (linkedToExport) {
              if (pmt_fields.checkpoint) {
                handleCheckpointChange({ target: { checked: false } })
              }
              checkbox.checked = true
              checkbox.disabled = true
            } else {
              if (pmt_fields.checkpoint) {
                checkbox.checked = true
              }
            }
          }
          return _onDrawBackground?.apply(this, args)
        }
      }

      const widget = node.addDOMWidget('status-float', 'status-float', div, {})
    }
  }
})
