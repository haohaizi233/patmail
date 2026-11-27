<script setup lang="ts">
import { ref } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)

defineExpose({
  canvasRef
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="ocean-webgl-canvas"
    data-testid="workflow-ocean-canvas"
    aria-hidden="true"
  />
</template>
