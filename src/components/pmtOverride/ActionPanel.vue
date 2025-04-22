<template>
  <teleport :to="'.comfyui-body-bottom'">
    <Panel v-show="!readonlyView" id="pmt-action-panel">
      <ButtonGroup>
        <Button
          v-if="stoppable ? !loading && !running : true"
          class="btn-run"
          size="small"
          :aria-label="'Run'"
          :aria-haspopup="true"
          :aria-controls="'btn-run-menu'"
          icon="pi pi-play-circle"
          severity="secondary"
          :loading="running"
          :disabled="loading || saving || deleting"
          @click="run"
          @contextmenu.prevent="
            !!pipelineId &&
              !loading &&
              !saving &&
              !running &&
              !deleting &&
              runMenu.show($event)
          "
        />
        <Button
          v-else-if="!loading"
          class="btn-run-stop"
          size="small"
          :aria-label="'Stop'"
          icon="pi pi-stop-circle"
          severity="danger"
          :loading="false"
          :disabled="pausing"
          @click="stop"
          @contextmenu.prevent.stop
        />
        <Menu id="btn-run-menu" ref="runMenu" :model="runMenuItems" popup />
        <Button
          v-if="!!pipelineId"
          class="btn-pip"
          size="small"
          :title="pipeline.description"
          :label="loading ? '' : (isNewPipeline ? '*' : '') + pipeline.name"
          icon="pi pi-circle-fill"
          severity="secondary"
          :style="{ color: pipeline.color }"
          :loading="loading || running"
          :disabled="loading || running || saving || deleting"
          @click="togglePipOver"
          @contextmenu.prevent.stop
        />
        <Popover ref="pipOver">
          <div class="flex flex-col">
            <div class="flex items-center">
              <InputGroup>
                <InputGroupAddon>
                  <label
                    class="relative flex justify-center items-center overflow-hidden"
                  >
                    <input
                      v-model="pipelineColor"
                      type="color"
                      class="absolute inset-0 opacity-0 hover:cursor-pointer"
                      :disabled="false"
                    />
                    <i
                      class="pi pi-circle-fill"
                      :style="{ color: pipelineColor }"
                    ></i>
                  </label>
                </InputGroupAddon>
                <InputText
                  v-model="pipelineName"
                  placeholder="Enter Name"
                  type="text"
                  :style="{ color: pipelineColor }"
                  :readonly="false"
                />
              </InputGroup>
              <Button
                v-if="!pipeline.readonly"
                ref="delBtn"
                class="btn-del ml-2"
                :aria-label="'Delete'"
                icon="pi pi-trash"
                text
                :severity="delBtnHovered ? 'danger' : 'secondary'"
                :loading="deleting"
                :disabled="
                  loading ||
                  isNewPipeline ||
                  running ||
                  saving ||
                  pipeline.readonly
                "
                @click="confirmDelete"
              />
            </div>
            <div class="flex items-start mt-2">
              <Textarea
                v-model="pipelineDescription"
                placeholder="Description..."
                class="w-full resize-none"
                :auto-resize="false"
                :rows="2"
                :readonly="false"
              />
            </div>
            <div class="flex items-center justify-end mt-3">
              <Button
                class="ml-2"
                :label="'Cancel'"
                outlined
                severity="secondary"
                size="small"
                :loading="false"
                :disabled="false"
                @click="togglePipOver"
              />
              <Button
                class="ml-2"
                :label="'Change'"
                severity="contrast"
                size="small"
                :loading="false"
                :disabled="
                  !pipelineName || saving || deleting || pipeline.readonly
                "
                @click="commitPipEdit"
              />
            </div>
          </div>
        </Popover>
        <Button
          v-if="!loading"
          v-show="false"
          class="btn-term"
          size="small"
          :aria-label="'Terminal'"
          icon="pi pi-code"
          :severity="showTerminal ? 'primary' : 'secondary'"
          :loading="false"
          :disabled="loading || deleting"
          @click="toggleTerminal()"
          @contextmenu.prevent.stop
        />
        <Button
          v-if="!loading && !!pipelineId"
          class="btn-sav"
          size="small"
          :aria-label="'Save'"
          icon="pi pi-save"
          severity="secondary"
          :loading="saving"
          :disabled="loading || running || deleting || pipeline.readonly"
          @click="confirmSave"
          @contextmenu.prevent.stop
        />
        <Button
          v-if="!loading"
          class="btn-exp"
          size="small"
          :aria-label="'Export'"
          icon="pi pi-download"
          severity="secondary"
          :loading="false"
          :disabled="loading || deleting"
          @click="exportJson"
          @contextmenu.prevent="exportJson(false)"
        />
      </ButtonGroup>
      <ConfirmDialog
        group="confirm_deletion"
        dismissable-mask
        :draggable="false"
      />
      <ConfirmPopup group="confirm_saving" />
    </Panel>
    <div
      class="terminal-container pointer-events-none"
      :class="showTerminal ? 'z-[9999]' : '-z-[1]'"
    >
      <div
        id="terminal"
        :class="showTerminal ? 'pointer-events-auto' : 'invisible'"
      ></div>
    </div>
  </teleport>
</template>

<script setup>
/* eslint-disable @typescript-eslint/no-floating-promises */
import { LGraphCanvas, LiteGraph } from '@comfyorg/litegraph'
import { useElementHover, useLocalStorage, useThrottleFn } from '@vueuse/core'
import { merge } from 'lodash'
import Button from 'primevue/button'
import ButtonGroup from 'primevue/buttongroup'
import ConfirmDialog from 'primevue/confirmdialog'
import ConfirmPopup from 'primevue/confirmpopup'
import InputGroup from 'primevue/inputgroup'
import InputGroupAddon from 'primevue/inputgroupaddon'
import InputText from 'primevue/inputtext'
import Menu from 'primevue/menu'
import Panel from 'primevue/panel'
import Popover from 'primevue/popover'
import Textarea from 'primevue/textarea'
import { useConfirm } from 'primevue/useconfirm'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { NODE_STATUS_COLOR, ParsedLevel } from '@/constants/pmtCore'
import { app as comfyApp } from '@/scripts/app'
import { useWorkflowService } from '@/services/workflowService'
import { useCommandStore } from '@/stores/commandStore'
import { SYSTEM_NODE_DEFS, useNodeDefStore } from '@/stores/nodeDefStore'
import { useToastStore } from '@/stores/toastStore'
import { useWorkflowStore } from '@/stores/workflowStore'

let decodeMultiStream = (stream) => {
  console.warn('MessagePack not found')
  return stream
}

const nodeDefStore = useNodeDefStore()
const workflowStore = useWorkflowStore()
const workflowService = useWorkflowService()

const route = useRoute()
const router = useRouter()

const {
  datasetId,
  projectId,
  taskId,
  pipelineId,
  pipelineEmbedded,
  pipelineReadonly,
  // ...
  workflow_name
} = route.query
const pipelineName = ref('New Workflow')
const pipelineDescription = ref('')
const pipelineColor = ref('#FFFFFF')

const embeddedView = computed(() => pipelineEmbedded === 'embedded')
const readonlyView = computed(() => pipelineReadonly === 'readonly')

const pipelines = useLocalStorage('pipelines', pipelineId ? [] : null)
const pipeline = ref({
  id: pipelineId,
  name: pipelineName.value,
  description: pipelineDescription.value,
  color: pipelineColor.value,
  readonly: false
})
const pipelineWorkflow = computed(() =>
  pipeline.value.workflow ? JSON.parse(pipeline.value.workflow) : null
)
const isNewPipeline = computed(() => !pipeline.value.workflow)

const commitPipEdit = (e) => {
  pipeline.value.name = pipelineName.value
  pipeline.value.description = pipelineDescription.value
  pipeline.value.color = pipelineColor.value
  togglePipOver(e)
}

const loading = ref(!!pipeline.value?.id)

const nodesSelected = shallowRef([])
const nodesSelectedCount = computed(() => nodesSelected.value.length)
const updateNodesSelected = useThrottleFn(() => {
  nodesSelected.value = comfyApp.graph.nodes.filter((node) => node.selected)
}, 100)

const driverObjs = []
function highlight(element, popover = {}, config, step) {
  const driver = window.driver?.js?.driver
  if (!driver) return

  const driverObj = driver(config)

  if (typeof element === 'string') {
    element = document.querySelector(element)
  }
  if (!element || !element.offsetParent) {
    element = undefined
  }
  if (step !== undefined) {
    driverObj.drive(step)
  } else {
    driverObj.highlight({
      element,
      popover: {
        title: popover.title,
        description: popover.description,
        side: popover.side
      }
    })
  }

  return driverObj
}

const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2NvdW50X2lkIjoxLCJjb2RlIjoiMjQ2NzgiLCJhZG1pbiI6MSwiZXhwaXJlX3RpbWUiOjB9.G-YaphxirG6zJ9EGeHdb-70qpBQEY-199E-nvtua06k'

