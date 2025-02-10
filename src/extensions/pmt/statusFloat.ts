// @ts-strict-ignore
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.StatusFloat',
  nodeCreated(node) {
    if (node?.comfyClass === 'manual.segmentation') {
      return
    }
    if (!document.location.href.includes('pipelineEmbedded=embedded')) {
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
    const countEl = document.createElement('span')
    countEl.textContent = `0/0`
    // countEl.style.visibility = 'hidden'
    countEl.classList.add('text-sm', 'mx-auto')
    div.appendChild(countEl)

    const widget = node.addDOMWidget('status-float', 'status-float', div, {})
  }
})
