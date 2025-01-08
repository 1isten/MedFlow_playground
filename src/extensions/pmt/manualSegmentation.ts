// @ts-strict-ignore
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.ManualSegmentation',
  nodeCreated(node) {
    if (node?.comfyClass !== 'manual.segmentation') {
      return
    }

    const getVolViewUrl = () => {
      // eslint-disable-next-line prefer-const
      let { origin, port, pathname } = document.location
      if (origin === 'file://') {
        pathname = pathname.replace('comfyui/', '') + '#volview/'
      } else {
        if (port) {
          origin = origin.replace(port, `${+port - 1 - 2}`)
        }
        pathname += '#/volview/'
      }
      const query = new URLSearchParams(
        origin === 'file://'
          ? document.location.hash.split('?')[1] || ''
          : document.location.search
      )
      let search = `?defaultTool=Paint&drawer=permanent`
      const pipelineId = query.get('pipelineId')
      search += pipelineId ? `&pipelineId=${pipelineId}` : ''
      // search += `&manualNodeId=${node.id}`
      return new URL(origin + pathname + search).href
    }

    const getInputs = () => {
      const inputs = []
      const inputNode = node.getInputNode(0)
      if (inputNode) {
        // @ts-expect-error custom pmt_fields
        const pmt_fields = inputNode.pmt_fields as any
        if (pmt_fields?.status === 'done') {
          if (pmt_fields.outputs?.length) {
            inputs.push(...pmt_fields.outputs)
          }
        }
      }
      return inputs
    }
    node['getInputs_'] = getInputs

    const getOutputs = () => {
      const outputs = []
      const outputInfo = node.getOutputInfo(0)
      if (outputInfo?.type === 'NIFTI_FILE') {
        // @ts-expect-error custom pmt_fields
        const pmt_fields = node.pmt_fields as any
        if (pmt_fields) {
          if (pmt_fields.outputs?.length) {
            outputs.push(...pmt_fields.outputs)
          }
        }
      }
      return outputs
    }
    node['getOutputs_'] = getOutputs

    const div = document.createElement('div')
    div.classList.add(
      'relative',
      'overflow-hidden',
      'flex',
      'items-center',
      'justify-between'
    )
    const toggleEl = document.createElement('button')
    toggleEl.textContent = 'Open VolView'
    toggleEl.style.visibility = 'hidden'
    toggleEl.classList.add('text-xs', 'hover:cursor-pointer')
    div.appendChild(toggleEl)
    const countEl = document.createElement('span')
    countEl.textContent = `0/0`
    countEl.style.visibility = 'hidden'
    countEl.classList.add('text-sm')
    div.appendChild(countEl)
    const continueEl = document.createElement('button')
    continueEl.textContent = 'Continue'
    continueEl.style.visibility = 'hidden'
    continueEl.classList.add('text-xs', 'hover:cursor-pointer')
    div.appendChild(continueEl)

    const widget = node.addDOMWidget(
      'manual-segmentation',
      'manual-segmentation',
      div,
      {}
    )

    const _onDrawBackground = node.onDrawBackground
    node.onDrawBackground = function (...args) {
      // @ts-expect-error custom pmt_fields
      const pmt_fields = node.pmt_fields as any
      const isWaiting = pmt_fields?.status === 'waiting'
      const isCurrent = pmt_fields?.status === 'current'

      if (isWaiting) {
        const inputs = node['getInputs_']()
        const outputs = node['getOutputs_']()

        const inputCount = inputs.filter((input) => !!input.path).length
        const outputCount = outputs.filter((output) => !!output.path).length

        if (inputCount > 0) {
          countEl.textContent = `${outputCount}/${inputCount}`
          if (!toggleEl['openVolView']) {
            toggleEl['openVolView'] = (e) => {
              const VOLVIEW_URL = getVolViewUrl() + `&manualNodeId=${node.id}`
              window.open(VOLVIEW_URL, '_blank')
            }
            toggleEl.onclick = toggleEl['openVolView']
          }
          toggleEl.style.visibility = 'visible'
          countEl.style.visibility = 'visible'
          continueEl.classList.add('hover:cursor-pointer')
          continueEl.disabled = false
          if (outputCount === inputCount) {
            continueEl.style.visibility = 'visible'
            continueEl.onclick = (e) => {
              pmt_fields.status = 'current'
              return document
                .querySelector('#pmt-action-panel .btn-run')
                ?.['click']?.()
            }
          }
        } else {
          toggleEl.style.visibility = 'hidden'
          countEl.style.visibility = 'hidden'
          continueEl.style.visibility = 'hidden'
        }
      } else if (isCurrent) {
        toggleEl.style.visibility = 'hidden'
        countEl.style.visibility = 'visible'
        continueEl.classList.remove('hover:cursor-pointer')
        continueEl.disabled = true
      } else {
        toggleEl.style.visibility = 'hidden'
        countEl.style.visibility = 'hidden'
        continueEl.style.visibility = 'hidden'
      }

      return _onDrawBackground?.apply(this, args)
    }
  }
})
