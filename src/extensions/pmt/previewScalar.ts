// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// import { LiteGraph } from '@comfyorg/litegraph'
import { app } from '@/scripts/app'
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.PreviewScalar',
  nodeCreated(node) {
    if (
      ![
        'preview.boolean',
        'preview.number',
        'preview.text',
        'preview.json'
      ].includes(node?.comfyClass)
    ) {
      return
    }

    const div = document.createElement('div')
    div.classList.add('relative', 'overflow-hidden')
    const pre = document.createElement('pre')
    pre.classList.add(
      'absolute',
      'inset-0',
      'p-1',
      'overflow-auto',
      'bg-neutral-800',
      'text-xs'
    )
    div.appendChild(pre)
    const widget = node.addDOMWidget(
      'preview-scalar',
      'preview-scalar',
      div,
      {}
    )

    const _onAdded = node.onAdded
    node.onAdded = function (...args) {
      requestAnimationFrame(() => {
        if (
          node.comfyClass === 'preview.boolean' ||
          node.comfyClass === 'preview.number'
        ) {
          node.setSize([300, 100])
        }
        if (
          node.comfyClass === 'preview.text' ||
          node.comfyClass === 'preview.json'
        ) {
          node.setSize([300, 200])
        }
        node.setDirtyCanvas(true)
      })
      return _onAdded?.apply(this, args)
    }

    const _onDrawBackground = node.onDrawBackground
    node.onDrawBackground = function (...args) {
      let handled = false

      const link_info = node.getInputLink(0)
      if (link_info) {
        const inputNode = app.graph.getNodeById(link_info.origin_id)
        const inputNodeOutput = inputNode?.getOutputInfo(link_info.origin_slot)
        if (inputNodeOutput) {
          // @ts-expect-error custom pmt_fields
          const pmt_fields = inputNode.pmt_fields as any
          const mayPreview = [
            // 'pending',
            // 'current',
            'done'
          ].includes(pmt_fields?.status)

          if (mayPreview) {
            const output = pmt_fields?.outputs?.[link_info.origin_slot]
            if (output) {
              pre.textContent =
                output.value !== undefined ? `${output.value}` : ''
              handled = true
            }
          }
        }
      }

      if (!handled) {
        pre.textContent = ''
      }

      return _onDrawBackground?.apply(this, args)
    }
  }
})