const presets = {
  none: '{"last_node_id":0,"last_link_id":0,"nodes":[],"links":[],"groups":[],"config":{},"extra":{"ds":{"scale":1,"offset":[0,0]}},"version":0.4}',
  default: `{"last_node_id":4,"last_link_id":4,"nodes":[{"id":1,"type":"rag_llm.prompt","pos":[105.33335876464844,322.6666564941406],"size":[400,400],"flags":{},"order":0,"mode":0,"inputs":[{"name":"history","type":"LOOP","link":4,"shape":7},{"name":"text","type":"STRING","link":null,"widget":{"name":"text"}},{"name":"optional_text","type":"STRING","link":null,"widget":{"name":"optional_text"},"shape":7}],"outputs":[{"name":"prompt","type":"STRING","links":[1],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.prompt"},"widgets_values":["","hub","rlm/rag-prompt","You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.\\nQuestion: {question} \\nContext: {context} \\nAnswer:","{messages}","",null],"pmt_fields":{"args":{"type":"hub","hub_link":"rlm/rag-prompt","system":"You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.\\nQuestion: {question} \\nContext: {context} \\nAnswer:","human":"{messages}","prompt_template_vars":{"question":"","context":"","messages":""}},"status":""}},{"id":2,"type":"rag_llm.model","pos":[559.333251953125,333.3333435058594],"size":[315,106],"flags":{},"order":1,"mode":0,"inputs":[{"name":"text","type":"STRING","link":1,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[2],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.model"},"widgets_values":["","gpt-4o-mini",0.5],"pmt_fields":{"args":{"model_name":"gpt-4o-mini","temperature":0.5},"status":""}},{"id":3,"type":"rag_llm.response","pos":[922,137.3333282470703],"size":[315,126],"flags":{},"order":2,"mode":0,"inputs":[{"name":"text","type":"STRING","link":2,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[3],"slot_index":0},{"name":"history","type":"LOOP","links":[4],"slot_index":1}],"properties":{"Node name for S&R":"rag_llm.response"},"widgets_values":["",true,10000],"pmt_fields":{"args":{"enable_history":true,"max_tokens":10000},"status":""}},{"id":4,"type":"rag_llm.preview_text","pos":[1282.6666259765625,272.0000305175781],"size":[300,200],"flags":{},"order":3,"mode":0,"inputs":[{"name":"text","type":"STRING","link":3,"widget":{"name":"text"}}],"outputs":[],"properties":{"Node name for S&R":"rag_llm.preview_text"},"widgets_values":["",null],"pmt_fields":{"args":{},"status":""}}],"links":[[1,1,0,2,0,"STRING"],[2,2,0,3,0,"STRING"],[3,3,0,4,0,"STRING"],[4,3,1,1,0,"LOOP"]],"groups":[],"config":{},"extra":{"ds":{"scale":1,"offset":[0,0]}},"version":0.4}`,
  rag: `{"last_node_id":7,"last_link_id":7,"nodes":[{"id":5,"type":"rag_llm.knowledge","pos":[-1120.1199951171875,387.8730773925781],"size":[400,200],"flags":{},"order":0,"mode":0,"inputs":[],"outputs":[{"name":"kownledge","type":"STRING","links":[5],"slot_index":0},{"name":"log","type":"STRING","links":null}],"properties":{"Node name for S&R":"rag_llm.knowledge"},"widgets_values":["web",""],"pmt_fields":{"args":{"type":"web","sources":""},"status":""}},{"id":6,"type":"rag_llm.text_splitter","pos":[-661.6609497070312,327.746826171875],"size":[315,154],"flags":{},"order":1,"mode":0,"inputs":[{"name":"text","type":"STRING","link":5,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[6],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.text_splitter"},"widgets_values":["","token",350,0,""],"pmt_fields":{"args":{"type":"token","chunk_size":350,"chunk_overlap":0,"separators":""},"status":""}},{"id":7,"type":"rag_llm.vector_db","pos":[-292.3180236816406,386.7991638183594],"size":[315,130],"flags":{},"order":2,"mode":0,"inputs":[{"name":"text","type":"STRING","link":6,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[7],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.vector_db"},"widgets_values":["","chroma","openai",3],"pmt_fields":{"args":{"type":"chroma","embedding_type":"openai","retrieve_num":3},"status":""}},{"id":1,"type":"rag_llm.prompt","pos":[105.33335876464844,322.6666564941406],"size":[400,400],"flags":{},"order":3,"mode":0,"inputs":[{"name":"history","type":"LOOP","link":4,"shape":7},{"name":"text","type":"STRING","link":7,"widget":{"name":"text"}},{"name":"optional_text","type":"STRING","link":null,"widget":{"name":"optional_text"},"shape":7}],"outputs":[{"name":"prompt","type":"STRING","links":[1],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.prompt"},"widgets_values":["","hub","rlm/rag-prompt","You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.\\nQuestion: {question} \\nContext: {context} \\nAnswer:","{messages}","",null],"pmt_fields":{"args":{"type":"hub","hub_link":"rlm/rag-prompt","system":"You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.\\nQuestion: {question} \\nContext: {context} \\nAnswer:","human":"{messages}","prompt_template_vars":{"question":"","context":"","messages":""}},"status":""}},{"id":2,"type":"rag_llm.model","pos":[559.333251953125,333.3333435058594],"size":[315,106],"flags":{},"order":4,"mode":0,"inputs":[{"name":"text","type":"STRING","link":1,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[2],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.model"},"widgets_values":["","gpt-4o-mini",0.5],"pmt_fields":{"args":{"model_name":"gpt-4o-mini","temperature":0.5},"status":""}},{"id":3,"type":"rag_llm.response","pos":[922,137.3333282470703],"size":[315,126],"flags":{},"order":5,"mode":0,"inputs":[{"name":"text","type":"STRING","link":2,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[3],"slot_index":0},{"name":"history","type":"LOOP","links":[4],"slot_index":1}],"properties":{"Node name for S&R":"rag_llm.response"},"widgets_values":["",true,10000],"pmt_fields":{"args":{"enable_history":true,"max_tokens":10000},"status":""}},{"id":4,"type":"rag_llm.preview_text","pos":[1282.6666259765625,272.0000305175781],"size":[300,200],"flags":{},"order":6,"mode":0,"inputs":[{"name":"text","type":"STRING","link":3,"widget":{"name":"text"}}],"outputs":[],"properties":{"Node name for S&R":"rag_llm.preview_text"},"widgets_values":["",null],"pmt_fields":{"args":{},"status":""}}],"links":[[1,1,0,2,0,"STRING"],[2,2,0,3,0,"STRING"],[3,3,0,4,0,"STRING"],[4,3,1,1,0,"LOOP"],[5,5,0,6,0,"STRING"],[6,6,0,7,0,"STRING"],[7,7,0,1,1,"STRING"]],"groups":[],"config":{},"extra":{"ds":{"scale":1,"offset":[0,0]}},"version":0.4}`,
  crag: `{"last_node_id":12,"last_link_id":14,"nodes":[{"id":5,"type":"rag_llm.knowledge","pos":[-1795.305419921875,219.73934936523438],"size":[400,200],"flags":{},"order":0,"mode":0,"inputs":[],"outputs":[{"name":"kownledge","type":"STRING","links":[5],"slot_index":0},{"name":"log","type":"STRING","links":null}],"properties":{"Node name for S&R":"rag_llm.knowledge"},"widgets_values":["web",""],"pmt_fields":{"args":{"type":"web","sources":""},"status":""}},{"id":6,"type":"rag_llm.text_splitter","pos":[-1314.37060546875,248.50851440429688],"size":[315,154],"flags":{},"order":1,"mode":0,"inputs":[{"name":"text","type":"STRING","link":5,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[6],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.text_splitter"},"widgets_values":["","token",350,0,""],"pmt_fields":{"args":{"type":"token","chunk_size":350,"chunk_overlap":0,"separators":""},"status":""}},{"id":7,"type":"rag_llm.vector_db","pos":[-879.9946899414062,331.4211730957031],"size":[315,130],"flags":{},"order":2,"mode":0,"inputs":[{"name":"text","type":"STRING","link":6,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[8],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.vector_db"},"widgets_values":["","chroma","openai",3],"pmt_fields":{"args":{"type":"chroma","embedding_type":"openai","retrieve_num":3},"status":""}},{"id":8,"type":"rag_llm.prompt.grade_docs","pos":[-1945.737548828125,588.7113647460938],"size":[400,400],"flags":{},"order":3,"mode":0,"inputs":[{"name":"history","type":"LOOP","link":null,"shape":7},{"name":"text","type":"STRING","link":8,"widget":{"name":"text"}},{"name":"optional_text","type":"STRING","link":null,"widget":{"name":"optional_text"},"shape":7}],"outputs":[{"name":"prompt","type":"STRING","links":[9],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.prompt.grade_docs"},"widgets_values":["","customize","","You are a document retrieval evaluator that's responsible for checking the relevancy of a retrieved document to the user's question.\\n\\nIf the document contains keyword(s) or semantic meaning related to the question, grade it as relevant.\\n\\nOutput a binary score 'yes' or 'no' to indicate whether the document is relevant to the question.","Retrieved document:\\n\\n{document}\\n\\nUser question: {question}","",null],"pmt_fields":{"args":{"type":"customize","hub_link":"","system":"You are a document retrieval evaluator that's responsible for checking the relevancy of a retrieved document to the user's question.\\n\\nIf the document contains keyword(s) or semantic meaning related to the question, grade it as relevant.\\n\\nOutput a binary score 'yes' or 'no' to indicate whether the document is relevant to the question.","human":"Retrieved document:\\n\\n{document}\\n\\nUser question: {question}","prompt_template_vars":{"document":"","question":""}},"status":""}},{"id":9,"type":"rag_llm.model.grade_docs","pos":[-1483.99658203125,621.377685546875],"size":[315,106],"flags":{},"order":4,"mode":0,"inputs":[{"name":"text","type":"STRING","link":9,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[10,11],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.model.grade_docs"},"widgets_values":["","gpt-4o-mini",0.5],"pmt_fields":{"args":{"model_name":"gpt-4o-mini","temperature":0.5},"status":""}},{"id":10,"type":"rag_llm.prompt.transform_query","pos":[-1117.678466796875,694.4251098632812],"size":[400,400],"flags":{},"order":5,"mode":0,"inputs":[{"name":"history","type":"LOOP","link":null,"shape":7},{"name":"text","type":"STRING","link":11,"widget":{"name":"text"}},{"name":"optional_text","type":"STRING","link":null,"widget":{"name":"optional_text"},"shape":7}],"outputs":[{"name":"prompt","type":"STRING","links":[12],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.prompt.transform_query"},"widgets_values":["","customize","","You are a question re-writer that converts an input question to a better version that is optimized for web search.\\n\\nLook at the input and try to reason about the underlying semantic intent / meaning.","Here is the initial question:\\n\\n{question}\\n\\nFormulate an improved question.","",null],"pmt_fields":{"args":{"type":"customize","hub_link":"","system":"You are a question re-writer that converts an input question to a better version that is optimized for web search.\\n\\nLook at the input and try to reason about the underlying semantic intent / meaning.","human":"Here is the initial question:\\n\\n{question}\\n\\nFormulate an improved question.","prompt_template_vars":{"question":""}},"status":""}},{"id":11,"type":"rag_llm.model.transform_query","pos":[-655.8319091796875,621.2080688476562],"size":[315,106],"flags":{},"order":6,"mode":0,"inputs":[{"name":"text","type":"STRING","link":12,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[13],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.model.transform_query"},"widgets_values":["","gpt-4o-mini",0.5],"pmt_fields":{"args":{"model_name":"gpt-4o-mini","temperature":0.5},"status":""}},{"id":12,"type":"rag_llm.web_search","pos":[-282.0015563964844,544.7903442382812],"size":[315,82],"flags":{},"order":7,"mode":0,"inputs":[{"name":"text","type":"STRING","link":13,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[14],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.web_search"},"widgets_values":["",57],"pmt_fields":{"args":{"k":57},"status":""}},{"id":1,"type":"rag_llm.prompt","pos":[105.33335876464844,322.6666564941406],"size":[400,400],"flags":{},"order":8,"mode":0,"inputs":[{"name":"history","type":"LOOP","link":4,"shape":7},{"name":"text","type":"STRING","link":10,"widget":{"name":"text"}},{"name":"optional_text","type":"STRING","link":14,"widget":{"name":"optional_text"},"shape":7}],"outputs":[{"name":"prompt","type":"STRING","links":[1],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.prompt"},"widgets_values":["","hub","rlm/rag-prompt","You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.\\nQuestion: {question} \\nContext: {context} \\nAnswer:","{messages}","",null],"pmt_fields":{"args":{"type":"hub","hub_link":"rlm/rag-prompt","system":"You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.\\nQuestion: {question} \\nContext: {context} \\nAnswer:","human":"{messages}","prompt_template_vars":{"question":"","context":"","messages":""}},"status":""}},{"id":2,"type":"rag_llm.model","pos":[559.333251953125,333.3333435058594],"size":[315,106],"flags":{},"order":9,"mode":0,"inputs":[{"name":"text","type":"STRING","link":1,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[2],"slot_index":0}],"properties":{"Node name for S&R":"rag_llm.model"},"widgets_values":["","gpt-4o-mini",0.5],"pmt_fields":{"args":{"model_name":"gpt-4o-mini","temperature":0.5},"status":""}},{"id":3,"type":"rag_llm.response","pos":[922,137.3333282470703],"size":[315,126],"flags":{},"order":10,"mode":0,"inputs":[{"name":"text","type":"STRING","link":2,"widget":{"name":"text"}}],"outputs":[{"name":"text","type":"STRING","links":[3],"slot_index":0},{"name":"history","type":"LOOP","links":[4],"slot_index":1}],"properties":{"Node name for S&R":"rag_llm.response"},"widgets_values":["",true,10000],"pmt_fields":{"args":{"enable_history":true,"max_tokens":10000},"status":""}},{"id":4,"type":"rag_llm.preview_text","pos":[1282.6666259765625,272.0000305175781],"size":[300,200],"flags":{},"order":11,"mode":0,"inputs":[{"name":"text","type":"STRING","link":3,"widget":{"name":"text"}}],"outputs":[],"properties":{"Node name for S&R":"rag_llm.preview_text"},"widgets_values":["",null],"pmt_fields":{"args":{},"status":""}}],"links":[[1,1,0,2,0,"STRING"],[2,2,0,3,0,"STRING"],[3,3,0,4,0,"STRING"],[4,3,1,1,0,"LOOP"],[5,5,0,6,0,"STRING"],[6,6,0,7,0,"STRING"],[8,7,0,8,1,"STRING"],[9,8,0,9,0,"STRING"],[10,9,0,1,1,"STRING"],[11,9,0,10,1,"STRING"],[12,10,0,11,0,"STRING"],[13,11,0,12,0,"STRING"],[14,12,0,1,2,"STRING"]],"groups":[],"config":{},"extra":{"ds":{"scale":1,"offset":[0,0]}},"version":0.4}`
}

