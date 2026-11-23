<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import PageHead from '../../shell/components/PageHead.vue'
import { bg, icon } from '../../shell/assets'
import { greetingForHour } from '../greeting'
import { barWidth } from '../home-report'
import { pickHomeLine } from '../home-lines'
import { useHomeCards } from '../home-cards/use-home-cards'
import { useWorkspace } from '../composables/useWorkspace'
import EmptyGuide from '../components/EmptyGuide.vue'
import wechatQr from '../assets/wechat-qr.png'

const { connection, tasks } = useWorkspace()
const ready = computed(() => connection.value.sessionStatus === 'authenticated')
const {
  allCards,
  metricCards,
  boardCards,
  isEnabled,
  toggleCard,
  resetVisibility,
  refreshing,
  lastUpdatedText,
  refresh,
} = useHomeCards()

const pickerOpen = ref(false)
const metricCardDefs = computed(() => allCards.value.filter(card => card.kind === 'metric'))
const boardCardDefs = computed(() => allCards.value.filter(card => card.kind === 'board'))

function openRoute(route?: string): void {
  if (route) location.hash = route
}

function onRefresh(): void {
  void refresh()
}

const now = ref(new Date())
let clock = 0
onMounted(() => {
  clock = window.setInterval(() => {
    now.value = new Date()
  }, 60_000)
})
onUnmounted(() => {
  window.clearInterval(clock)
})
const title = computed(() => {
  const name = connection.value.displayName
  return name ? `${greetingForHour(now.value.getHours())}，${name}！` : '首页'
})
const desc = pickHomeLine()
const qrOpen = ref(false)
const wechatButton = ref<HTMLButtonElement | null>(null)
const qrClose = ref<HTMLButtonElement | null>(null)

function closeQr(): void {
  qrOpen.value = false
  void nextTick(() => wechatButton.value?.focus())
}

watch(qrOpen, (open) => {
  if (open) void nextTick(() => qrClose.value?.focus())
})
</script>

