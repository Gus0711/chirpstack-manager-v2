<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import DeleteTool from '@/components/tools/DeleteTool.vue'
import MigrateTool from '@/components/tools/MigrateTool.vue'
import DpChangeTool from '@/components/tools/DpChangeTool.vue'
import SearchTool from '@/components/tools/SearchTool.vue'
import ExportTool from '@/components/tools/ExportTool.vue'
import AnalyzeTool from '@/components/tools/AnalyzeTool.vue'
import ImportTool from '@/components/tools/ImportTool.vue'
import TagUpdateTool from '@/components/tools/TagUpdateTool.vue'
import TemplateTool from '@/components/tools/TemplateTool.vue'

const route = useRoute()
const router = useRouter()

const tool = computed(() => route.params.tool as string)

const toolNames: Record<string, string> = {
  'import': 'Import',
  'export': 'Export',
  'delete': 'Suppression',
  'migrate': 'Migration',
  'dp-change': 'Device Profile',
  'tag-update': 'Mise a jour des Tags',
  'search': 'Recherche',
  'analyze': 'Analyse',
  'template': 'Template CSV',
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <button
        class="p-2 rounded-lg text-zinc-500 hover:text-cyan-400 hover:bg-white/[0.03] transition-all"
        @click="router.push('/tools')"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h2 class="text-2xl font-semibold tracking-tight">{{ toolNames[tool] || tool }}</h2>
    </div>

    <ImportTool v-if="tool === 'import'" />
    <ExportTool v-if="tool === 'export'" />
    <DeleteTool v-if="tool === 'delete'" />
    <MigrateTool v-if="tool === 'migrate'" />
    <DpChangeTool v-if="tool === 'dp-change'" />
    <TagUpdateTool v-if="tool === 'tag-update'" />
    <SearchTool v-if="tool === 'search'" />
    <AnalyzeTool v-if="tool === 'analyze'" />
    <TemplateTool v-if="tool === 'template'" />
  </div>
</template>