const terminal = Object.create(null)
const showTerminal = ref(false)
const toggleTerminal = (val) => {
  if (typeof val === 'boolean') {
    showTerminal.value = val
  } else {
    showTerminal.value = !showTerminal.value
  }
}

onMounted(async () => {
  const hideTypes = [
    'input.load_json',
    'input.load_image',
    'input.load_nifti',
    ...Object.keys(SYSTEM_NODE_DEFS).filter((type) => {
      // return !['PrimitiveNode', 'Reroute'].includes(type)
      return true
    })
  ]
  hideTypes.forEach((type) => {
    if (LiteGraph.getNodeType(type)) {
      LiteGraph.unregisterNodeType(type)
    }
  })

  if (readonlyView.value) {
    useCommandStore().execute('Comfy.Canvas.ToggleLock')
    const graphCanvasMenuEl = document.querySelector('.p-buttongroup-vertical')
    if (graphCanvasMenuEl) {
      graphCanvasMenuEl.style.setProperty('visibility', 'hidden')
    }
  }

  const getCanvasMenuOptions = LGraphCanvas.prototype.getCanvasMenuOptions
  LGraphCanvas.prototype.getCanvasMenuOptions = function () {
    const options = getCanvasMenuOptions.apply(this, arguments)
    if (options) {
      const [add_node, ...rest] = options
      const new_options = [add_node]
      new_options.push(
        null, // inserts a divider
        {
          content: 'Reset All Nodes',
          callback: () => resetNodeById(-1)
        },
        {
          content: window.location.reload
            ? 'Reload Workflow'
            : 'Refresh Node Definitions',
          callback: async () => {
            if (window.location.reload) {
              return window.location.reload()
            }
            await useCommandStore().execute('Comfy.RefreshNodeDefinitions')
            workflowService.reloadCurrentWorkflow()
          }
        },
        {
          content: 'Clear Workflow',
          callback: async () => {
            await useCommandStore().execute('Comfy.ClearWorkflow')
          }
        }
      )
      return new_options
    }
    return options
  }

  const getNodeMenuOptions = LGraphCanvas.prototype.getNodeMenuOptions
  LGraphCanvas.prototype.getNodeMenuOptions = function (node) {
    const options = getNodeMenuOptions.apply(this, arguments)
    if (options) {
      let resetOptionIndex = options.findIndex((o) => o?.content === 'Remove')
      if (resetOptionIndex === -1) resetOptionIndex = options.length
      options.splice(resetOptionIndex, 0, {
        content: 'Reset',
        callback: () => resetNodeById(node.id)
      })
      return options
        .filter((o) => {
          if (
            [
              'Convert to Group Node',
              'Bypass'
              // ...
            ].includes(o?.content)
          ) {
            return false
          }
          return true
        })
        .map((o) => {
          if (
            [
              'Copy (Clipspace)'
              // ...
            ].includes(o?.content)
          ) {
            return {
              ...o,
              disabled: true
            }
          }
          return o
        })
    }
    return options
  }

  comfyApp.registerExtension({
    name: 'PMT.CustomExtension',

    async nodeCreated(node) {
      const _onMouseEnter = node.onMouseEnter
      node.onMouseEnter = function (e) {
        // ...
        return _onMouseEnter?.apply(this, arguments)
      }
      const _onMouseLeave = node.onMouseLeave
      node.onMouseLeave = function (e) {
        // ...
        return _onMouseLeave?.apply(this, arguments)
      }
      const _onMouseDown = node.onMouseDown
      node.onMouseDown = function (e, pos, canvas) {
        // ...
        return _onMouseDown?.apply(this, arguments)
      }
      const _onDblClick = node.onDblClick
      node.onDblClick = function (e, pos, canvas) {
        // ...
        return _onDblClick?.apply(this, arguments)
      }
      const _onDrawBackground = node.onDrawBackground
      node.onDrawBackground = function (
        ctx,
        canvas,
        canvasElement,
        mousePosition
      ) {
        // ...
        updateNodesSelected()
        return _onDrawBackground?.apply(this, arguments)
      }

      if (
        node?.widgets?.findIndex((w) => {
          return w.type === 'customtext' && w.inputEl?.type === 'textarea'
        }) !== -1
      ) {
        requestAnimationFrame(() => {
          node.setSize([...node.size])
          node.setDirtyCanvas(true)
        })
      }

      if (node?.comfyClass.startsWith('rag_llm.prompt')) {
        const prompt_template_vars = {}
        const findVars = (text) => {
          const regex = /\{([^}]+)\}/g
          const matches = []
          let match
          while ((match = regex.exec(text)) !== null) {
            if (!matches.includes(match[1])) {
              matches.push(match[1])
            }
          }
          return matches
        }
        const ul = document.createElement('ul')
        ul.classList.add(
          'relative',
          'overflow-auto',
          'flex',
          'flex-col',
          'p-0',
          'm-0',
          'text-xs'
        )
        const updateVarList = () => {
          ul.innerHTML = ''
          const longestVarNameLength = Math.max(
            ...Object.values(prompt_template_vars)
              .flat()
              .map((v) => v.length)
          )
          Object.values(prompt_template_vars).forEach((vars) => {
            vars.forEach((v) => {
              const li = document.createElement('li')
              li.classList.add('mb-2')
              li.innerHTML = `
                <label class="flex items-center">
                  <span style="min-width: ${longestVarNameLength + 2}ch">${v}:</span>
                  <input name="${v}" class="ml-1 flex-auto outline-0 border-b border-transparent focus:border-b-white bg-neutral-800" />
                </label>
              `
              ul.appendChild(li)
            })
          })
        }
        await new Promise((r) => setTimeout(r, 60))
        node.widgets.forEach((w) => {
          if (w.type === 'customtext' && w.inputEl?.type === 'textarea') {
            w.inputEl.oninput = (e) => {
              prompt_template_vars[w.name] = findVars(e.target.value)
              updateVarList()
            }
            prompt_template_vars[w.name] = findVars(w.inputEl.value)
            updateVarList()
          }
          if (w.name === 'type') {
            const cb = w.callback
            w.callback = function (value, canvas, node, pos, e) {
              if (value !== 'hub') {
                const hubLinkWidget = node.widgets.find((w) => {
                  return w.name === 'hub_link'
                })
                if (hubLinkWidget) {
                  hubLinkWidget.value = ''
                }
              }
              if (cb) {
                return cb.apply(this, arguments)
              }
            }
          }
          if (w.name === 'hub_link') {
            const cb = w.callback
            w.callback = function (value, canvas, node, pos, e) {
              const typeWidget = node.widgets.find((w) => {
                return w.name === 'type'
              })
              const systemPromptWidget = node.widgets.find((w) => {
                return w.name === 'system'
              })
              const hub_link = value
              if (
                hub_link &&
                typeWidget.value === 'hub' &&
                systemPromptWidget?.inputEl
              ) {
                console.log('getting hub prompt...', { hub_link })
                fetch('https://www.chather.top/api/get_hub_prompt', {
                  method: 'POST',
                  headers: {
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ hub_link })
                })
                  .then((res) => res.json())
                  .then((data) => {
                    if (data?.status === 'ok') {
                      systemPromptWidget.value = data.data || ''
                      prompt_template_vars[systemPromptWidget.name] = findVars(
                        systemPromptWidget.value
                      )
                      updateVarList()
                      console.log(data.data)
                    } else if (data?.status === 'error' && data.message) {
                      alert(data.message)
                    } else {
                      console.error(data)
                    }
                  })
                  .catch((err) => {
                    console.error(err)
                  })
              }
              if (cb) {
                return cb.apply(this, arguments)
              }
            }
          }
        })
        const widget = node.addDOMWidget(
          'prompt_template_vars',
          'prompt-template-vars',
          ul,
          {}
        )

        if (Object.keys(prompt_template_vars).length > 1) {
          requestAnimationFrame(() => {
            node.setSize([node.size[0], node.size[1] + 100])
            node.setDirtyCanvas(true)
          })
        }
      }
      if (node?.comfyClass === 'rag_llm.preview_text') {
        if (node.size[1] < 200) {
          requestAnimationFrame(() => {
            node.setSize([node.size[0], node.size[1] + 100])
            node.setDirtyCanvas(true)
          })
        }
        const div = document.createElement('div')
        div.classList.add('relative', 'overflow-hidden')
        div.innerHTML = `
          <div class="absolute inset-0 overflow-hidden flex flex-col" x-data="{ open: true }">
            <button class="uppercase mb-2" @click="open = !open" x-text="open ? ${"'Hide'"} : ${"'Show'"}"></button>
            <textarea x-show="open" class="w-full h-full resize-none border-none bg-neutral-800 text-xs" placeholder="" readonly></textarea>
          </div>
        `
        const widget = node.addDOMWidget(
          'llm_preview_text',
          'llm-preview-text',
          div,
          {}
        )
      }

      if (node?.comfyClass === 'plugin.tags_deident.main') {
        const div = document.createElement('div')
        div.innerHTML = `
          <div x-data class="w-full h-full overflow-auto">
            <table class="w-full text-xs text-stone-300 whitespace-nowrap">
              <tbody class="tabular-nums">
                <template x-for="tag in [
                  { key: '0010,0010', name: 'Patient Name' },
                  { key: '0010,0030', name: 'Patient Birth Date' },
                  { key: '0010,0040', name: 'Patient Sex' },
                  { key: '0010,1010', name: 'Patient Age' },
                  { key: '0010,1030', name: 'Patient Weight' },
                  { key: '0010,1040', name: 'Patient Address' },

                  { key: '0008,0020', name: 'Study Date' },
                  { key: '0008,0030', name: 'Study Time' },
                  { key: '0020,0010', name: 'Study ID' },
                  { key: '0008,0060', name: 'Study Modality' },
                  { key: '0008,1030', name: 'Study Description' },

                  { key: '0008,0021', name: 'Series Date' },
                  { key: '0008,0031', name: 'Series Time' },
                  { key: '0008,103E', name: 'Series Description' },
                ]">
                  <tr>
                    <td class="w-0 pr-1">(<span x-text="tag.key"></span>)</td>
                    <td class="w-0 pr-1"><span x-text="tag.name"></span></td>
                    <td class="w-full pl-1">
                      <input value="Anonymous" class="block w-full border-b border-transparent focus:border-b-white bg-neutral-800 text-neutral-300 text-xs" />
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        `
        const widget = node.addDOMWidget(
          'deident-tags-list',
          'deident-tags-list',
          div,
          {}
        )
        requestAnimationFrame(() => {
          node.setSize([360, 250])
          node.setDirtyCanvas(true)
        })
      }
      if (node?.comfyClass === 'plugin.head_deident.manual_qna') {
        const div = document.createElement('div')
        div.innerHTML = `
          <ol x-data class="w-full h-full overflow-hidden flex flex-col pl-5 m-0 text-xs text-neutral-300">
            <li class="mb-2">
              Does the face identifiable?
              <div class="flex items-center mt-1">
                <label class="inline-flex items-center mr-2">
                  <input type="radio" name="face_identifiable" value="yes" class="m-0 mr-1" />
                  Yes
                </label>
                <label class="inline-flex items-center mr-2">
                  <input type="radio" name="face_identifiable" value="no" class="m-0 mr-1" />
                  No
                </label>
              </div>
            </li>
            <li class="mb-2">
              Does the anatomical information intact?
              <div class="flex items-center mt-1">
                <label class="inline-flex items-center mr-2">
                  <input type="radio" name="anatomical_info_intact" value="yes" class="m-0 mr-1" />
                  Yes
                </label>
                <label class="inline-flex items-center mr-2">
                  <input type="radio" name="anatomical_info_intact" value="no" class="m-0 mr-1" />
                  No
                </label>
              </div>
            </li>
          </ol>
        `
        const widget = node.addDOMWidget(
          'head-manual-qna',
          'head-manual-qna',
          div,
          {}
        )
        requestAnimationFrame(() => {
          node.setSize([260, 130])
          node.setDirtyCanvas(true)
        })
      }
    }
  })

  comfyApp.canvasEl.addEventListener('drop', onDrop)

  if (pipelineId) {
    // console.log('saved pipelines:', pipelines.value)
  } else {
    const workflowData =
      workflow_name && workflow_name in presets
        ? JSON.parse(presets[workflow_name])
        : JSON.parse(sessionStorage.getItem('workflow') || presets.default)
    const workflow = workflowStore.createTemporary(
      `pmt/${workflowStore.activeWorkflow.key}`,
      workflowData
    )
    workflowStore.closeWorkflow(workflowStore.activeWorkflow).then(() => {
      workflowService.openWorkflow(workflow)
    })
  }

  if (window.MessagePack) {
    decodeMultiStream = window.MessagePack.decodeMultiStream
  }

  window['driverObjs'] = []
  window['driverHighlight'] = (...args) => {
    window.driverObjs.push(highlight(...args))
    return window.driverObjs
  }
  window.__session_id__ = `${Date.now()}`

  if (window.Terminal) {
    const Terminal = window.Terminal
    const FitAddon = window.FitAddon.FitAddon
    const SerializeAddon = window.SerializeAddon.SerializeAddon

    const term = new Terminal()
    const fitAddon = new FitAddon()
    const serializeAddon = new SerializeAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(serializeAddon)

    term.open(document.getElementById('terminal'))
    fitAddon.fit()

    // term.write('Hello from \x1B[1;3;31mxterm.js\x1B[0m')
    // term.write('\r\n')
    // term.write('$ ping\r\n')
    // term.write('PONG\r\n')
    // term.write('$ ')

    terminal.term = term
    terminal.fitAddon = fitAddon
    window.$terminal = terminal
  }
})

