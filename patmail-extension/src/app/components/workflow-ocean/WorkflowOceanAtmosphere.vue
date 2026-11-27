<script setup lang="ts">
defineProps<{
  active: boolean
}>()
</script>

<template>
  <div
    class="ocean-atmosphere"
    :data-paused="active ? 'false' : 'true'"
    aria-hidden="true"
  >
    <span class="ocean-orb ocean-orb-a" />
    <span class="ocean-orb ocean-orb-b" />
    <span class="ocean-orb ocean-orb-c" />
    <span class="ocean-bubble ocean-bubble-1" />
    <span class="ocean-bubble ocean-bubble-2" />
    <span class="ocean-bubble ocean-bubble-3" />
    <span class="ocean-bubble ocean-bubble-4" />
    <svg class="ocean-arcs" viewBox="0 0 1440 420" preserveAspectRatio="none">
      <path
        d="M-60 280 C 260 120, 640 310, 1020 140 S 1340 80, 1520 160"
        fill="none"
        stroke="rgba(255,255,255,0.48)"
        stroke-width="1.4"
      />
      <path
        d="M120 360 C 420 210, 780 340, 1140 190 S 1360 140, 1500 200"
        fill="none"
        stroke="rgba(232,205,255,0.42)"
        stroke-width="1.1"
        stroke-dasharray="5 7"
      />
    </svg>
  </div>
</template>
