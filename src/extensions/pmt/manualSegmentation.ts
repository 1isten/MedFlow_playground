// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { LiteGraph } from '@/lib/litegraph/src/litegraph'
import { app } from '@/scripts/app'
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
              if (link_info) {
                if (link_info.type !== inputOrOutput.type) {
                  const inputNode = app.graph.getNodeById(link_info.origin_id)
                  const adjusted_target_slot = node.inputs.findIndex(
                    (i) => i.type === link_info.type
                  )
                  if (adjusted_target_slot !== -1) {
                    inputNode?.connect(
                      link_info.origin_slot,
                      node,
                      adjusted_target_slot
                    )
                  }
                }
              } else {
                break
              }
              while (node.inputs.find((i) => i.type !== link_info.type)) {
                node.removeInput(
                  node.inputs.findIndex((i) => i.type !== link_info.type)
                )
              }
              const input = node.inputs[0]
              input.localized_name = undefined
              const output = node.outputs[0]
              if (link_info.type === 'DICOM_FILE') {
                if (!output || output.type !== 'DICOM_FILE') {
                  node.addOutput('labelmap', 'DICOM_FILE') // .dcm
                }
              } else {
                if (!output || output.type !== 'NIFTI_FILE') {
                  node.addOutput('labelmap', 'NIFTI_FILE') // .nii.gz
                }
              }
            } else {
              const linkedInputSlot = node.inputs.findIndex((i) => !!i.link)
              if (linkedInputSlot !== -1) {
                break
              }
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
      const query = new URLSearchParams(
        document.location.origin === 'file://'
          ? document.location.hash.split('?')[1] || ''
          : document.location.search
      )
      let search = `?manualType=segmentation&drawer=permanent&defaultTool=Paint&labelmapFormat=${labelmapFormat}&roi=true`
      // search += '&heatmap=true'
      const pipelineId = query.get('pipelineId')
      search += pipelineId ? `&pipelineId=${pipelineId}` : ''
      if (
        pipelineId &&
        document.location.href.includes('pipelineEmbedded=embedded')
      ) {
        search += `&pipelineEmbedded=embedded`
      }
      // search += `&manualNodeId=${node.id}`
      return new URL(window['MAIN_INDEX'] + '#/volview/' + search).href
    }

    const getInputs = () => {
      const inputs = []
      const inputNode = node.getInputNode(0)
      if (inputNode) {
        // @ts-expect-error custom pmt_fields
        const pmt_fields = inputNode.pmt_fields as any
        if (pmt_fields?.status === 'done') {
          if (pmt_fields.outputs_batch) {
            Object.entries(pmt_fields.outputs_batch).forEach(
              ([taskId, outs]) => {
                outs.forEach((out) => {
                  out.taskId = taskId
                  if (Array.isArray(out)) {
                    inputs.push(...out)
                  } else {
                    inputs.push(out)
                  }
                })
              }
            )
          } else if (pmt_fields.outputs?.length) {
            pmt_fields.outputs.forEach((out) => {
              if (Array.isArray(out)) {
                inputs.push(...out)
              } else {
                inputs.push(out)
              }
            })
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
        outputInfo?.type === 'DICOM_FILE' ||
        outputInfo?.type === 'NIFTI_FILE'
      ) {
        // @ts-expect-error custom pmt_fields
        const pmt_fields = node.pmt_fields as any
        if (pmt_fields) {
          if (pmt_fields.outputs_batch) {
            Object.entries(pmt_fields.outputs_batch).forEach(
              ([taskId, outs]) => {
                outs.forEach((out) => {
                  out.taskId = taskId
                  if (Array.isArray(out)) {
                    outputs.push(...out)
                  } else {
                    outputs.push(out)
                  }
                })
              }
            )
          } else if (pmt_fields.outputs?.length) {
            pmt_fields.outputs.forEach((out) => {
              if (Array.isArray(out)) {
                outputs.push(...out)
              } else {
                outputs.push(out)
              }
            })
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
    toggleEl.classList.add(
      'text-xs',
      'hover:cursor-pointer',
      '!pointer-events-auto'
    )
    div.appendChild(toggleEl)
    const countEl = document.createElement('span')
    countEl.textContent = `0/0`
    countEl.style.visibility = 'hidden'
    countEl.classList.add('text-sm', 'mx-auto')
    div.appendChild(countEl)
    const continueEl = document.createElement('button')
    continueEl.textContent = 'Continue'
    continueEl.style.visibility = 'hidden'
    continueEl.classList.add(
      'text-xs',
      'hover:cursor-pointer',
      '!pointer-events-auto'
    )
    div.appendChild(continueEl)

    const widget = node.addDOMWidget(
      'manual-segmentation',
      'manual-segmentation',
      div,
      {}
    )
    requestAnimationFrame(() => {
      node.setSize([210, 120])
      node.setDirtyCanvas(true)
    })

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

        const inputCount = inputs.filter((input) => !!input.value).length
        const outputCount = outputs.filter((output) => !!output.value).length

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
          if (outputCount > 0) {
            continueEl.style.visibility = 'visible'
            continueEl.onclick = (e) => {
              if (outputCount === inputCount) {
                // pmt_fields.status = 'current'
                pmt_fields.status = 'done'
              }
              let res // resume
              if (pmt_fields.outputs_batch) {
                const btnExp = document.querySelector(
                  '#pmt-action-panel .btn-exp'
                )
                const { json } = btnExp?.fireRightClick?.() || {}
                if (json) {
                  res = {
                    pipelineId: new URLSearchParams(
                      document.location.search
                    ).get('pipelineId'),
                    tasks: Object.keys(pmt_fields.outputs_batch).map(
                      (taskId) => {
                        const workflow = JSON.parse(JSON.stringify(json))
                        workflow.nodes.forEach((node) => {
                          if (node.pmt_fields) {
                            if (node.pmt_fields.outputs_batch) {
                              const outputs =
                                node.pmt_fields.outputs_batch[taskId]
                              node.pmt_fields.outputs =
                                outputs || node.pmt_fields.outputs
                              delete node.pmt_fields.outputs_batch
                            }
                          }
                        })
                        return {
                          taskId,
                          workflow
                        }
                      }
                    )
                  }
                }
              }
              const btnRun = document.querySelector(
                '#pmt-action-panel .btn-run'
              )
              if (res) {
                return btnRun?.continueRunBatch?.(res)
              }
              return btnRun?.['click']?.()
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
