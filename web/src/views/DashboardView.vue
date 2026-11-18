<template>
  <div>
    <div class="page-card hero">
      <div>
        <h2 class="hero-title">你好，{{ auth.user?.username }} 👋</h2>
        <p class="hero-sub">选择行业与题库，今天也来练几道题提升自己。</p>
      </div>
      <div class="hero-actions">
        <el-tag
          :type="checkin?.todayDone ? 'success' : 'info'"
          :effect="checkin?.todayDone ? 'light' : 'plain'"
          size="large"
        >
          {{ checkin?.todayDone ? '今日已打卡 ✓' : '今日还未打卡，练一练吧' }}
        </el-tag>
        <el-button type="primary" size="large" @click="$router.push('/practice')">开始练习</el-button>
        <el-button size="large" @click="$router.push('/bank')">浏览题库</el-button>
      </div>
    </div>

    <el-row :gutter="16" class="mt-16">
      <el-col :span="4" v-for="c in personalCards" :key="c.label">
        <el-card shadow="hover">
          <div class="stat">
            <div class="stat-value">{{ c.value }}</div>
            <div class="stat-label">{{ c.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mt-16">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>学习打卡</span>
              <span class="streak-badge">🔥 连续 {{ checkin?.streakDays ?? 0 }} 天</span>
            </div>
          </template>
          <div class="calendar">
            <div
              v-for="d in calendarDays"
              :key="d.date"
              class="cal-cell"
              :class="{ today: d.isToday }"
            >
              <el-tooltip :content="`${d.date}：练习 ${d.count} 次`" placement="top">
                <span class="cal-inner" :style="heatStyle(d.count)">{{ d.day }}</span>
              </el-tooltip>
            </div>
          </div>
          <div class="checkin-summary">
            累计打卡 <b>{{ checkin?.totalDays ?? 0 }}</b> 天 · 浅→深 表示当天练习次数增多
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>正确题数排行榜</span>
              <el-radio-group v-model="lbRange" size="small" @change="loadLeaderboard">
                <el-radio-button value="week">周</el-radio-button>
                <el-radio-button value="month">月</el-radio-button>
                <el-radio-button value="all">总</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div v-for="e in leaderboard" :key="e.userId" class="lb-row" :class="{ me: e.userId === auth.user?.id }">
            <span class="lb-rank" :class="`top-${e.rank}`">{{ e.rank }}</span>
            <span class="lb-name">{{ e.username }}</span>
            <span class="lb-stat">{{ e.correct }} / {{ e.answered }} 题（{{ e.accuracy ?? 0 }}%）</span>
          </div>
          <div
            v-if="leaderboardMe && !leaderboard.some((x) => x.userId === leaderboardMe!.userId)"
            class="lb-row me out"
          >
            <span class="lb-rank">{{ leaderboardMe.rank }}</span>
            <span class="lb-name">{{ leaderboardMe.username }}</span>
            <span class="lb-stat">{{ leaderboardMe.correct }} / {{ leaderboardMe.answered }} 题</span>
          </div>
          <el-empty
            v-if="!leaderboard.length"
            description="暂无上榜数据，完成一次练习即可上榜"
            :image-size="60"
          />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mt-16">
      <el-col :span="12">
        <el-card shadow="never" header="平台题库">
          <div class="kv" v-for="c in platformCards" :key="c.label">
            <span>{{ c.label }}</span>
            <b>{{ c.value }}</b>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never" header="难度分布">
          <div v-for="d in difficultyRows" :key="d.label" class="dist-row">
            <span class="dist-label">{{ d.label }}</span>
            <el-progress :percentage="d.percent" :stroke-width="12" :color="d.color" />
            <span class="dist-count">{{ d.n }}</span>
          </div>
          <div class="mt-16">
            <div class="sub-title">题型分布</div>
            <el-tag v-for="t in byType" :key="t.type" class="type-tag" size="small">
              {{ typeLabel(t.type) }} · {{ t.n }}
            </el-tag>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import {
  DIFFICULTY_LABEL,
  TYPE_LABEL,
  type CheckinData,
  type Difficulty,
  type LeaderboardEntry,
  type OverviewStats,
} from '@/types';

const auth = useAuthStore();
const stats = ref<OverviewStats | null>(null);
const checkin = ref<CheckinData | null>(null);
const wrongCount = ref(0);
const leaderboard = ref<LeaderboardEntry[]>([]);
const leaderboardMe = ref<LeaderboardEntry | null>(null);
const lbRange = ref<'week' | 'month' | 'all'>('all');

const personalCards = computed(() => {
  const p = stats.value?.personal;
  const fmt = (v: number | null | undefined) => (v == null ? '—' : String(v));
  return [
    { label: '连续打卡', value: `${checkin.value?.streakDays ?? 0} 天` },
    { label: '练习次数', value: fmt(p?.attemptCount ?? 0) },
    { label: '已完成', value: fmt(p?.completedCount ?? 0) },
    { label: '平均分', value: fmt(p?.avgScore) },
    { label: '正确率', value: p?.accuracy == null ? '—' : `${p.accuracy}%` },
    { label: '待掌握错题', value: String(wrongCount.value) },
  ];
});

// 近 35 天打卡日历
const calendarDays = computed(() => {
  const counts = new Map((checkin.value?.recent ?? []).map((r) => [r.date, r.count]));
  const days: { date: string; day: string; count: number; isToday: boolean }[] = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    days.push({
      date,
      day: String(d.getDate()),
      count: counts.get(date) ?? 0,
      isToday: date === checkin.value?.today,
    });
  }
  return days;
});

function heatStyle(count: number): Record<string, string> {
  if (count <= 0) return { background: 'var(--bg-surface)', color: 'var(--text-muted)' };
  if (count === 1) return { background: '#c6e6ff', color: '#1f5c8b' };
  if (count <= 3) return { background: '#7cc0f5', color: '#ffffff' };
  return { background: '#2f8fd8', color: '#ffffff' };
}

async function loadLeaderboard() {
  try {
    const res = await api.leaderboard(lbRange.value);
    leaderboard.value = res.data.entries;
    leaderboardMe.value = res.data.me;
  } catch {
    /* ignore */
  }
}

const platformCards = computed(() => {
  const p = stats.value?.platform;
  return [
    { label: '题目总数', value: p?.questionCount ?? 0 },
    { label: '分类', value: p?.categoryCount ?? 0 },
    { label: '标签', value: p?.tagCount ?? 0 },
    { label: '注册用户', value: p?.userCount ?? 0 },
  ];
});

const difficultyRows = computed(() => {
  const map = stats.value?.byDifficulty ?? [];
  const total = map.reduce((s, x) => s + Number(x.n), 0) || 1;
  const colorMap: Record<string, string> = { easy: '#67c23a', medium: '#e6a23c', hard: '#f56c6c' };
  return (['easy', 'medium', 'hard'] as Difficulty[]).map((d) => {
    const n = Number(map.find((x) => x.difficulty === d)?.n ?? 0);
    return { label: DIFFICULTY_LABEL[d], n, percent: Math.round((n / total) * 100), color: colorMap[d] };
  });
});

const byType = computed(() => stats.value?.byType ?? []);

function typeLabel(t: string) {
  return TYPE_LABEL[t as keyof typeof TYPE_LABEL] ?? t;
}

onMounted(async () => {
  try {
    const [statsRes, checkinRes, wrongRes] = await Promise.all([
      api.stats(),
      api.checkin(),
      api.wrongBookCount(),
    ]);
    stats.value = statsRes.data;
    checkin.value = checkinRes.data;
    wrongCount.value = wrongRes.data.pending;
  } catch {
    /* ignore */
  }
  loadLeaderboard();
});
</script>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hero-title {
  margin: 0;
}
.hero-sub {
  color: #909399;
  margin: 8px 0 0;
}
.hero-actions {
  display: flex;
  gap: 12px;
}
.stat {
  text-align: center;
  padding: 8px 0;
}
.stat-value {
  font-size: 30px;
  font-weight: 700;
  color: #409eff;
}
.stat-label {
  color: #909399;
  margin-top: 4px;
}
.kv {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f0f2f5;
}
.kv:last-child {
  border-bottom: none;
}
.dist-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.dist-label {
  width: 40px;
  flex-shrink: 0;
}
.dist-count {
  width: 30px;
  text-align: right;
  color: #909399;
}
.sub-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}
.type-tag {
  margin: 0 8px 8px 0;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.streak-badge {
  color: #e6772e;
  font-weight: 600;
  font-size: 13px;
}
.calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.cal-cell {
  aspect-ratio: 1;
}
.cal-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  font-size: 12px;
  cursor: default;
}
.cal-cell.today .cal-inner {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
  font-weight: 700;
}
.checkin-summary {
  margin-top: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
.checkin-summary b {
  color: var(--primary);
}
.lb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
}
.lb-row.me {
  background: var(--primary-light);
}
.lb-rank {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}
.lb-rank.top-1 {
  background: #f6c344;
  color: #ffffff;
}
.lb-rank.top-2 {
  background: #c0c8d0;
  color: #ffffff;
}
.lb-rank.top-3 {
  background: #e2a878;
  color: #ffffff;
}
.lb-name {
  flex: 1;
  font-weight: 500;
}
.lb-stat {
  color: var(--text-muted);
  font-size: 13px;
}
</style>
