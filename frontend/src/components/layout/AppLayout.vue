<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppNavbar from './AppNavbar.vue'
import AppSidebar from './AppSidebar.vue'
import LoraBackground from '@/components/common/LoraBackground.vue'
import { ref } from 'vue'

const sidebarOpen = ref(true)
</script>

<template>
  <div class="flex h-screen overflow-hidden relative">
    <!-- Subtle animated background for the main app -->
    <LoraBackground intensity="subtle" />

    <AppSidebar :open="sidebarOpen" @toggle="sidebarOpen = !sidebarOpen" />

    <div class="flex flex-col flex-1 overflow-hidden relative z-10">
      <AppNavbar @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <main class="flex-1 overflow-y-auto p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