onUnmounted(() => {
  comfyApp.canvasEl.removeEventListener('drop', onDrop)

  if (window.driverObjs?.length) {
    window.driverObjs.forEach((driverObj, i, arr) => {
      driverObj.destroy()
      arr.splice(i, 1)
    })
  }
})

function onDrop(e) {
  if (window['__drag_over_node']) {
    delete window['__drag_over_node']
    return
  }
  if (e.dataTransfer.files.length) {
    const file = e.dataTransfer.files[0]
    if (file.type === 'application/json' || file.name?.endsWith('.json')) {
      const reader = new FileReader()
      reader.onload = async () => {
        const readerResult = reader.result
        const jsonContent = JSON.parse(readerResult)
        if (jsonContent?.plugin_name) {
          // pmt plugin config
          try {
            // eslint-disable-next-line no-undef
            const defs = $pluginConfig2ComfyNodeDefs(jsonContent, false)
            await comfyApp.registerNodes(defs)
            await useCommandStore().execute('Comfy.RefreshNodeDefinitions')
            workflowService.reloadCurrentWorkflow()
          } catch (err) {
            console.error(err)
          }
        }
      }
      reader.readAsText(file)
    }
  } else {
    // console.log('Drop:', JSON.parse(e.dataTransfer.getData('text') || 'null'))
  }
  e.preventDefault()
}

