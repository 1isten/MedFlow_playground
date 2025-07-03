// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// import { LiteGraph } from '@comfyorg/litegraph'
import { app } from '@/scripts/app'
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.PreviewScalar',
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name === 'preview.json') {
      if (window.$?.fn?.jsonViewer) {
        nodeData.input['required'] = { JSON_FILE: ['JSON_FILE'] }
        nodeData.input_order['required'] = ['JSON_FILE']
      }
    }
  },
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
    if (
      document.location.href.includes('projectId=') ||
      document.location.href.includes('pipelineEmbedded=embedded')
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
    if (node.getInputInfo(0)?.type === 'JSON_FILE') {
      pre.$jsonView = {
        path: null,
        value: null
      }
    }
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
          if (pre.$jsonView) {
            node.setSize([400, 300])
          }
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
              if (pre.$jsonView) {
                const jsonPath = output.path || output.value || ''
                if (jsonPath && jsonPath !== pre.$jsonView.path) {
                  fetch(
                    `connect://localhost/file/${encodeURIComponent(jsonPath)}`
                  )
                    .then((res) => (res.ok ? res.json() : null))
                    .then((data) => {
                      if (data) {
                        pre.$jsonView.path = jsonPath
                        pre.$jsonView.value = data
                        $(pre).jsonViewer(data, {
                          collapsed: false,
                          rootCollapsable: false,
                          // withQuotes: true,
                          withLinks: false
                        })
                      }
                    })
                    .catch(console.error)
                }
              } else {
                const textContent =
                  output.value !== undefined ? `${output.value}` : ''
                if (pre.textContent !== textContent) {
                  pre.textContent = textContent
                }
              }
              handled = true
            }
          } else {
            if (pre.$jsonView && (pre.$jsonView.path || pre.$jsonView.value)) {
              pre.$jsonView.path = null
              pre.$jsonView.value = null
            }
            if (pre.textContent) {
              pre.textContent = ''
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
