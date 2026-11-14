<script setup>
import Bunny from './Bunny.vue'
// eslint-disable-next-line vue/require-default-prop -- 存量豁免：optional prop 由父组件保证传入
defineProps({ title: String, desc: String, art: String, artLarge: Boolean })
</script>

<template>
  <header class="page-head">
    <Bunny />
    <div class="page-copy">
      <h1>{{ title }}</h1>
      <p>{{ desc }} <span>♥</span></p>
    </div>
    <slot />
    <img v-if="art" class="page-art" :class="{ 'page-art-lg': artLarge }" :src="art" alt="" />
  </header>
</template>