const toast = useToastStore()
const confirm = useConfirm()

const runMenu = ref()
const runMenuItems = computed(() => [
  {
    label: 'Run',
    icon: 'pi pi-play',
    class: 'text-sm',
    disabled: false,
    command: () => {
      run(null, 'complete')
    }
  },
  {
    label: 'Run (one step)',
    icon: 'pi pi-step-forward',
    class: 'text-sm',
    disabled: false,
    command: () => {
      run(null, 'one-step')
    }
  },
  {
    label: 'Run (to node)',
    icon: 'pi pi-fast-forward',
    class: 'text-sm',
    disabled: nodesSelectedCount.value !== 1,
    command: () => {
      run(null, 'to-node')
    }
  }
])

const pipOver = ref()
function togglePipOver(e) {
  pipelineName.value = pipeline.value.name
  pipelineDescription.value = pipeline.value.description
  pipelineColor.value = pipeline.value.color
  pipOver.value.toggle(e)
}

async function resetNodeById(nodeId) {
  try {
    const { json } = exportJson(false)
    const res = await fetch(
      'connect://localhost/api/pipelines/reset-pipeline-nodes-from-node-id',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: pipeline.value.id,
          workflow: JSON.stringify(json),
          nodeId
        })
      }
    )
    if (res.ok) {
      const { error, message, nodeIds } = await res.json()
      if (error) {
        console.error(error, message)
      } else {
        if (nodeId === -1) {
          comfyApp.graph.nodes.forEach((node) => {
            if (node) {
              console.log('reset', node)
              resetNodeStatus(node)
            }
          })
        } else if (nodeIds) {
          nodeIds.forEach((nodeId) => {
            const node = comfyApp.graph.getNodeById(nodeId)
            if (node) {
              console.log('reset', node)
              resetNodeStatus(node)
            }
          })
        }
      }
    }
  } catch (err) {
    console.error(err)
  }
}
function resetNodeStatus(node) {
  if (node?.pmt_fields) {
    if (node.pmt_fields?.status) {
      node.pmt_fields.status = null
    }
    node.setDirtyCanvas(true)
  }
}

let runPipelineOnceAbortController = null
const running = ref(false)
const runningMode = ref('complete')
async function run(e, mode = 'complete') {
  if (runMenu.value) {
    runMenu.value.hide(e)
  }
  if (running.value) {
    return
  }
  running.value = true
  runningMode.value = mode
  if (!pipelineId) {
    const { langchain_json } = exportJson(false)
    const answers = await langchainChat(langchain_json)
    console.log(answers)
  } else {
    const { json } = exportJson(false)
    const validationResult = await validatePipelineGraphJson(json)
    if (validationResult) {
      // ...
    } else {
      running.value = false
      console.error('validation failed')
      return
    }
    runPipelineOnceAbortController = new AbortController()
    return fetch('connect://localhost/api/pipelines/run-once', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: pipeline.value.id,
        workflow: JSON.stringify(json),
        mode: runningMode.value
      }),
      signal: runPipelineOnceAbortController.signal
    })
      .then(async (res) => {
        if (!running.value) {
          return
        }
        for await (const chunk of decodeMultiStream(res.body)) {
          if (chunk?.id === pipelineId) {
            handleStreamChunk(chunk)
          }
        }
        console.log('[DONE]')
      })
      .catch((err) => {
        if (err?.name === 'AbortError') {
          return console.warn(err.message)
        }
        console.error(err)
      })
      .finally(() => {
        running.value = false
      })
  }
  running.value = false
  runningMode.value = 'complete'
}

const stoppable = ref(!!pipelineId)
const pausing = ref(false)
async function stop() {
  if (pausing.value || !running.value) {
    return
  } else if (runPipelineOnceAbortController) {
    runPipelineOnceAbortController.abort()
    runPipelineOnceAbortController = null
  }
  pausing.value = true
  return fetch('connect://localhost/api/pipelines/stop-run-once', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id: pipeline.value.id })
  })
    .then(async (res) => {
      if (res.ok) {
        const data = await res.json()
        console.log('[STOP]', data)
        running.value = false
      }
    })
    .catch((err) => {
      console.error(err)
    })
    .finally(() => {
      pausing.value = false
    })
}

