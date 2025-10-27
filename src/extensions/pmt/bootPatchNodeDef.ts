// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useExtensionService } from '@/services/extensionService'
import type { ComfyNodeDefImpl } from '@/stores/nodeDefStore'

const nodeDefsByName = {} as Record<string, ComfyNodeDefImpl>

useExtensionService().registerExtension({
  name: 'PMT.BootPatchNodeDef',
  beforeRegisterNodeDef(nodeType, nodeData) {
    // pmt version patch
    if (nodeData?.description) {
      nodeData.description = ''
    }
    const version = nodeData?.display_name?.split('@v').slice(1).pop()
    if (version) {
      nodeData.display_name = nodeData.display_name.slice(
        0,
        -`@v${version}`.length
      )
      nodeData.PMT_VERSION = version
    }

    // dynamic input/output type patch
    Object.keys(nodeData?.input || {}).forEach((t) => {
      Object.keys(nodeData.input[t]).forEach((inputName) => {
        const input = nodeData.input[t][inputName]

        // for PMT.UploadFile extension
        if (input?.[0] === 'FILE' && input?.[1]?.file_upload === true) {
          const { file_upload, ...options } = input[1]
          nodeData.input[t]['upload'] = [
            'FILEsUPLOAD',
            { widget: inputName, options }
          ]
          return
        }

        // for PMT.UploadDicom extension
        if ('dicom_upload' in (input?.[1] || {})) {
          if (input?.[1]?.dicom_upload === false) {
            nodeData.input[t][inputName] = ['STRING'] // oid text input
          } else if (input?.[1]?.dicom_upload === true) {
            nodeData.input[t]['upload'] = ['DICOMUPLOAD', { widget: inputName }]
          }
          return
        }

        // for PMT.UploadNifti extension
        if ('nifti_upload' in (input?.[1] || {})) {
          if (input?.[1]?.nifti_upload === false) {
            nodeData.input[t][inputName] = ['STRING'] // oid text input
          } else if (input?.[1]?.nifti_upload === true) {
            nodeData.input[t]['upload'] = ['NIFTIUPLOAD', { widget: inputName }]
          }
          return
        }

        // for PMT.UploadImage2 extension
        if ('image_upload2' in (input?.[1] || {})) {
          if (input?.[1]?.image_upload2 === false) {
            nodeData.input[t][inputName] = ['STRING'] // file path input
          } else if (input?.[1]?.image_upload2 === true) {
            nodeData.input[t]['upload'] = [
              'IMAGEUPLOAD2',
              { widget: inputName }
            ]
          }
          return
        }

        // for PMT.UploadJson extension
        if ('json_upload' in (input?.[1] || {})) {
          if (input?.[1]?.json_upload === false) {
            nodeData.input[t][inputName] = ['STRING'] // file path input
          } else if (input?.[1]?.json_upload === true) {
            nodeData.input[t]['upload'] = ['JSONUPLOAD', { widget: inputName }]
          }
          return
        }

        // handle Any / Multi type
        if (t === 'required') {
          if (input?.[0] === 'Any') {
            input[0] = '*'
          }
        }

        // ...
      })

      nodeData.output?.forEach((outputType, o) => {
        // handle Any / Multi type
        if (outputType === 'Any') {
          nodeData.output[o] = '*'
        }

        // ...
      })
    })

    // for PMT.PreviewScalar extension
    if (nodeData?.name === 'preview.json') {
      if (window.$?.fn?.jsonViewer) {
        nodeData.input['required'] = { JSON_FILE: ['JSON_FILE'] }
        nodeData.input_order['required'] = ['JSON_FILE']
      }
    }

    if (nodeData?.name) {
      nodeDefsByName[nodeData.name] = nodeData
    }
  },
  nodeCreated(node, app) {
    const nodeDef = nodeDefsByName[node?.comfyClass] as
      | ComfyNodeDefImpl
      | undefined
    if (!nodeDef) {
      return
    }

    const getNodeDefOutputType = (outputSlot) => {
      return nodeDef.output?.[outputSlot]
    }
    const getNodeDefInputType = (inputName, required = true) => {
      return nodeDef.input?.[required ? 'required' : 'optional']?.[
        inputName
      ]?.[0]
    }
    const getNodeDefInputAcceptTypes = (inputName, required = true) => {
      return nodeDef.input?.[required ? 'required' : 'optional']?.[
        inputName
      ]?.[1]?.acceptTypes
    }

    // console.log(nodeDef.name, nodeDef)

    // handle Any / Multi type
    if (node.comfyClass.startsWith('plugin.')) {
      let hasAnyTypeInputOrOutput = false

      node.inputs.forEach((input, i) => {
        if (input.type === '*' || getNodeDefInputType(input.name) === '*') {
          const acceptTypes = getNodeDefInputAcceptTypes(input.name)
          if (acceptTypes?.length) {
            input.localized_name = `* ${input.name} [${acceptTypes.join(', ')}]`
          } else {
            input.localized_name = `* ${input.name}`
          }
          hasAnyTypeInputOrOutput = true
        }
      })

      node.outputs.forEach((output, o) => {
        if (output.type === '*' || getNodeDefOutputType(o) === '*') {
          output.localized_name = `* ${output.name}`
          hasAnyTypeInputOrOutput = true
        }
      })

      if (hasAnyTypeInputOrOutput) {
        const _onConnectionsChange = node.onConnectionsChange
        node.onConnectionsChange = function (...args) {
          const [type, index, isConnected, link_info, inputOrOutput] = args
          if (link_info) {
            switch (type) {
              case LiteGraph.INPUT: {
                if (isConnected) {
                  if (getNodeDefInputType(inputOrOutput?.name) === '*') {
                    const inputNode = app.graph.getNodeById(link_info.origin_id)
                    const inputNodeOutput = inputNode?.getOutputInfo(
                      link_info.origin_slot
                    )
                    if (inputNodeOutput?.type) {
                      const input = node.inputs[link_info.target_slot]
                      const acceptTypes = getNodeDefInputAcceptTypes(input.name)
                      if (
                        acceptTypes?.length &&
                        acceptTypes.indexOf(inputNodeOutput.type) === -1
                      ) {
                        node.disconnectInput(index)
                        break
                      }
                      input.localized_name = input.name
                      input.type = inputNodeOutput.type
                    }
                    const firstAnyTypeSlot = node.inputs.findIndex(
                      (input) => getNodeDefInputType(input.name) === '*'
                    )
                    if (
                      firstAnyTypeSlot !== -1 &&
                      node.inputs[firstAnyTypeSlot]?.type !== '*'
                    ) {
                      node.outputs.forEach((output, o) => {
                        if (getNodeDefOutputType(o) === '*') {
                          output.localized_name = output.name
                          output.type = node.inputs[firstAnyTypeSlot].type
                          if (output.isConnected) {
                            node.disconnectOutput(o)
                          }
                        }
                      })
                    }
                  }
                } else {
                  if (getNodeDefInputType(inputOrOutput?.name) === '*') {
                    const input = node.inputs[link_info.target_slot]
                    const acceptTypes = getNodeDefInputAcceptTypes(input.name)
                    if (acceptTypes?.length) {
                      input.localized_name = `* ${input.name} [${acceptTypes.join(', ')}]`
                    } else {
                      input.localized_name = `* ${input.name}`
                    }
                    input.type = '*'
                    node.outputs.forEach((output, o) => {
                      if (getNodeDefOutputType(o) === '*') {
                        output.localized_name = `* ${output.name}`
                        output.type = '*'
                        if (output.isConnected) {
                          node.disconnectOutput(o)
                        }
                      }
                    })
                  }
                }
                break
              }
              case LiteGraph.OUTPUT: {
                break
              }
            }
          }
          return _onConnectionsChange?.apply(this, args)
        }
      }
    }

    // ...
  }
})
