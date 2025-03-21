// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useExtensionService } from '@/services/extensionService'

useExtensionService().registerExtension({
  name: 'PMT.TestUi',
  nodeCreated(node) {
    if (node?.comfyClass !== 'plugin.test_plugin_name.test_func') {
      return
    }

    window.addEventListener('message', (e) => {
      if (e.data?.from === 'test-id') {
        console.log('msg from iframe:', e.data.msg)
      }
    })
    const iframe = document.createElement('iframe')
    iframe.src = 'pipes/test_iframe_page.html'
    const widget = node.addDOMWidget('test-ui', 'test-ui', iframe, {})
    console.log(node.comfyClass, widget)

    requestAnimationFrame(() => {
      node.setSize([500, 500])
      node.setDirtyCanvas(true)
    })

    const _onDblClick = node.onDblClick
    node.onDblClick = function (...args) {
      iframe.contentWindow.postMessage(
        { from: 'test-id-parent', msg: 'node double clicked' },
        '*'
      )
      return _onDblClick?.apply(this, args)
    }

    const _onDrawBackground = node.onDrawBackground
    node.onDrawBackground = function (...args) {
      // ...
      return _onDrawBackground?.apply(this, args)
    }
  }
})