<template>
  <PageHead :title="title" :desc="desc" :art="bg('专注每一次发文，让知识更有力量.png')">
    <address class="page-contact">
      <button ref="wechatButton" type="button" class="contact-hit" :aria-expanded="qrOpen" aria-haspopup="dialog" @click="qrOpen = true">
        <span>WeChat</span><b>MemoryLeak2023</b>
      </button>
      <p><span>GitHub</span><a href="https://github.com/haohaizi233/patmail" target="_blank" rel="noreferrer">haohaizi233</a></p>
      <p><span>phone</span><a href="tel:15603838733">15603838733</a></p>
    </address>
  </PageHead>
  <Teleport to="body">
    <div v-if="qrOpen" class="qr-layer" @click.self="closeQr" @keydown.esc="closeQr">
      <div class="qr-card" role="dialog" aria-modal="true" aria-label="微信二维码">
        <button ref="qrClose" type="button" class="qr-close" aria-label="关闭" @click="closeQr">×</button>
        <img :src="wechatQr" alt="微信二维码，MemoryLeak2023" />
      </div>
    </div>
  </Teleport>
  <div v-if="!ready" class="card"><p class="empty">尚未连接 EASY。确认登录用户之前，这里不显示客户、任务或发送统计。</p></div>
  <template v-else>
    <section class="home-report" aria-label="发文报表">
      <div class="home-report-bar">
        <div class="home-report-meta">
          <h3>运行概览</h3>
          <span class="home-live-tag" :class="{ busy: refreshing }">
            <i aria-hidden="true"></i>
            {{ lastUpdatedText }}
          </span>
        </div>
        <div class="home-report-tools">
          <button type="button" class="home-tool-btn" :disabled="refreshing" @click="onRefresh">
            {{ refreshing ? '正在同步…' : '刷新' }}
          </button>
          <button type="button" class="home-tool-btn" :class="{ on: pickerOpen }" :aria-expanded="pickerOpen" @click="pickerOpen = !pickerOpen">
            管理卡片
          </button>
        </div>
      </div>

      <div v-if="pickerOpen" class="home-card-picker" role="region" aria-label="管理首页卡片">
        <div class="home-picker-head">
          <span>勾选要展示在首页的卡片，修改立即生效并自动保存。</span>
          <button type="button" class="home-picker-reset" @click="resetVisibility">恢复默认</button>
        </div>
        <div class="home-picker-groups">
          <div class="home-picker-group">
            <b>指标卡片</b>
            <div class="home-picker-list">
              <label v-for="card in metricCardDefs" :key="card.id" class="home-picker-item" v-hint="card.description ?? ''">
                <input type="checkbox" :checked="isEnabled(card)" @change="toggleCard(card)" />
                <span>{{ card.title }}</span>
              </label>
            </div>
          </div>
          <div class="home-picker-group">
            <b>分布看板</b>
            <div class="home-picker-list">
              <label v-for="card in boardCardDefs" :key="card.id" class="home-picker-item" v-hint="card.description ?? ''">
                <input type="checkbox" :checked="isEnabled(card)" @change="toggleCard(card)" />
                <span>{{ card.title }}</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div v-if="metricCards.length > 0" class="metric-row">
        <template v-for="item in metricCards" :key="item.def.id">
          <button
            v-if="item.def.route"
            type="button"
            class="metric metric-action"
            :class="[`tone-${item.def.tone}`, { 'is-zero': item.value === 0 }]"
            @click="openRoute(item.def.route)"
          >
            <span class="metric-icon"><img :src="item.def.icon" alt="" /></span>
            <div class="metric-body">
              <b>{{ item.def.title }}<span class="metric-arrow" aria-hidden="true">→</span></b>
              <strong>{{ item.value }}</strong>
              <small v-hint.clip="item.subtitle">{{ item.subtitle }}</small>
            </div>
          </button>
          <article
            v-else
            class="metric"
            :class="[`tone-${item.def.tone}`, { 'is-zero': item.value === 0 }]"
          >
            <span class="metric-icon"><img :src="item.def.icon" alt="" /></span>
            <div class="metric-body">
              <b>{{ item.def.title }}</b>
              <strong>{{ item.value }}</strong>
              <small v-hint.clip="item.subtitle">{{ item.subtitle }}</small>
            </div>
          </article>
        </template>
      </div>

      <div v-if="boardCards.length > 0" class="report-board">
        <article
          v-for="item in boardCards"
          :key="item.def.id"
          :class="{ clickable: Boolean(item.def.route) }"
          @click="openRoute(item.def.route)"
        >
          <div class="report-board-head">
            <h2>{{ item.def.title }}</h2>
            <button
              v-if="item.def.route"
              type="button"
              class="report-board-go"
              @click.stop="openRoute(item.def.route)"
            >
              共 {{ item.total }} 项 →
            </button>
            <span v-else class="report-board-count">共 {{ item.total }} 项</span>
          </div>
          <ul>
            <li v-for="slice in item.slices" :key="slice.label">
              <span v-hint.clip="slice.label">{{ slice.label }}</span>
              <i><b :class="slice.tone" :style="{ width: barWidth(slice.count, item.slices) + '%' }"></b></i>
              <strong>{{ slice.count }}</strong>
            </li>
          </ul>
          <p v-if="item.note">{{ item.note }}</p>
        </article>
      </div>

      <div v-if="metricCards.length === 0 && boardCards.length === 0" class="card home-cards-empty">
        <p class="empty">当前未开启任何首页卡片，可点击右上角「管理卡片」重新开启或恢复默认。</p>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2><img :src="icon(11)" alt="" />最近任务</h2></div>
      <EmptyGuide v-if="tasks.length === 0" text="还没有发文任务。去发文任务里自己拼一封，或按工作流生成。" action="去发文任务" hash="/tasks" />
      <table v-else class="grid">
        <thead><tr><th>客户</th><th>文件</th><th>计划邮件</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="task in tasks" :key="task.taskId">
            <td>{{ task.customerName || '未命名' }}</td>
            <td>{{ task.fileCount }}</td>
            <td>{{ task.mailCount }}</td>
            <td><span class="chip">{{ task.status }}</span></td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</template>
