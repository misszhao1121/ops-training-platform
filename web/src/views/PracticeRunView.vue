<template>
  <div v-if="attempt && attempt.status === 'in_progress'" class="practice-wrap">
    <div class="page-card question-card">
      <div class="top-bar">
        <div class="mode-tag">
          <el-tag :type="attempt.mode === 'exam' ? 'danger' : attempt.mode === 'adaptive' ? 'warning' : 'primary'">
            {{ attempt.mode === 'exam' ? '考试模式' : attempt.mode === 'adaptive' ? '自适应练习' : '练习模式' }}
          </el-tag>
          <span class="title-text">{{ attempt.title }}</span>
        </div>
        <div class="progress-line">
          <span
            v-if="attempt.mode === 'exam' && remainSeconds !== null"
            class="countdown"
            :class="{ urgent: remainSeconds <= 300 }"
          >
            ⏱ 剩余 {{ fmtRemain(remainSeconds) }}
          </span>
          <span class="progress-text">第 {{ currentIndex + 1 }} / {{ attempt.total }} 题</span>
        </div>
      </div>

      <el-progress :percentage="Math.round(((currentIndex + 1) / attempt.total) * 100)" :show-text="false" />

      <template v-if="current">
        <div class="q-title">{{ currentIndex + 1 }}. {{ current.question.title }}</div>
        <div class="q-meta">
          <el-tag size="small" :type="difficultyType(current.question.difficulty)">{{ DIFFICULTY_LABEL[current.question.difficulty] }}</el-tag>
          <el-tag size="small" type="info" effect="plain">{{ TYPE_LABEL[current.question.type] }}</el-tag>
        </div>

        <!-- 单选 -->
        <el-radio-group v-if="current.question.type === 'single_choice'" v-model="answers[current.question.id]" class="answer-group">
          <el-radio v-for="o in current.question.options" :key="o.key" :value="o.key" border class="answer-item">
            <span class="key">{{ o.key }}</span> {{ o.text }}
          </el-radio>
        </el-radio-group>

        <!-- 多选 -->
        <el-checkbox-group v-else-if="current.question.type === 'multiple_choice'" v-model="answers[current.question.id]" class="answer-group">
          <el-checkbox v-for="o in current.question.options" :key="o.key" :value="o.key" border class="answer-item">
            <span class="key">{{ o.key }}</span> {{ o.text }}
          </el-checkbox>
        </el-checkbox-group>

        <!-- 判断 -->
        <el-radio-group v-else-if="current.question.type === 'true_false'" v-model="answers[current.question.id]" class="answer-group">
          <el-radio :value="true" border class="answer-item">正确</el-radio>
          <el-radio :value="false" border class="answer-item">错误</el-radio>
        </el-radio-group>

        <!-- 填空 -->
        <el-input v-else-if="current.question.type === 'fill_blank'" v-model="answers[current.question.id]" placeholder="请输入答案" style="max-width: 480px" />

        <!-- 简答 -->
        <el-input v-else v-model="answers[current.question.id]" type="textarea" :rows="4" placeholder="请输入你的回答" style="max-width: 640px" />

        <!-- 练习/自适应模式即时反馈 -->
        <el-alert
          v-if="(attempt.mode === 'practice' || attempt.mode === 'adaptive') && feedback[current.question.id]"
          class="feedback"
          :type="feedback[current.question.id].isCorrect === false ? 'error' : 'success'"
          :closable="false"
        >
          <template #title>
            {{ feedback[current.question.id].isCorrect ? '回答正确 ✅' : feedback[current.question.id].isCorrect === null ? '已记录（主观题待评阅）' : '回答错误 ❌' }}
          </template>
          <div v-if="feedback[current.question.id].explanation" class="feedback-explain">
            <b>解析：</b>{{ feedback[current.question.id].explanation }}
          </div>
        </el-alert>
        <el-alert
          v-if="attempt.mode === 'adaptive' && appendedHint"
          class="feedback"
          type="info"
          :closable="false"
        >
          <template #title>{{ appendedHint }}</template>
        </el-alert>
      </template>

      <div class="actions">
        <el-button :disabled="currentIndex === 0" @click="go(currentIndex - 1)">上一题</el-button>
        <el-button
          v-if="attempt.mode === 'practice' || attempt.mode === 'adaptive'"
          type="warning"
          :loading="saving"
          @click="submitCurrent"
        >
          提交本题
        </el-button>
        <el-button v-if="attempt.mode !== 'adaptive' && currentIndex < attempt.total - 1" type="primary" @click="go(currentIndex + 1)">下一题</el-button>
        <el-button type="danger" :loading="saving" @click="confirmSubmit">
          {{ attempt.mode === 'adaptive' ? '结束练习' : '交 卷' }}
        </el-button>
      </div>
    </div>

    <div class="page-card sheet-card">
      <div class="sheet-title">答题卡</div>
      <div class="sheet-grid">
        <div
          v-for="(it, i) in attempt.items"
          :key="it.id"
          class="sheet-cell"
          :class="{ current: i === currentIndex, done: hasAnswer(answers[it.question.id]) }"
          @click="go(i)"
        >
          {{ i + 1 }}
        </div>
      </div>
    </div>
  </div>

  <!-- 结果视图 -->
  <div v-else-if="attempt && attempt.status === 'completed'" class="result-wrap">
    <div class="page-card score-card">
      <div class="score-main">
        <div class="score-num">{{ attempt.score ?? 0 }}</div>
        <div class="score-label">得分（满分 100）</div>
      </div>
      <div class="score-detail">
        <div class="detail-item">答对 <b>{{ attempt.correct ?? 0 }}</b> / 客观题 {{ attempt.objectiveCount ?? attempt.total }} 题</div>
        <div class="detail-item">总题数 <b>{{ attempt.total }}</b></div>
        <div class="detail-item">用时模式：{{ attempt.mode === 'exam' ? '考试' : attempt.mode === 'adaptive' ? '自适应' : '练习' }}</div>
      </div>
      <div class="score-actions">
        <el-button type="primary" @click="$router.push('/practice')">再来一组</el-button>
        <el-button @click="$router.push('/history')">查看历史</el-button>
      </div>
    </div>

    <div class="page-card mt-16">
      <h2 class="page-title">答题回顾</h2>
      <div v-for="it in attempt.items" :key="it.id" class="review-item">
        <div class="review-head">
          <span class="review-pos">{{ it.position }}.</span>
          <span class="review-title">{{ it.question.title }}</span>
          <el-tag v-if="it.isCorrect === true" size="small" type="success">正确</el-tag>
          <el-tag v-else-if="it.isCorrect === false" size="small" type="danger">错误</el-tag>
          <el-tag v-else size="small" type="info">待评阅</el-tag>
        </div>
        <div class="review-body">
          <div class="review-line">你的答案：<b>{{ formatUserAnswer(it.question, it.userAnswer) }}</b></div>
          <div class="review-line">标准答案：<b class="ok">{{ formatAnswer(it.question) }}</b></div>
          <div v-if="it.question.explanation" class="review-explain">解析：{{ it.question.explanation }}</div>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="page-card">加载中…</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '@/api';
