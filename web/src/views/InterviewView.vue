<template>
  <div class="interview-wrap">
    <!-- 阶段 1：开始面试 -->
    <template v-if="stage === 'setup'">
      <div class="page-card">
        <h2 class="page-title">面试模拟</h2>
        <p class="desc">
          选择主题方向，系统将抽取简答题并逐题评分。回答按要点命中率打分，结束后给出等级评价与薄弱点分析。
        </p>
        <el-form label-width="90px" class="setup-form">
          <el-form-item label="主题方向">
            <el-select v-model="form.categoryId" placeholder="全部主题" clearable style="width: 280px">
              <el-option
                v-for="t in topics"
                :key="t.id"
                :label="`${t.name}（${t.questionCount} 题）`"
                :value="t.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="难度">
            <el-select v-model="form.difficulty" placeholder="全部难度" clearable style="width: 200px">
              <el-option label="简单" value="easy" />
              <el-option label="中等" value="medium" />
              <el-option label="困难" value="hard" />
            </el-select>
          </el-form-item>
          <el-form-item label="题数">
            <el-input-number v-model="form.count" :min="1" :max="20" />
            <span class="tip">（1 - 20 题）</span>
          </el-form-item>
          <el-form-item label="面试名称">
            <el-input v-model="form.topic" placeholder="可选，如：Linux 运维一面" style="width: 320px" maxlength="60" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="large" :loading="creating" @click="start">开始面试</el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="page-card mt-16" v-if="history.length">
        <h3 class="block-title">我的面试记录</h3>
        <el-table :data="history" size="small">
          <el-table-column label="名称" min-width="180">
            <template #default="{ row }">{{ row.topic }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.status === 'completed' ? 'success' : 'warning'">
                {{ row.status === 'completed' ? '已完成' : '进行中' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="得分" width="80">
            <template #default="{ row }">{{ row.score ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="进度" width="90">
            <template #default="{ row }">{{ row.answeredCount }} / {{ row.total }}</template>
          </el-table-column>
          <el-table-column label="时间" width="160">
            <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button link type="primary" @click="resume(row)">{{ row.status === 'completed' ? '查看报告' : '继续' }}</el-button>
              <el-button link type="danger" @click="removeSession(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <!-- 阶段 2：逐题问答 -->
    <template v-else-if="stage === 'qa' && session">
      <div class="page-card">
        <div class="top-bar">
          <div class="mode-line">
            <el-tag type="warning">面试模式</el-tag>
            <span class="session-title">{{ session.topic }}</span>
          </div>
          <div class="progress-text">第 {{ currentIndex + 1 }} / {{ session.questions.length }} 题</div>
        </div>
        <el-progress :percentage="Math.round(((currentIndex + 1) / session.questions.length) * 100)" :show-text="false" />

        <template v-if="currentQ">
          <div class="q-title">{{ currentQ.title }}</div>
          <div class="q-meta">
            <el-tag size="small" type="info" effect="plain">{{ TYPE_LABEL[currentQ.type] }}</el-tag>
            <span v-if="currentQ.categoryName">{{ currentQ.categoryName }}</span>
            <span v-if="currentQ.knowledgePoint">考点：{{ currentQ.knowledgePoint }}</span>
          </div>

          <el-input
            v-model="answerText"
            type="textarea"
            :rows="7"
            maxlength="5000"
            show-word-limit
            placeholder="像真实面试一样，尽量分点、完整地口述你的思路…"
            class="answer-area"
            :disabled="!!result"
          />

          <!-- 即时评分 -->
          <div v-if="result" class="score-panel">
            <div class="score-line">
              <span class="score-num" :class="scoreClass(result.score)">{{ result.score }} 分</span>
              <span class="score-comment">{{ result.comment }}</span>
            </div>
            <div v-if="result.hits.length" class="hit-line ok">命中要点：{{ result.hits.join('、') }}</div>
            <div v-if="result.missed.length" class="hit-line miss">遗漏要点：{{ result.missed.join('、') }}</div>
            <div v-if="result.referenceAnswer" class="ref-block">
              <div class="ref-label">参考答案</div>
              <div class="ref-value">{{ result.referenceAnswer }}</div>
            </div>
            <div v-if="result.explanation" class="ref-block">
              <div class="ref-label">解析</div>
              <div class="ref-value">{{ result.explanation }}</div>
            </div>
          </div>

          <div class="actions">
            <el-button :disabled="currentIndex === 0" @click="go(currentIndex - 1)">上一题</el-button>
            <el-button
              v-if="!result"
              type="primary"
              :loading="answering"
              :disabled="!answerText.trim()"
              @click="submitAnswer"
            >
              提交回答
            </el-button>
            <el-button v-if="result && currentIndex < session.questions.length - 1" type="primary" @click="go(currentIndex + 1)">
              下一题
            </el-button>
            <el-button type="danger" :loading="finishing" @click="finish">结束面试</el-button>
          </div>
        </template>
      </div>
    </template>

    <!-- 阶段 3：总报告 -->
    <template v-else-if="stage === 'report' && session">
      <div class="page-card report-card">
        <div class="report-head">
          <div class="report-score">
            <div class="score-num" :class="scoreClass(session.score ?? 0)">{{ session.score ?? 0 }}</div>
            <div class="score-label">面试总分</div>
          </div>
          <div class="report-summary" v-if="session.feedback">
            <el-tag size="large" :type="levelType(session.feedback.level)">{{ session.feedback.level }}</el-tag>
            <p class="advice">{{ session.feedback.advice }}</p>
            <p class="answered-line">共回答 {{ session.feedback.answeredCount }} / {{ session.feedback.totalCount }} 题</p>
          </div>
        </div>
      </div>

      <div class="page-card mt-16" v-if="session.feedback?.categoryScores?.length">
        <h3 class="block-title">各方向得分</h3>
        <div v-for="c in session.feedback.categoryScores" :key="c.name" class="cat-row">
          <span class="cat-name">{{ c.name }}</span>
          <el-progress :percentage="c.avgScore" :stroke-width="12" :color="catColor(c.avgScore)" />
          <span class="cat-count">{{ c.count }} 题</span>
        </div>
      </div>

      <div class="page-card mt-16" v-if="session.feedback?.details?.length">
        <h3 class="block-title">逐题回顾</h3>
        <div v-for="(d, i) in session.feedback.details" :key="d.questionId" class="review-item">
          <div class="review-head">
            <span class="review-pos">{{ i + 1 }}.</span>
            <span class="review-title">{{ d.title }}</span>
            <el-tag size="small" :type="d.score >= 80 ? 'success' : d.score >= 50 ? 'warning' : 'danger'">{{ d.score }} 分</el-tag>
          </div>
          <div class="review-body">
            <div v-if="d.hits.length" class="review-line ok">命中：{{ d.hits.join('、') }}</div>
            <div v-if="d.missed.length" class="review-line miss">遗漏：{{ d.missed.join('、') }}</div>
            <div class="review-line">{{ d.comment }}</div>
          </div>
        </div>
      </div>

      <div class="report-actions">
        <el-button type="primary" @click="backToSetup">再来一场</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '@/api';
import {
  TYPE_LABEL,
  type InterviewAnswerResult,
  type InterviewSession,
  type InterviewTopic,
} from '@/types';

type Stage = 'setup' | 'qa' | 'report';

const stage = ref<Stage>('setup');
const topics = ref<InterviewTopic[]>([]);
const history = ref<InterviewSession[]>([]);
const creating = ref(false);
const answering = ref(false);
const finishing = ref(false);

const form = ref({
  categoryId: undefined as string | undefined,
  difficulty: undefined as string | undefined,
  count: 5,
  topic: '',
});

const session = ref<InterviewSession | null>(null);
const currentIndex = ref(0);
const answerText = ref('');
const result = ref<InterviewAnswerResult | null>(null);

const currentQ = computed(() => session.value?.questions?.[currentIndex.value] ?? null);

function fmtTime(s: string): string {
  return s ? s.replace('T', ' ').slice(0, 16) : '—';
}

function scoreClass(score: number) {
  return score >= 80 ? 'good' : score >= 50 ? 'mid' : 'bad';
}

function levelType(level: string) {
  if (level.includes('优秀')) return 'success';
  if (level.includes('良好')) return 'primary';
  if (level.includes('合格') || level.includes('一般')) return 'warning';
  return 'danger';
}

function catColor(score: number) {
  return score >= 80 ? '#67c23a' : score >= 50 ? '#e6a23c' : '#f56c6c';
}

async function loadHistory() {
  try {
    const res = await api.interviewSessions({ page: 1, pageSize: 10 });
    history.value = res.data;
  } catch {
    /* ignore */
  }
}

async function start() {
  creating.value = true;
  try {
    const res = await api.createInterview({
      categoryId: form.value.categoryId || undefined,
      difficulty: form.value.difficulty || undefined,
      count: form.value.count,
      topic: form.value.topic || undefined,
    });
    session.value = res.data;
    currentIndex.value = 0;
    answerText.value = '';
    result.value = null;
    stage.value = 'qa';
  } catch (e: any) {
    if (e?.response?.data?.code === 'NO_QUESTIONS') {
      ElMessage.warning('该条件下没有可用的面试题，请调整主题或难度');
    }
  } finally {
    creating.value = false;
  }
}

async function resume(row: InterviewSession) {
  try {
    const res = await api.interviewSession(row.id);
    session.value = res.data;
    if (res.data.status === 'completed') {
      stage.value = 'report';
    } else {
      // 恢复到第一个未答的题
      const idx = res.data.questions.findIndex((q) => !q.answer);
      currentIndex.value = idx >= 0 ? idx : 0;
      answerText.value = res.data.questions[currentIndex.value]?.answer?.content ?? '';
      result.value = null;
      stage.value = 'qa';
    }
  } catch {
    /* ignore */
  }
}

async function removeSession(row: InterviewSession) {
  try {
    await ElMessageBox.confirm('确定删除该面试记录吗？', '提示', { type: 'warning' });
  } catch {
    return;
  }
  await api.deleteInterview(row.id);
  ElMessage.success('已删除');
  loadHistory();
}

function go(i: number) {
  if (!session.value) return;
  if (i < 0 || i >= session.value.questions.length) return;
  currentIndex.value = i;
  answerText.value = session.value.questions[i]?.answer?.content ?? '';
  result.value = session.value.questions[i]?.answer
    ? {
        questionId: session.value.questions[i]!.id,
        score: session.value.questions[i]!.answer!.score,
        hits: session.value.questions[i]!.answer!.hits,
        missed: session.value.questions[i]!.answer!.missed,
        comment: session.value.questions[i]!.answer!.comment,
        referenceAnswer: session.value.questions[i]!.referenceAnswer ?? '',
        explanation: session.value.questions[i]!.explanation ?? null,
      }
    : null;
}

async function submitAnswer() {
  if (!currentQ.value || !session.value) return;
  if (!answerText.value.trim()) {
    ElMessage.warning('请先作答');
    return;
  }
  answering.value = true;
  try {
    const res = await api.answerInterview(session.value.id, {
      questionId: currentQ.value.id,
      answer: answerText.value,
    });
    result.value = res.data;
    // 同步到本地会话
    const q = session.value.questions.find((x) => x.id === currentQ.value!.id);
    if (q) {
      q.answer = {
        content: answerText.value,
        score: res.data.score,
        hits: res.data.hits,
        missed: res.data.missed,
        comment: res.data.comment,
        answeredAt: new Date().toISOString(),
      };
      session.value.answeredCount = session.value.questions.filter((x) => x.answer).length;
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    answering.value = false;
  }
}

async function finish() {
  if (!session.value) return;
  const unanswered = session.value.questions.length - session.value.answeredCount;
  try {
    if (unanswered > 0) {
      await ElMessageBox.confirm(`还有 ${unanswered} 题未作答，确定结束并生成报告？`, '结束面试', { type: 'warning' });
    }
  } catch {
    return;
  }
  finishing.value = true;
  try {
    const res = await api.finishInterview(session.value.id);
    session.value = res.data;
    stage.value = 'report';
    loadHistory();
  } catch (e: any) {
    if (e?.response?.data?.code === 'NO_ANSWERS') {
      ElMessage.warning('至少回答一道题后才能结束面试');
    }
  } finally {
    finishing.value = false;
  }
}

function backToSetup() {
  stage.value = 'setup';
  session.value = null;
  loadHistory();
}

onMounted(async () => {
  try {
    const res = await api.interviewTopics();
    topics.value = res.data;
  } catch {
    /* ignore */
  }
  loadHistory();
});
</script>

<style scoped>
.interview-wrap {
  max-width: 860px;
}
.desc {
  color: var(--text-muted);
  line-height: 1.8;
  margin: -8px 0 18px;
}
.setup-form {
  max-width: 560px;
}
.tip {
  margin-left: 10px;
  color: var(--text-muted);
  font-size: 13px;
}
.block-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
}
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.mode-line {
  display: flex;
  align-items: center;
  gap: 10px;
}
.session-title {
  font-weight: 600;
}
.progress-text {
  color: var(--text-muted);
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
  margin-bottom: 14px;
  color: var(--text-muted);
  font-size: 13px;
}
.answer-area {
  margin-bottom: 6px;
}
.score-panel {
  margin-top: 14px;
  padding: 14px 16px;
  background: var(--bg-surface);
  border-radius: 10px;
}
.score-line {
  display: flex;
  align-items: center;
  gap: 12px;
}
.score-num {
  font-size: 26px;
  font-weight: 700;
}
.score-num.good {
  color: #67c23a;
}
.score-num.mid {
  color: #e6a23c;
}
.score-num.bad {
  color: #f56c6c;
}
.score-comment {
  color: var(--text-secondary);
  font-size: 13px;
}
.hit-line {
  margin-top: 8px;
  font-size: 13px;
}
.hit-line.ok {
  color: #67c23a;
}
.hit-line.miss {
  color: #f56c6c;
}
.ref-block {
  margin-top: 12px;
}
.ref-label {
  font-weight: 600;
  margin-bottom: 4px;
  font-size: 13px;
}
.ref-value {
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
  font-size: 13px;
}
.actions {
  margin-top: 20px;
  display: flex;
  gap: 10px;
}
.report-head {
  display: flex;
  align-items: center;
  gap: 40px;
}
.report-score {
  text-align: center;
  min-width: 130px;
}
.report-score .score-num {
  font-size: 52px;
  font-weight: 700;
  line-height: 1;
}
.report-score .score-label {
  color: var(--text-muted);
  margin-top: 8px;
}
.report-summary {
  flex: 1;
}
.advice {
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 10px 0;
}
.answered-line {
  color: var(--text-muted);
  font-size: 13px;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.cat-name {
  width: 130px;
  flex-shrink: 0;
  font-size: 13px;
}
.cat-count {
  width: 40px;
  text-align: right;
  color: var(--text-muted);
  font-size: 13px;
}
.review-item {
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color);
}
.review-item:last-child {
  border-bottom: none;
}
.review-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.review-pos {
  font-weight: 700;
  color: var(--primary);
}
.review-title {
  font-weight: 600;
  flex: 1;
}
.review-body {
  margin: 8px 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}
.review-line.ok {
  color: #67c23a;
}
.review-line.miss {
  color: #f56c6c;
}
.report-actions {
  margin-top: 16px;
}
</style>
