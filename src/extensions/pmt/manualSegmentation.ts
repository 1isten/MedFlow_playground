// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { LiteGraph } from '@comfyorg/litegraph'

import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.ManualSegmentation',
  nodeCreated(node) {
    if (node?.comfyClass !== 'manual.segmentation') {
      return
    } else {
      const _inputs = node.inputs.map((i) => {
        i.localized_name = `* ${i.name}`
        return { name: i.name, type: i.type }
      })
      node.setDirtyCanvas(true)

      const _onConnectionsChange = node.onConnectionsChange
      node.onConnectionsChange = function (...args) {
        const [type, index, isConnected, link_info, inputOrOutput] = args
        switch (type) {
          case LiteGraph.INPUT: {
            if (isConnected) {
              while (node.inputs.find((i) => i.type !== inputOrOutput.type)) {
                const i = node.inputs.findIndex(
                  (i) => i.type !== inputOrOutput.type
                )
                node.removeInput(i)
              }
              const input = node.inputs[0]
              input.localized_name = undefined
              const output = node.outputs[0]
              if (inputOrOutput.type === 'DICOM_FILE') {
                if (!output || output.type !== 'DICOM_FILE') {
                  node.addOutput('labelmap.dcm', 'DICOM_FILE')
                }
              } else {
                if (!output || output.type !== 'NIFTI_FILE') {
                  node.addOutput('labelmap.nii.gz', 'NIFTI_FILE')
                }
              }
            } else {
              while (node.outputs.length > 0) {
                node.removeOutput(node.outputs.length - 1)
              }
              while (node.inputs.length > 0) {
                node.removeInput(node.inputs.length - 1)
              }
              _inputs.forEach(({ name, type }) => {
                const input = node.addInput(name, type)
                input.localized_name = `* ${name}`
              })
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
    }

    const getVolViewUrl = (labelmapFormat = 'nii.gz') => {
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
      let search = `?drawer=permanent&defaultTool=Paint&labelmapFormat=${labelmapFormat}&roi=true&heatmap=true`
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
      if (
        outputInfo?.type === 'NIFTI_FILE' ||
        outputInfo?.type === 'DICOM_FILE'
      ) {
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
    countEl.classList.add('text-sm', 'mx-auto')
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
      const isDone = pmt_fields?.status === 'done'

      if (isWaiting) {
        const inputs = node['getInputs_']()
        const outputs = node['getOutputs_']()

        const inputCount = inputs.filter((input) => !!input.path).length
        const outputCount = outputs.filter((output) => !!output.path).length

        if (inputCount > 0) {
          countEl.textContent = `${outputCount}/${inputCount}`
          if (!toggleEl['openVolView']) {
            toggleEl['openVolView'] = (e) => {
              let labelmapFormat = 'nii.gz'
              const inputInfo = node.getInputInfo(0)
              if (inputInfo?.type === 'DICOM_FILE') {
                labelmapFormat = 'dcm'
              } else if (
                inputInfo?.type === 'NIFTI_FILE' ||
                inputInfo?.type === 'SERIES_FILE_LIST'
              ) {
                labelmapFormat = 'nii.gz'
              }
              const VOLVIEW_URL =
                getVolViewUrl(labelmapFormat) + `&manualNodeId=${node.id}`
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
              // pmt_fields.status = 'current'
              pmt_fields.status = 'done'
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
      } else if (isCurrent || isDone) {
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
