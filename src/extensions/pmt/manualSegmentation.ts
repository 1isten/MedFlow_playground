// @ts-strict-ignore
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.ManualSegmentation',
  nodeCreated(node) {
    if (node?.comfyClass !== 'manual.segmentation') {
      return
    }

    const _onDrawBackground = node.onDrawBackground
    node.onDrawBackground = function (...args) {
      // @ts-expect-error custom pmt_fields
      const pmt_fields = node.pmt_fields as any
      const isWaiting = pmt_fields?.status === 'waiting'

      const dicomInputNode = node.getInputNode(0)

      let dicomPath, dicomOid
      if (dicomInputNode && isWaiting) {
        // @ts-expect-error custom pmt_fields
        const pmt_fields = dicomInputNode.pmt_fields as any
        if (pmt_fields?.status === 'done') {
          const dicomInputs = pmt_fields.outputs || []
          if (Array.isArray(dicomInputs[0]?.path)) {
            dicomPath = dicomInputs[0]?.path?.[0]
          } else {
            dicomPath = dicomInputs[0]?.path
          }
          if (Array.isArray(dicomInputs[0]?.oid)) {
            dicomOid = dicomInputs[0]?.oid?.[0]
          } else {
            dicomOid = dicomInputs[0]?.oid
          }
        }
      }

      if (dicomPath || dicomOid) {
        console.log('waiting...', '0/1', {
          oid: dicomOid,
          path: dicomPath
        })

        // ...
      }

      return _onDrawBackground?.apply(this, args)
    }
  }
})