import { DIFFICULTY_LABEL, TYPE_LABEL, type Attempt, type Difficulty } from '@/types';
import { formatAnswer, formatUserAnswer } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const attempt = ref<Attempt | null>(null);
const currentIndex = ref(0);
const answers = reactive<Record<string, any>>({});
const feedback = reactive<Record<string, { isCorrect: boolean | null; explanation?: string | null }>>({});
const saving = ref(false);

// 考试倒计时
const remainSeconds = ref<number | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

// 自适应状态
const currentDifficulty = ref<Difficulty>('medium');
const correctStreak = ref(0);
const appendedHint = ref('');
const fetchingNext = ref(false);

const DIFF_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

function fmtRemain(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

function startCountdown(total: number) {
  remainSeconds.value = total * 90; // 每题 90 秒
  timer = setInterval(() => {
    if (remainSeconds.value === null) return;
    remainSeconds.value -= 1;
    if (remainSeconds.value !== null && remainSeconds.value <= 0) {
      remainSeconds.value = 0;
      stopCountdown();
      ElMessage.warning('考试时间到，自动交卷');
      doSubmit();
    }
  }, 1000);
}

function stopCountdown() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** 自适应：根据答题表现调整下一题难度（连对 2 题升难度，答错降难度） */
function adjustDifficulty(isCorrect: boolean | null): Difficulty {
  if (isCorrect === true) {
    correctStreak.value += 1;
    if (correctStreak.value >= 2) {
      correctStreak.value = 0;
      const idx = DIFF_ORDER.indexOf(currentDifficulty.value);
      if (idx < DIFF_ORDER.length - 1) {
        appendedHint.value = '连续答对，难度提升，下一题更有挑战 💪';
        return DIFF_ORDER[idx + 1];
      }
      appendedHint.value = '已是最难难度，继续保持！';
      return currentDifficulty.value;
    }
    appendedHint.value = '回答正确，再连对一题将提升难度';
    return currentDifficulty.value;
  }
  if (isCorrect === false) {
    correctStreak.value = 0;
    const idx = DIFF_ORDER.indexOf(currentDifficulty.value);
    if (idx > 0) {
      appendedHint.value = '回答错误，难度已降低，稳住节奏 🌱';
      return DIFF_ORDER[idx - 1];
    }
    appendedHint.value = '回答错误，继续加油';
    return currentDifficulty.value;
  }
  // 主观题待评阅：不调整
  appendedHint.value = '已记录作答（主观题交卷后评阅）';
  return currentDifficulty.value;
}

async function fetchNext(difficulty?: string) {
  if (!attempt.value) return false;
  fetchingNext.value = true;
  try {
    const res = await api.nextAttemptQuestion(attempt.value.id, { difficulty });
    attempt.value.items = [...(attempt.value.items ?? []), res.data];
    attempt.value.total = attempt.value.items.length;
    currentIndex.value = attempt.value.items.length - 1;
    currentDifficulty.value = (res.data.question.difficulty as Difficulty) ?? 'medium';
    return true;
  } catch (e: any) {
    if (e?.response?.data?.code === 'NO_MORE_QUESTIONS') {
      ElMessage.info('该范围内没有更多新题了，点击“结束练习”查看成绩');
    }
    return false;
  } finally {
    fetchingNext.value = false;
  }
}

const current = computed(() => attempt.value?.items?.[currentIndex.value] ?? null);

function difficultyType(d: Difficulty) {
  return d === 'easy' ? 'success' : d === 'medium' ? 'warning' : 'danger';
}

function hasAnswer(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

function go(i: number) {
  if (i < 0 || i >= (attempt.value?.total ?? 0)) return;
  currentIndex.value = i;
}

async function persistAnswer(questionId: string): Promise<void> {
  const ans = answers[questionId];
  if (!hasAnswer(ans) || !attempt.value) return;
  await api.answerAttempt(attempt.value.id, { questionId, answer: ans });
}

async function submitCurrent() {
  if (!current.value) return;
  if (!hasAnswer(answers[current.value.question.id])) {
    ElMessage.warning('请先作答');
    return;
  }
  saving.value = true;
  try {
    const res = await api.answerAttempt(attempt.value!.id, {
      questionId: current.value.question.id,
      answer: answers[current.value.question.id],
    });
    feedback[current.value.question.id] = {
      isCorrect: res.data.isCorrect ?? null,
      explanation: res.data.explanation,
    };
    // 自适应：按表现调整难度并自动追加下一题
    if (attempt.value?.mode === 'adaptive') {
      const nextDiff = adjustDifficulty(res.data.isCorrect ?? null);
      await fetchNext(nextDiff);
    }
  } finally {
    saving.value = false;
  }
}

async function confirmSubmit() {
  const answeredCount = attempt.value?.items?.filter((it) => hasAnswer(answers[it.question.id])).length ?? 0;
  const msg =
    attempt.value?.mode === 'exam'
      ? `已作答 ${answeredCount}/${attempt.value?.total} 题，确定交卷？`
      : attempt.value?.mode === 'adaptive'
        ? `已作答 ${answeredCount} 题，结束练习并查看成绩？`
        : '确定交卷并查看成绩？';
  try {
    await ElMessageBox.confirm(msg, attempt.value?.mode === 'adaptive' ? '结束练习' : '交卷确认', { type: 'warning' });
  } catch {
    return;
  }
  await doSubmit();
}

async function doSubmit() {
  if (!attempt.value) return;
  stopCountdown();
  saving.value = true;
  try {
    // 先持久化所有已作答题目
    for (const it of attempt.value.items ?? []) {
      if (hasAnswer(answers[it.question.id])) {
        await api.answerAttempt(attempt.value.id, {
          questionId: it.question.id,
          answer: answers[it.question.id],
        });
      }
    }
    const res = await api.submitAttempt(attempt.value.id);
    attempt.value = res.data;
    ElMessage.success(attempt.value.mode === 'adaptive' ? '练习已结束' : '交卷成功');
  } catch (e: any) {
    if (e?.response?.data?.code === 'COMPLETED') {
      const res = await api.attempt(attempt.value!.id);
      attempt.value = res.data;
    }
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  const id = route.params.id as string;
  const res = await api.attempt(id);
  attempt.value = res.data;
  // 恢复已作答内容
  for (const it of res.data.items ?? []) {
    if (it.userAnswer != null) {
      answers[it.question.id] = it.userAnswer;
      if (it.isCorrect != null) {
        feedback[it.question.id] = { isCorrect: it.isCorrect, explanation: it.question.explanation };
      }
    }
  }

  if (attempt.value.status === 'in_progress') {
    // 考试模式：启动倒计时（每题 90 秒）
    if (attempt.value.mode === 'exam') {
      startCountdown(attempt.value.total || 10);
    }
    // 自适应模式：从空会话开始，先取第一题
    if (attempt.value.mode === 'adaptive' && !(attempt.value.items ?? []).length) {
      await fetchNext('medium');
      appendedHint.value = '从中等难度开始，答对连升、答错自动降级';
    }
    // 自适应恢复：当前难度 = 最后一题难度
    if (attempt.value.mode === 'adaptive' && (attempt.value.items ?? []).length) {
      const last = attempt.value.items![attempt.value.items!.length - 1];
      currentDifficulty.value = (last.question.difficulty as Difficulty) ?? 'medium';
      currentIndex.value = attempt.value.items!.length - 1;
    }
  }
});

onUnmounted(() => {
  stopCountdown();
});
</script>

<style scoped>
.practice-wrap {
  max-width: 860px;
}
.question-card {
  margin-bottom: 16px;
}
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.mode-tag {
  display: flex;
  align-items: center;
  gap: 10px;
}
.title-text {
  font-weight: 600;
}
.progress-line {
  display: flex;
  align-items: center;
  gap: 14px;
}
.countdown {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 14px;
}
.countdown.urgent {
  color: #f56c6c;
}
.progress-text {
  color: #909399;
  font-size: 14px;
}
.q-title {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.6;
  margin: 18px 0 8px;
}
.q-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.answer-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
}
.answer-item {
  height: auto;
  padding: 10px 14px;
  margin-right: 0;
  white-space: normal;
  display: flex;
  align-items: center;
}
.answer-item .key {
  color: #409eff;
  font-weight: 600;
  margin-right: 8px;
}
.feedback {
  margin-top: 18px;
}
.feedback-explain {
  line-height: 1.6;
  margin-top: 6px;
}
.actions {
  margin-top: 22px;
  display: flex;
  gap: 10px;
}
.sheet-card {
  padding: 16px 20px;
}
.sheet-title {
  font-weight: 600;
  margin-bottom: 12px;
}
.sheet-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sheet-cell {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  color: #606266;
}
.sheet-cell.current {
  border-color: #409eff;
  color: #409eff;
  font-weight: 700;
}
.sheet-cell.done {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}

.result-wrap {
  max-width: 860px;
}
.score-card {
  display: flex;
  align-items: center;
  gap: 40px;
}
.score-main {
  text-align: center;
  min-width: 140px;
}
.score-num {
  font-size: 52px;
  font-weight: 700;
  color: #409eff;
  line-height: 1;
}
.score-label {
  color: #909399;
  margin-top: 8px;
}
.score-detail {
  flex: 1;
}
.detail-item {
  padding: 4px 0;
  color: #606266;
}
.score-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.review-item {
  padding: 16px 0;
  border-bottom: 1px solid #f0f2f5;
}
.review-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.review-pos {
  font-weight: 700;
  color: #409eff;
}
.review-title {
  font-weight: 600;
  flex: 1;
}
.review-body {
  margin: 10px 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #606266;
}
.review-line .ok {
  color: #67c23a;
}
.review-explain {
  background: #f7f8fa;
  border-radius: 6px;
  padding: 10px 12px;
  line-height: 1.7;
}
</style>
