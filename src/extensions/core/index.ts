import { isCloud } from '@/platform/distribution/types'

// import '../pmt/testUi'
import '../pmt/bootPatchNodeDef'
import '../pmt/manualQna'
import '../pmt/manualSegmentation'
import '../pmt/previewScalar'
import '../pmt/previewVolView'
import '../pmt/statusFloat'
import '../pmt/toExport'
import '../pmt/uploadDicom'
import '../pmt/uploadFile'
import '../pmt/uploadImage'
import '../pmt/uploadJson'
import '../pmt/uploadNifti'
import '../pmt/uploadStudy'
// ...
import './clipspace'
import './contextMenuFilter'
import './dynamicPrompts'
import './editAttention'
import './electronAdapter'
import './groupNode'
import './groupNodeManage'
import './groupOptions'
import './load3d'
import './maskeditor'
import './nodeTemplates'
import './noteNode'
import './previewAny'
import './rerouteNode'
import './saveImageExtraOutput'
import './saveMesh'
import './selectionBorder'
import './simpleTouchSupport'
import './slotDefaults'
import './uploadAudio'
import './uploadImage'
import './webcamCapture'
import './widgetInputs'

// Cloud-only extensions - tree-shaken in OSS builds
if (isCloud) {
  await import('./cloudRemoteConfig')
  await import('./cloudBadges')
  await import('./cloudSessionCookie')

  if (window.__CONFIG__?.subscription_required) {
    await import('./cloudSubscription')
  }
}