const saving = ref(false)
async function save() {
  if (saving.value) {
    return
  }
  saving.value = true
  if (pipelineId) {
    let { json } = exportJson(false, false)
    json = JSON.parse(JSON.stringify(json))
    const validationResult = await validatePipelineGraphJson(json)
    if (validationResult) {
      // json.nodes = json.nodes.map(({ pmt_fields, ...node }) => node)
    } else {
      saving.value = false
      console.error('validation failed')
      return
    }
    if (isNewPipeline.value) {
      createPipeline({
        ...pipeline.value,
        name: pipelineName.value,
        description: pipelineDescription.value,
        color: pipelineColor.value,
        workflow: JSON.stringify(json)
      })
    } else {
      updatePipeline({
        ...pipeline.value,
        workflow: JSON.stringify(json)
      })
    }
    return
  } else {
    const { json, langchain_json } = exportJson(false, false)
    let langchain = localStorage.getItem('langchain')
    if (langchain) {
      langchain = JSON.parse(langchain)
    } else {
      langchain = {}
    }
    langchain[langchain_json.workflow_name] = langchain_json
    localStorage.setItem('langchain', JSON.stringify(langchain))
    sessionStorage.setItem('workflow', JSON.stringify(json))
  }
  saving.value = false
  toast.add({
    severity: 'success',
    summary: 'Saved',
    detail: 'Changes have been saved',
    life: 3000
  })
}
const confirmSave = (e) => {
  if (running.value) {
    return
  }
  if (saving.value) {
    return
  }
  confirm.require({
    target: e.currentTarget,
    group: 'confirm_saving',
    message: 'Save changes?',
    rejectProps: {
      label: 'Cancel',
      severity: 'secondary',
      outlined: true
    },
    acceptProps: {
      label: 'Save'
    },
    accept: save,
    reject: () => {}
  })
}

function saveCheckpoints(nodeId, checked) {
  let updatedCount = 0
  pipelineWorkflow.value?.nodes?.forEach((node) => {
    if (node.id === nodeId) {
      if (checked) {
        node.pmt_fields.checkpoint = checked
      } else {
        delete node.pmt_fields.checkpoint
      }
      updatedCount++
    }
  })
  if (updatedCount) {
    updatePipeline({
      ...pipeline.value,
      workflow: JSON.stringify(pipelineWorkflow.value)
    })
  }
}
watch(
  loading,
  () => {
    if (loading.value) {
      return
    }
    const saveBtn = document.querySelector('.btn-sav')
    if (saveBtn) {
      saveBtn.saveCheckpoints = saveCheckpoints
    }
  },
  { flush: 'post' }
)

const deleting = ref(false)
const delBtn = ref()
const delBtnHovered = useElementHover(delBtn)
const confirmDelete = (e) => {
  confirm.require({
    group: 'confirm_deletion',
    header: 'Delete Confirmation',
    message: 'Do you want to delete this pipeline workflow?',
    icon: 'pi pi-exclamation-circle',
    rejectLabel: 'Cancel',
    rejectProps: {
      label: 'Cancel',
      severity: 'secondary',
      outlined: true
    },
    acceptProps: {
      label: 'Delete',
      severity: 'danger'
    },
    accept: () => {
      if (!pipelineId) {
        return
      }
      deleting.value = true
      return deletePipeline({ id: pipeline.value.id })
    },
    reject: () => {}
  })
  togglePipOver(e)
}

function exportJson(download = true, keepStatus = true) {
  const json = getWorkflowJson(false, keepStatus)
  console.log(json)

  if (download) {
    const blob = new Blob([JSON.stringify(json, 2, null)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.download = `${pipeline.value.name || 'workflow'}.json`
    a.click()
    return URL.revokeObjectURL(url)
  }

  if (pipelineId) {
    return { json }
  }

  const langchain_json_nodes = json.nodes.map(
    ({ id, type, pmt_fields: { args } }) => ({
      id,
      type,
      pmt_fields: {
        args
      }
    })
  )
  const prompt_node = langchain_json_nodes.find(
    ({ type }) => type === 'rag_llm.prompt'
  )
  const langchain_json = {
    workflow_name: workflow_name || 'default',
    langchain_json: langchain_json_nodes,
    inputs: prompt_node?.pmt_fields?.args?.prompt_template_vars || {},
    session_id: window.__session_id__
  }
  console.log(langchain_json)

  return { json, langchain_json }
}

function getWorkflowJson(stringify = false, keepStatus = true) {
  const state = workflowStore.activeWorkflow.activeState
  const workflow = JSON.parse(JSON.stringify(state))
  workflow.nodes.sort((a, b) => a.order - b.order)
  workflow.nodes.forEach(({ id, inputs, outputs }, i, nodes) => {
    const node = comfyApp.graph.getNodeById(id)
    const nodeDef = nodeDefStore.nodeDefsByName[node.type]
    const [type, subtype] = node.type.split('.')
    if (type === 'rag_llm') {
      const pmt_fields = {
        args: (node.widgets || []).reduce(
          (args, { type, name, value, element }) => {
            if (type !== 'converted-widget') {
              args[name] = value
            }
            if (type === 'prompt-template-vars') {
              args[name] = {}
              element?.querySelectorAll('li input').forEach((input) => {
                args[name][input.name] = input.value
              })
            }
            return args
          },
          {}
        ),
        status: ''
      }
      nodes[i].pmt_fields = pmt_fields
      node.pmt_fields = nodes[i].pmt_fields
      node.setDirtyCanvas(true)
      return nodes[i]
    }
    const [_, plugin_name, function_name] = nodeDef.python_module.split('.')
    const pmt_fields = merge(
      node?.pmt_fields ? JSON.parse(JSON.stringify(node.pmt_fields)) : {},
      {
        type,
        plugin_name: plugin_name || null,
        function_name: function_name || null,
        inputs: (inputs || []).map((i) => {
          let optional = false
          if (nodeDef.inputs[i.name]?.isOptional) {
            optional = true
          } else if (nodeDef.inputs.optional?.[i.name]?.type === i.type) {
            optional = true
          }
          return {
            optional
          }
        }),
        args: (node.widgets || []).reduce((args, { type, name, value }) => {
          if (type !== 'converted-widget') {
            args[name] = value
          }
          return args
        }, {}),
        outputs: (outputs || []).map((o) => {
          return {
            oid: null,
            path: null,
            value: null
          }
        }),
        status: null
      }
    )
    if (pmt_fields.type === 'basic') {
      //
    }
    if (pmt_fields.type === 'input') {
      if (
        [
          'boolean',
          'int',
          'float',
          'text',
          'textarea'
          // ...
        ].includes(subtype)
      ) {
        pmt_fields.plugin_name = 'scalar'
        pmt_fields.function_name = subtype
      }
      if (
        [
          // ...
          'load_dicom',
          'load_series',
          'load_study'
        ].includes(subtype)
      ) {
        pmt_fields.plugin_name = subtype
        pmt_fields.function_name = null
      }
      if (keepStatus) {
        const oid = pmt_fields.args.oid || pmt_fields.args.source
        if (oid) {
          if (!subtype) {
            //
          } else if (subtype === 'load_dicom') {
            pmt_fields.outputs.forEach((output, o) => {
              output.level = ParsedLevel.INSTANCE
              output.oid = oid
            })
          } else if (subtype === 'load_series') {
            if (
              node?.pmt_fields?.outputs &&
              node.pmt_fields.outputs.findIndex(
                (output) => output.level === ParsedLevel.INSTANCE
              ) !== -1
            ) {
              pmt_fields.outputs = node.pmt_fields.outputs
              pmt_fields.outputs.forEach((output, o) => {
                const out = node.outputs[o]
                output.linked = !!out?.links?.length
                if (output.linked) {
                  delete output.linked
                }
              })
            } else {
              pmt_fields.outputs.forEach((output, o) => {
                delete output.linked
                output.level = ParsedLevel.SERIES
                output.oid = oid
              })
            }
          } else if (subtype === 'load_study') {
            if (
              node?.pmt_fields?.outputs &&
              node.pmt_fields.outputs.findIndex(
                (output) => output.level === ParsedLevel.SERIES
              ) !== -1
            ) {
              pmt_fields.outputs = node.pmt_fields.outputs
              pmt_fields.outputs.forEach((output, o) => {
                const out = node.outputs[o]
                output.linked = !!out?.links?.length
                if (output.linked) {
                  delete output.linked
                }
              })
            } else {
              pmt_fields.outputs.forEach((output, o) => {
                delete output.linked
                output.level = ParsedLevel.STUDY
                output.oid = oid
              })
            }
          } else {
            delete pmt_fields.outputs[0].level
            pmt_fields.outputs[0].oid = oid
            pmt_fields.outputs[0].path = pmt_fields.outputs[0].path || null
            pmt_fields.outputs[0].value = pmt_fields.outputs[0].value || null
          }
        }
        if (subtype === 'boolean') {
          pmt_fields.outputs[0].value =
            pmt_fields.outputs[0].value || pmt_fields.args.bool
        }
        if (subtype === 'int') {
          pmt_fields.outputs[0].value =
            pmt_fields.outputs[0].value || pmt_fields.args.int
        }
        if (subtype === 'float') {
          pmt_fields.outputs[0].value =
            pmt_fields.outputs[0].value || pmt_fields.args.float
        }
        if (subtype === 'text') {
          pmt_fields.outputs[0].value =
            pmt_fields.outputs[0].value || pmt_fields.args.text
        }
        if (subtype === 'textarea') {
          pmt_fields.outputs[0].value =
            pmt_fields.outputs[0].value || pmt_fields.args.textarea
        }
        if (subtype === 'load_json') {
          if (node?.pmt_fields?.outputs) {
            if (node.pmt_fields.outputs[0].value) {
              pmt_fields.outputs = node.pmt_fields.outputs
            }
          }
        }
        pmt_fields.outputs.forEach((output, o) => {
          if (!output.to_export) {
            delete output.to_export
          }
        })
      } else {
        pmt_fields.outputs.forEach((output, o) => {
          const { level, oid, path, value, to_export, ...out } = output
          output.oid = null
          output.path = null
          output.value = null
          if (Object.values(out).filter(Boolean).length === 0) {
            delete output.level
          }
          if (!to_export) {
            delete output.to_export
          }
        })
      }
    } else if (keepStatus) {
      if (node.pmt_fields?.outputs) {
        pmt_fields.outputs = merge(pmt_fields.outputs, node.pmt_fields.outputs)
      }
    }
    if (pmt_fields.type === 'manual') {
      //
    }
    if (pmt_fields.type === 'plugin') {
      //
    }
    if (pmt_fields.type === 'converter') {
      //
    }
    if (pmt_fields.type === 'preview') {
      //
    }
    if (pmt_fields.type === 'output') {
      // pmt_fields.status = null
    }
    if (keepStatus) {
      if (node.pmt_fields?.status) {
        pmt_fields.status = node.pmt_fields.status
      } else {
        // pmt_fields.status = 'pending'
      }
      if (runningMode.value === 'to-node') {
        if (nodesSelectedCount.value === 1) {
          if (node === nodesSelected.value[0]) {
            pmt_fields.status = 'current'
          }
        }
      }
    } else {
      pmt_fields.status = null
    }
    nodes[i].pmt_fields = pmt_fields
    node.pmt_fields = nodes[i].pmt_fields
    node.setDirtyCanvas(true)
    return nodes[i]
  })
  if (stringify) {
    return JSON.stringify(workflow)
  }
  return JSON.parse(JSON.stringify(workflow))
}

async function validatePipelineGraphJson(json) {
  let result = null
  try {
    const res = await fetch(
      'connect://localhost/api/pipelines/validate-pipeline-graph-json',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: pipeline.value.id,
          workflow: JSON.stringify(json)
        })
      }
    )
    if (res.ok) {
      const { error, message, result: data } = await res.json()
      if (error) {
        console.error(error, message)
      } else if (data) {
        result = JSON.parse(data)
        console.log('validation result:', result)
        // ...
      }
    }
  } catch (err) {
    console.error(err)
  }
  return result
}

