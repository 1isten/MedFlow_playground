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

        // ...

        // TODO: handle Any type ...

        // TODO: handle Multi type ...

        // ...
      })

      nodeData.output?.forEach((outputType, o) => {
        // ...
        // TODO: handle Any type ...
        // TODO: handle Multi type ...
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

    // console.log(nodeDef.name, nodeDef)

    // ...
  }
})
