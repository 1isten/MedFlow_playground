// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.PreviewVolView',
  nodeCreated(node) {
    if (node?.comfyClass !== 'preview.volview') {
      return
    }
    if (
      document.location.href.includes('projectId=') ||
      document.location.href.includes('pipelineEmbedded=embedded')
    ) {
      return
    }

    const _onAfterGraphConfigured = node.onAfterGraphConfigured
    node.onAfterGraphConfigured = function (...args) {
      if (node.inputs.length > 3) {
        while (node.inputs.length > 3) {
          node.removeInput(node.inputs.length - 1)
        }
      }
      return _onAfterGraphConfigured?.apply(this, args)
    }

    const _onAdded = node.onAdded
    node.onAdded = function (...args) {
      requestAnimationFrame(() => {
        node.setSize([node.size[0], 70])
        node.setDirtyCanvas(true)
      })
      return _onAdded?.apply(this, args)
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
      // serach += `&names=[data.png]&urls=[h3://localhost/file/C:\\sample test data\\data.png]`
      // search += `&names=[file.dcm]&urls=[h3://localhost/file/C:\\sample test data\\test2\\IM_0036.dcm]&uid=test2`
      // search += `&names=[test.zip]&urls=[h3://localhost/file/C:\\sample test data\\test2\\MRI-PROSTATEx-0004.zip]&uid=test&s=0`
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
    // const widget = getiFrameWidget()

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
      const dicomInputNode = node.getInputNode(1)
      const niftiInputNode = node.getInputNode(2)

      let imagePath
      if (imageInputNode && mayPreview) {
        // @ts-expect-error custom pmt_fields
        const pmt_fields = imageInputNode.pmt_fields as any
        if (pmt_fields?.status === 'done') {
          const imageInputs = pmt_fields.outputs || []
          const path = imageInputs[0]?.path || imageInputs[0]?.value
          imagePath = Array.isArray(path) ? path[0] : path
        }
      }
      let dicomPath, dicomOid
      if (dicomInputNode && mayPreview) {
        // @ts-expect-error custom pmt_fields
        const pmt_fields = dicomInputNode.pmt_fields as any
        if (pmt_fields?.status === 'done') {
          const dicomInputs = pmt_fields.outputs || []
          const path = dicomInputs[0]?.path || dicomInputs[0]?.value
          dicomPath = Array.isArray(path) ? path[0] : path
          const oid = dicomInputs[0]?.oid
          dicomOid = Array.isArray(oid) ? oid[0] : oid
        }
      }
      let niftiPath
      if (niftiInputNode && mayPreview) {
        // @ts-expect-error custom pmt_fields
        const pmt_fields = niftiInputNode.pmt_fields as any
        if (pmt_fields?.status === 'done') {
          const niftiInputs = pmt_fields.outputs || []
          const path = niftiInputs[0]?.path || niftiInputs[0]?.value
          niftiPath = Array.isArray(path) ? path[0] : path
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
          let imageUrl = `${VOLVIEW_URL}&names=[file.${ext}]&urls=[h3://localhost/file/${encodeURIComponent(imagePath)}]&layoutName=${'Axial Only'}`
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
              ? `${VOLVIEW_URL}&names=[preview.png]&urls=[h3://localhost/orthanc/instances/${dicomOid}/preview]&layoutName=${'Axial Only'}`
              : `${VOLVIEW_URL}&names=[file.dcm]&urls=[h3://localhost/orthanc/instances/${dicomOid}/file]&uid=${dicomOid}`
            : `${VOLVIEW_URL}&names=[file.dcm]&urls=[h3://localhost/file/${encodeURIComponent(dicomPath)}]&uid=${window.btoa(encodeURIComponent(dicomPath))}&atob=true&prefetch=true`
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
          if (niftiPath.endsWith('.nii')) {
            ext = 'nii'
          } else if (niftiPath.endsWith('.nii.gz')) {
            ext = 'nii.gz'
          }
          let imageUrl = `${VOLVIEW_URL}&names=[file.${ext}]&urls=[h3://localhost/file/${encodeURIComponent(niftiPath)}]&layoutName=${'Quad View'}`
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
          let imageUrl = VOLVIEW_URL && 'about:blank'
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

    const _onConnectInput = node.onConnectInput
    node.onConnectInput = function (...args) {
      const [target_slot, type, output, inputNode, origin_slot] = args
      const pmt_fields = inputNode.pmt_fields as any
      if (pmt_fields?.status === 'done') {
        const pmt_fields = node.pmt_fields as any
        if (pmt_fields) {
          if (pmt_fields.status !== 'current' || pmt_fields.status !== 'done') {
            pmt_fields.status = 'current'
          }
        }
      }
      return _onConnectInput?.apply(this, args)
    }
  }
})
