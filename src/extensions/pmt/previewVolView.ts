// @ts-strict-ignore
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.PreviewVolView',
  nodeCreated(node) {
    if (node?.comfyClass !== 'preview.volview') {
      return
    }

    const getVolViewUrl = () => {
      // eslint-disable-next-line prefer-const
      let { origin, port, pathname } = document.location
      if (origin === 'file://') {
        pathname = pathname.replace('comfyui/', 'volview/')
      } else {
        if (port) {
          origin = origin.replace(port, `${+port - 1}`)
        }
        // pathname = pathname.replace('comfyui/', '') + 'volview/'
      }
      // eslint-disable-next-line prefer-const
      let search = `?uiMode=lite`
      // serach += `&names=[data.png]&urls=[connect-file://localhost/C:\\sample test data\\data.png]`
      // search += `&names=[file.dcm]&urls=[connect-file://localhost/C:\\sample test data\\test2\\IM_0036.dcm]&uid=test2`
      // search += `&names=[test.zip]&urls=[connect-file://localhost/C:\\sample test data\\test2\\MRI-PROSTATEx-0004.zip]&uid=test&slice=0`
      return new URL(origin + pathname + search).href
    }
    const VOLVIEW_URL = getVolViewUrl()

    const getiFrameWidget = () => {
      let widget = node.widgets?.find((w) => w.name === 'preview-volview')
      if (!widget) {
        const div = document.createElement('div')
        div.classList.add('relative', 'overflow-hidden')
        div.innerHTML = `
          <div class="absolute inset-0 overflow-hidden">
            <iframe src="${VOLVIEW_URL}" frameborder="0" width="100%" height="100%"></iframe>
          </div>
        `
        widget = node.addDOMWidget(
          'preview-volview',
          'preview-volview',
          div,
          {}
        )
      }
      return widget
    }

    const _onDrawBackground = node.onDrawBackground
    node.onDrawBackground = function (...args) {
      // @ts-expect-error custom pmt_fields
      const pmt_fields = node.pmt_fields as any
      const mayPreview = [
        // 'pending',
        'current',
        'done'
      ].includes(pmt_fields?.status)

      const imageInputNode = node.getInputNode(0)
      const dicomInputNode = node.getInputNode(2) || node.getInputNode(1)
      const niftiInputNode = node.getInputNode(3)

      let imagePath
      if (imageInputNode && mayPreview) {
        // @ts-expect-error custom pmt_fields
        const pmt_fields = imageInputNode.pmt_fields as any
        if (pmt_fields?.status === 'done') {
          const imageInputs = pmt_fields.outputs || []
          if (Array.isArray(imageInputs[0]?.path)) {
            imagePath = imageInputs[0]?.path?.[0]
          } else {
            imagePath = imageInputs[0]?.path
          }
        }
      }
      let dicomPath, dicomOid
      if (dicomInputNode && mayPreview) {
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
      let niftiPath
      if (niftiInputNode && mayPreview) {
        // @ts-expect-error custom pmt_fields
        const pmt_fields = niftiInputNode.pmt_fields as any
        if (pmt_fields?.status === 'done') {
          const niftiInputs = pmt_fields.outputs || []
          if (Array.isArray(niftiInputs[0]?.path)) {
            niftiPath = niftiInputs[0]?.path?.[0]
          } else {
            niftiPath = niftiInputs[0]?.path
          }
        }
      }

      if (imagePath) {
        const widget = getiFrameWidget()
        const iframe = widget?.element?.querySelector('iframe')
        if (iframe) {
          let ext = 'png'
          if (imagePath.endsWith('.jpg')) {
            ext = 'jpg'
          } else if (imagePath.endsWith('.jpeg')) {
            ext = 'jpeg'
          }
          let imageUrl = `${VOLVIEW_URL}&layoutName=${'Axial Only'}&names=[file.${ext}]&urls=[connect-file://localhost/${imagePath}]`
          imageUrl = new URL(imageUrl).href
          if (iframe.src !== imageUrl) {
            if (pmt_fields.status !== 'done') {
              pmt_fields.status = 'done'
            }
            node.setSize([400, 400])
            node.setDirtyCanvas(true)
            widget.element.style.removeProperty('visibility')
            iframe.src = imageUrl
            console.log('[volview] link:', imageUrl)
          }
        }
      } else if (dicomPath || dicomOid) {
        const widget = getiFrameWidget()
        const iframe = widget?.element?.querySelector('iframe')
        if (iframe) {
          const decode = false
          let imageUrl = dicomOid
            ? decode
              ? `${VOLVIEW_URL}&layoutName=${'Axial Only'}&names=[preview.png]&urls=[connect://localhost/orthanc/instances/${dicomOid}/preview]`
              : `${VOLVIEW_URL}&layoutName=${'Axial Only'}&names=[file.dcm]&urls=[connect://localhost/orthanc/instances/${dicomOid}/file]`
            : `${VOLVIEW_URL}&layoutName=${'Axial Only'}&names=[file.dcm]&urls=[connect-file://localhost/${dicomPath}]`
          imageUrl = new URL(imageUrl).href
          if (iframe.src !== imageUrl) {
            if (pmt_fields.status !== 'done') {
              pmt_fields.status = 'done'
            }
            node.setSize([400, 400])
            node.setDirtyCanvas(true)
            widget.element.style.removeProperty('visibility')
            iframe.src = imageUrl
            console.log('[volview] link:', imageUrl)
          }
        }
      } else if (niftiPath) {
        const widget = getiFrameWidget()
        const iframe = widget?.element?.querySelector('iframe')
        if (iframe) {
          let ext = 'nii.gz'
          if (imagePath.endsWith('.nii')) {
            ext = 'nii'
          } else if (imagePath.endsWith('.nii.gz')) {
            ext = 'nii.gz'
          }
          let imageUrl = `${VOLVIEW_URL}&layoutName=${'Quad View'}&names=[file.${ext}]&urls=[connect-file://localhost/${niftiPath}]`
          imageUrl = new URL(imageUrl).href
          if (iframe.src !== imageUrl) {
            if (pmt_fields.status !== 'done') {
              pmt_fields.status = 'done'
            }
            node.setSize([512, 512])
            node.setDirtyCanvas(true)
            widget.element.style.removeProperty('visibility')
            iframe.src = imageUrl
            console.log('[volview] link:', imageUrl)
          }
        }
      } else {
        const widget = node.widgets?.[0]
        const iframe =
          widget && widget.name === 'preview-volview'
            ? widget.element?.querySelector('iframe')
            : null
        if (iframe) {
          let imageUrl = `${VOLVIEW_URL}&layoutName=${'Axial Only'}`
          imageUrl = new URL(imageUrl).href
          if (iframe.src !== imageUrl) {
            if (pmt_fields?.status === 'done') {
              pmt_fields.status = ''
            }
            widget.element.style.setProperty('visibility', 'hidden')
            node.setSize([300, 100])
            node.setDirtyCanvas(true)
            iframe.src = imageUrl
          }
        }
      }
      return _onDrawBackground?.apply(this, args)
    }
  }
})