const peerId =
  `comfyui-${pipelineId || '*'}` +
  (embeddedView.value ? '-embedded' : '') +
  (taskId ? `-for-task-${taskId}` : '')
const ports = Object.create(null)
onMounted(async () => {
  // window['__ports__'] = ports;
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.type === 'response-message-port') {
      const { peer1, peer2 } = e.data.payload
      if (peerId === peer1) {
        ports[peer2] = e.ports[0]
        const port = ports[peer2]
        port.onclose = () => {
          delete ports[peer2]
        }
        port.onmessage = (event) => {
          const { type, payload } = event.data
          switch (type) {
            case 'get-manual-list': {
              handleGetManualList(payload)
              break
            }
            case 'created-segmentation': {
              handleCreateManualSegmentation(payload)
              break
            }
            case 'get-manual-qna': {
              handleGetManualQnA(payload)
              break
            }
            case 'saved-qna-answers': {
              handleSaveQnAnswers(payload)
              break
            }
            // ...
          }
        }
      }
      if (peerId === peer2) {
        ports[peer1] = e.ports[0]
        const port = ports[peer1]
        port.onclose = () => {
          delete ports[peer1]
        }
        port.onmessage = (event) => {
          const { type, payload } = event.data
          switch (type) {
            case 'got-batch-stream-chunk': {
              if (payload && payload.pipelineId === pipelineId) {
                handleBatchStreamChunk(payload.output)
              }
              break
            }
            case 'got-stream-chunk': {
              if (payload && payload.id === pipelineId) {
                handleStreamChunk(payload)
              }
              break
            }
            case 'got-pipeline': {
              handleGetPipeline(payload)
              break
            }
            case 'created-pipeline': {
              handleCreatePipeline(payload)
              break
            }
            case 'updated-pipeline': {
              handleUpdatePipeline(payload)
              break
            }
            case 'deleted-pipeline': {
              handleDeletePipeline(payload)
              break
            }
            // ...
          }
        }
        if (loading.value) {
          getPipeline({ ...pipeline.value }, port)
        }
      }
    }
  })
  while (!window.$electron) {
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (window.$electron) {
    window.$electron.requestMessagePort({
      peer1: 'mod-pipelines',
      peer2: peerId
    })
    if (embeddedView.value) {
      window.$electron.requestMessagePort({
        peer1: 'batch-tasks-' + datasetId,
        peer2: peerId
      })
    }
  }
})

function handleStreamChunk(chunk) {
  const { pythonMsg, graphJson } = chunk || {}
  const msg = pythonMsg?.msg || ''
  const results = []
  if (graphJson) {
    graphJson.forEach(({ id, pmtFields: pmt_fields }) => {
      if (pmt_fields) {
        const result = { id, pmt_fields: JSON.parse(pmt_fields) }
        const node = comfyApp.graph.getNodeById(id)
        if (node && node.pmt_fields) {
          const { outputs, status, type } = result.pmt_fields
          if (outputs) {
            console.log(result.pmt_fields)
            outputs.forEach((output, o) => {
              const { name, type, oid, path, value } = output
              if (oid) {
                node.pmt_fields.outputs[o].oid = Array.isArray(
                  node.pmt_fields.outputs[o].oid
                )
                  ? Array.isArray(oid)
                    ? oid
                    : [oid]
                  : oid
              }
              if (path && path !== 'None') {
                node.pmt_fields.outputs[o].path = Array.isArray(
                  node.pmt_fields.outputs[o].path
                )
                  ? Array.isArray(path)
                    ? path
                    : [path]
                  : path
              }
              if (value) {
                node.pmt_fields.outputs[o].value = Array.isArray(
                  node.pmt_fields.outputs[o].value
                )
                  ? Array.isArray(value)
                    ? value
                    : [value]
                  : value
              }
            })
          }
          if (status && type) {
            if (type !== 'output') {
              node.pmt_fields.status = status
            }
          }
          node.setDirtyCanvas(true)
          return
        }
        results.push(result)
      }
    })
  }
  if (msg) {
    terminal.term.write(msg + (msg.endsWith('\r') ? '\n' : ''))
    console.log(msg, results.length > 0 ? results : '')
  }
}

function handleBatchStreamChunk(chunk) {
  const { error, comfyNodeId, numOfDone, numOfTotal } = chunk || {}
  const node = comfyApp.graph.getNodeById(comfyNodeId)
  if (node) {
    let status = null
    let countStr = `${numOfDone}/${numOfTotal}`
    if (error) {
      status = 'error'
      console.error(comfyNodeId, chunk.message)
    } else if (numOfTotal > 0) {
      if (numOfDone > 0) {
        status = 'pending'
        if (numOfDone === numOfTotal) {
          status = 'done'
        }
      }
      console.log(comfyNodeId, countStr, chunk.message)
    }
    if (status) {
      node.pmt_fields = {
        ...(node.pmt_fields || {}),
        status
      }
      node.setDirtyCanvas(true)
    }
    const statusWidget = node.widgets.find((w) => {
      return w.name === 'status-float'
    })
    const countEl = statusWidget?.element?.querySelector('span')
    if (countEl) {
      countEl.textContent = countStr
      countEl.style.color = NODE_STATUS_COLOR[status] || 'inherit'
      countEl.style.visibility = 'visible'
    }
  }
}

function getPipeline(payload, port) {
  port.postMessage({
    type: 'get-pipeline',
    payload: { ...payload, ts: Date.now() }
  })
}
function handleGetPipeline(payload) {
  if (!loading.value) {
    return
  }
  if (payload.id === pipeline.value.id) {
    console.log('current pipeline:', payload)
  } else {
    return
  }
  pipelineName.value = payload.name || pipelineName.value
  pipeline.value.name = payload.name
  pipeline.value.description = payload.description
  pipeline.value.color = payload.color
  pipeline.value.readonly = !!payload.readonly
  if (payload.workflow) {
    pipeline.value.workflow = payload.workflow
  } else {
    delete pipeline.value.workflow
  }
  if (pipelineWorkflow.value?.nodes?.length) {
    const workflow = workflowStore.createTemporary(
      `pmt/${pipelineName.value}.json`,
      pipelineWorkflow.value
    )
    workflowStore.closeWorkflow(workflowStore.activeWorkflow).then(() => {
      workflowService.openWorkflow(workflow).then(() => {
        if (readonlyView.value) {
          requestAnimationFrame(() => {
            useCommandStore().execute('Comfy.Canvas.FitView')
          })
        }
      })
    })
  }
  loading.value = false
}

