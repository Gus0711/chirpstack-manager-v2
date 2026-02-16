<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useConnectionStore } from '@/stores/connection'

const router = useRouter()
const conn = useConnectionStore()

interface ToolCard {
  id: string
  name: string
  description: string
  icon: string
  color: string
  glowColor: string
}

const tools: ToolCard[] = [
  {
    id: 'import',
    name: 'Import',
    description: 'Importer des devices depuis un fichier CSV/XLSX ou manuellement',
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
    color: 'text-emerald-400 bg-emerald-500/10',
    glowColor: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:border-emerald-500/20',
  },
  {
    id: 'export',
    name: 'Export',
    description: 'Exporter les devices en CSV ou XLSX avec filtres',
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
    color: 'text-cyan-400 bg-cyan-500/10',
    glowColor: 'hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:border-cyan-500/20',
  },
  {
    id: 'delete',
    name: 'Suppression',
    description: 'Supprimer des devices en masse avec confirmation',
    icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    color: 'text-red-400 bg-red-500/10',
    glowColor: 'hover:shadow-[0_0_20px_rgba(239,68,68,0.15)] hover:border-red-500/20',
  },
  {
    id: 'migrate',
    name: 'Migration',
    description: 'Deplacer des devices entre applications',
    icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
    color: 'text-violet-400 bg-violet-500/10',
    glowColor: 'hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] hover:border-violet-500/20',
  },
  {
    id: 'dp-change',
    name: 'Device Profile',
    description: 'Changer le Device Profile en masse',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    color: 'text-amber-400 bg-amber-500/10',
    glowColor: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] hover:border-amber-500/20',
  },
  {
    id: 'tag-update',
    name: 'Tags',
    description: 'Mettre a jour les tags via fichier CSV',
    icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z',
    color: 'text-cyan-400 bg-cyan-500/10',
    glowColor: 'hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:border-cyan-500/20',
  },
  {
    id: 'search',
    name: 'Recherche',
    description: 'Rechercher un device par DevEUI dans toutes les applications',
    icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    color: 'text-pink-400 bg-pink-500/10',
    glowColor: 'hover:shadow-[0_0_20px_rgba(236,72,153,0.15)] hover:border-pink-500/20',
  },
  {
    id: 'analyze',
    name: 'Analyse',
    description: 'Statistiques, filtres avances et metriques des devices',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    color: 'text-teal-400 bg-teal-500/10',
    glowColor: 'hover:shadow-[0_0_20px_rgba(20,184,166,0.15)] hover:border-teal-500/20',
  },
  {
    id: 'template',
    name: 'Template CSV',
    description: 'Telecharger un modele CSV pour l\'import',
    icon: 'M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    color: 'text-zinc-400 bg-zinc-500/10',
    glowColor: 'hover:shadow-[0_0_20px_rgba(161,161,170,0.1)] hover:border-zinc-500/20',
  },
]

function openTool(toolId: string) {
  router.push(`/tools/${toolId}`)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">Outils</h2>
        <p class="text-zinc-500 text-sm mt-1">
          Application : <span class="text-zinc-300">{{ conn.selectedApplicationName || 'Non selectionnee' }}</span>
        </p>
      </div>
    </div>

    <div v-if="!conn.isConnected || !conn.selectedApplicationId" class="card">
      <p class="text-zinc-500">Connectez-vous et selectionnez une application depuis le Dashboard pour acceder aux outils.</p>
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="card text-left hover:scale-[1.02] transition-all duration-300 cursor-pointer group"
        :class="tool.glowColor"
        @click="openTool(tool.id)"
      >
        <div class="flex items-start gap-4">
          <div class="p-2.5 rounded-xl" :class="tool.color">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :d="tool.icon" />
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-zinc-100 group-hover:text-white">{{ tool.name }}</h3>
            <p class="text-xs text-zinc-500 mt-1">{{ tool.description }}</p>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
