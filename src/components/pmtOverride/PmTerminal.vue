<template>
  <div class="bg-black h-full w-full">
    <BaseTerminal @created="terminalCreated" />
  </div>
</template>

<script setup lang="ts">
import { type ITerminalAddon, Terminal } from '@xterm/xterm'
import type { Raw, Ref } from 'vue'

import BaseTerminal from '@/components/bottomPanel/tabs/terminal/BaseTerminal.vue'
import type { useTerminal } from '@/composables/bottomPanelTabs/useTerminal'

const emit = defineEmits<{
  'terminal-created': [
    { terminal: Raw<Terminal>; searchAddon?: ITerminalAddon }
  ]
}>()

const terminalCreated = (
  { terminal, useAutoSize }: ReturnType<typeof useTerminal>,
  root: Ref<HTMLElement | undefined>
) => {
  terminal.options.fontSize = 12
  terminal.options.allowProposedApi = true

  let searchAddon: ITerminalAddon | undefined
  // @ts-expect-error static @xterm/addon-search
  if (window['SearchAddon']) {
    // @ts-expect-error static @xterm/addon-search
    searchAddon = new window.SearchAddon.SearchAddon() as ITerminalAddon
    terminal.loadAddon(searchAddon)
  }

  useAutoSize({
    root,
    autoRows: true,
    autoCols: true,
    minCols: 80,
    onResize: async () => {
      // If we aren't visible, don't resize
      if (!terminal.element?.offsetParent) return

      // ...
    }
  })

  emit('terminal-created', { terminal, searchAddon })
}
</script>

<style scoped>
:deep(.p-terminal) .xterm {
  overflow-x: auto;
}

:deep(.p-terminal) .xterm-screen {
  background-color: black;
  overflow-y: hidden;
}
</style>