function createPipeline(payload) {
  const port = ports['mod-pipelines']
  if (port) {
    port.postMessage({
      type: 'create-pipeline',
      payload: { ...payload, ts: Date.now() }
    })
  }
}
function handleCreatePipeline(payload) {
  if (payload.id === pipeline.value.id) {
    console.log('created pipeline:', payload)
  } else {
    return
  }
  pipeline.value.name = payload.name
  pipeline.value.description = payload.description
  pipeline.value.color = payload.color
  if (payload.workflow) {
    pipeline.value.workflow = payload.workflow
  } else {
    delete pipeline.value.workflow
  }
  saving.value = false
}

function updatePipeline(payload) {
  const port = ports['mod-pipelines']
  if (port) {
    port.postMessage({
      type: 'update-pipeline',
      payload: { ...payload, ts: Date.now() }
    })
  }
}
function handleUpdatePipeline(payload) {
  if (payload.id === pipeline.value.id) {
    console.log('updated pipeline:', payload)
  } else {
    return
  }
  pipeline.value.name = payload.name
  pipeline.value.description = payload.description
  pipeline.value.color = payload.color
  if (payload.workflow) {
    pipeline.value.workflow = payload.workflow
  } else {
    delete pipeline.value.workflow
  }
  saving.value = false
}

function deletePipeline(payload) {
  const port = ports['mod-pipelines']
  if (port) {
    port.postMessage({
      type: 'delete-pipeline',
      payload: { ...payload, ts: Date.now() }
    })
  }
}
function handleDeletePipeline(payload) {
  if (payload.id === pipeline.value.id) {
    console.log('deleted pipeline:', payload)
  } else {
    return
  }
  deleting.value = false
}

// ---

function handleGetManualList(payload) {
  if (payload?.pipelineId === pipeline.value.id) {
    //
  } else {
    return
  }
  const manualList = []
  const manualNodeId = payload.manualNodeId
  const manualNode = comfyApp.graph.getNodeById(manualNodeId)
  if (manualNode) {
    if (
      typeof manualNode['getInputs_'] === 'function' &&
      typeof manualNode['getOutputs_'] === 'function'
    ) {
      const inputs = manualNode['getInputs_']()
      const outputs = manualNode['getOutputs_']()
      inputs.forEach((input, i) => {
        const output = outputs[i]
        const item = JSON.parse(
          JSON.stringify({
            level: input.level || undefined,
            oid: input.oid || null,
            path: input.path || null,
            value: output?.value || undefined,
            labelmap: output?.path || undefined
          })
        )
        manualList.push(item)
      })
    }
  }
  const port = ports[`tab-volview-${payload.pipelineId}-manual-${manualNodeId}`]
  if (port) {
    port.postMessage({
      type: 'got-manual-list',
      payload: manualList
    })
  }
}

function handleCreateManualSegmentation(payload) {
  if (payload?.pipelineId === pipeline.value.id) {
    console.log('manual segmentation:', payload)
  } else {
    return
  }
  const manualNodeId = payload.manualNodeId
  const manualNode = comfyApp.graph.getNodeById(manualNodeId)
  if (manualNode) {
    if (
      typeof manualNode['getInputs_'] === 'function' &&
      typeof manualNode['getOutputs_'] === 'function'
    ) {
      const inputs = manualNode['getInputs_']()
      const outputs = manualNode['getOutputs_']()
      inputs.forEach((input, i) => {
        const output = outputs[i]
        if (output) {
          const { oid, labelmap } = payload
          if (labelmap) {
            if (input.oid) {
              if (input.oid === oid) {
                output.path = labelmap
                manualNode.setDirtyCanvas(true)
              }
            } else if (input.path) {
              if (input.path === oid || input.path === window.atob(oid)) {
                output.path = labelmap
                manualNode.setDirtyCanvas(true)
              }
            }
          }
        }
      })
    }
  }
  return handleGetManualList({ pipelineId: payload.pipelineId, manualNodeId })
}

function handleGetManualQnA(payload) {
  if (payload?.pipelineId === pipeline.value.id) {
    //
  } else {
    return
  }
  const manualNodeId = payload.manualNodeId
  const manualNode = comfyApp.graph.getNodeById(manualNodeId)
  if (manualNode) {
    const port =
      ports[`tab-volview-${payload.pipelineId}-manual-${manualNodeId}`]
    if (port) {
      port.postMessage({
        type: 'got-manual-qna',
        payload: manualNode.pmt_fields?.qna || null
      })
    }
  }
}

function handleSaveQnAnswers(payload) {
  if (payload?.pipelineId === pipeline.value.id) {
    console.log('manual qna:', payload)
  } else {
    return
  }
  const manualNodeId = payload.manualNodeId
  const manualNode = comfyApp.graph.getNodeById(manualNodeId)
  if (manualNode) {
    if (
      typeof manualNode['getInputs_'] === 'function' &&
      typeof manualNode['getOutputs_'] === 'function'
    ) {
      const inputs = manualNode['getInputs_']()
      const outputs = manualNode['getOutputs_']()
      inputs.forEach((input, i) => {
        const output = outputs[i]
        if (output) {
          const { oid, answers } = payload
          if (answers) {
            if (input.oid) {
              if (input.oid === oid) {
                output.value = answers
                manualNode.setDirtyCanvas(true)
              }
            } else if (input.path) {
              if (input.path === oid || input.path === window.atob(oid)) {
                output.value = answers
                manualNode.setDirtyCanvas(true)
              }
            }
          }
        }
      })
    }
  }
  return handleGetManualList({ pipelineId: payload.pipelineId, manualNodeId })
}

// ---

async function langchainChat(langchain_json) {
  if (!langchain_json) {
    return
  }
  const previewTextNode = comfyApp.graph.findNodesByType(
    'rag_llm.preview_text'
  )[0]
  if (!previewTextNode) {
    return
  }
  const previewTextWidget = previewTextNode.widgets.find(
    (w) => w.type === 'llm-preview-text'
  )
  if (!previewTextWidget) {
    return
  }
  const previewTextEl = previewTextWidget.element.querySelector('textarea')
  if (!previewTextEl) {
    return
  } else {
    previewTextEl.value = ''
    previewTextEl.scrollTop = 0
  }

  let answers = ''
  try {
    const res = await fetch('https://www.chather.top/api/langchain_chat', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(langchain_json)
      // signal: controller.signal
    })
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      if (value) {
        value
          .replace('\n\n\n', '\n\n')
          .split('\n\n')
          .forEach((chunk) => {
            if (chunk && chunk.startsWith('data: ')) {
              let data = chunk.slice('data: '.length).trim()
              if (data === '[DONE]') {
                return
              } else if (data.startsWith('{')) {
                data = JSON.parse(data)
              }
              if (data?.text) {
                answers += data.text
                previewTextEl.value += data.text
                previewTextEl.scrollTop = previewTextEl.scrollHeight
              }
            }
          })
      }
    }
    console.log('[DONE]')
  } catch (err) {
    console.error(err)
  }
  return answers
}
</script>

<style scoped>
.btn-pip {
  @apply truncate;
}
.btn-term {
  @apply max-md:hidden;
}
.terminal-container {
  @apply fixed top-0 right-0 max-md:hidden;
}
#terminal {
  @apply overflow-hidden border-black border-solid border-r border-b-4 border-l-4;
  transform: scale(0.75);
  transform-origin: top right;
}
</style>

<style>
#pmt-action-panel {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 10px;
  z-index: 1000;
  overflow: hidden;
}
#pmt-action-panel .p-panel-header {
  display: none;
}
#pmt-action-panel .p-panel-content {
  padding: 0;
}
#pmt-action-panel .p-panel-content .p-buttongroup {
  display: flex;
}
#pmt-action-panel .p-panel-content .p-buttongroup > .p-button {
  --p-icon-size: 0.875rem;
  border-radius: 0 !important;
}

#btn-run-menu {
  margin-top: -5px !important;
}

#terminal .xterm-rows {
  font-size: 14px;
}

div.comfy-menu.no-drag {
  display: none !important;
}

.selection-toolbox {
  visibility: hidden !important;
}
.selection-toolbox [data-testid='bypass-button'] {
  display: none !important;
}

.global-dialog[aria-labelledby='global-load-workflow-warning']
  .p-button[aria-label='Open Manager'] {
  display: none !important;
}
</style>
