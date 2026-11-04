<script setup lang="ts">
defineProps<{ page: number; pages: number; total: number }>()
const emit = defineEmits<{ 'update:page': [page: number] }>()
</script>
<template>
  <div v-if="pages > 1" class="mapping-pagination">
    <span>共 {{ total }} 行，每页 10 行</span>
    <button type="button" class="ghost" :disabled="page <= 1" @click="emit('update:page', page - 1)">上一页</button>
    <span>{{ page }} / {{ pages }}</span>
    <button type="button" class="ghost" :disabled="page >= pages" @click="emit('update:page', page + 1)">下一页</button>
  </div>
</template>
<style scoped>
.mapping-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 12px; color: #8b95ad; font-size: 13px; }
.mapping-pagination button { padding: 4px 12px; }
</style>
