<script setup lang="ts">
import { computed } from 'vue'
import { treeCheckState, type OptionTreeNode } from '../../query/option-tree'

const props = defineProps<{
  nodeId: string
  byId: Map<string, OptionTreeNode>
  selected: string[]
  expanded: Record<string, boolean>
  visible: Set<string> | null
  trail: string[]
  multiple: boolean
  leavesOnly?: boolean
  inputName: string
}>()
const emit = defineEmits<{ toggle: [id: string]; expand: [id: string] }>()
const node = computed(() => props.byId.get(props.nodeId))
const cyclic = computed(() => props.trail.includes(props.nodeId))
const children = computed(() => cyclic.value ? [] : (node.value?.childIds ?? []).filter(id => !props.visible || props.visible.has(id)))
const checkState = computed(() => treeCheckState({ roots: [], byId: props.byId }, props.selected, props.nodeId))
const open = computed(() => Boolean(props.expanded[props.nodeId]))
</script>

<template>
  <div v-if="node && (!visible || visible.has(nodeId))" class="theme-tree-node" role="treeitem" :aria-expanded="children.length ? open : undefined">
    <div class="theme-tree-row">
      <button v-if="children.length" type="button" class="theme-tree-toggle" :aria-label="open ? '收起' : '展开'" @click="emit('expand', nodeId)">{{ open ? '−' : '+' }}</button>
      <span v-else class="theme-tree-leaf" aria-hidden="true"></span>
      <label class="theme-tree-check">
        <input v-if="multiple" type="checkbox" :disabled="node.selectable === false && node.childIds.length === 0" :checked="checkState.checked" :indeterminate="checkState.indeterminate" :aria-checked="checkState.indeterminate ? 'mixed' : checkState.checked" @change="emit('toggle', nodeId)" />
        <input v-else type="radio" :disabled="node.selectable === false || (leavesOnly && node.childIds.length > 0)" :name="inputName" :checked="selected.includes(nodeId)" @change="emit('toggle', nodeId)" />
        <span v-hint.clip="node.label">{{ node.label }}</span>
      </label>
    </div>
    <div v-if="open && children.length" class="theme-tree-children" role="group">
      <TreeOptionNode v-for="childId in children" :key="childId" :node-id="childId" :by-id="byId" :selected="selected" :expanded="expanded" :visible="visible" :trail="[...trail, nodeId]" :multiple="multiple" :leaves-only="leavesOnly" :input-name="inputName" @toggle="emit('toggle', $event)" @expand="emit('expand', $event)" />
    </div>
  </div>
</template>
