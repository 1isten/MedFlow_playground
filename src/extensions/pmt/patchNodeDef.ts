// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.PatchNodeDef',
  beforeRegisterNodeDef(nodeType, nodeData) {
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
  }
})
