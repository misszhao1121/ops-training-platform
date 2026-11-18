<template>
  <div class="page-card">
    <div class="toolbar">
      <el-radio-group v-model="showResolved" @change="load">
        <el-radio-button :value="false">未掌握（{{ pendingCount }}）</el-radio-button>
        <el-radio-button :value="true">已掌握</el-radio-button>
      </el-radio-group>
      <div class="actions">
        <el-dropdown v-if="!showResolved && pendingCount > 0" @command="onRepractice">
          <el-button type="primary" :icon="Refresh">
            错题重练<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="5">随机重练 5 题</el-dropdown-item>
              <el-dropdown-item command="10">随机重练 10 题</el-dropdown-item>
              <el-dropdown-item command="all">全部重练（{{ pendingCount }} 题）</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <el-table v-loading="loading" :data="items" stripe>
      <el-table-column label="题目" min-width="340">
        <template #default="{ row }">
          <div class="q-title" @click="openDetail(row)">{{ row.question.title }}</div>
          <div class="q-meta">
            <el-tag size="small" type="danger" effect="plain">错 {{ row.wrongCount }} 次</el-tag>
            <el-tag size="small" type="info" effect="plain">{{ TYPE_LABEL[row.question.type as QuestionType] }}</el-tag>
            <span v-if="row.question.categoryName">{{ row.question.categoryName }}</span>
            <span v-if="row.question.knowledgePoint">考点：{{ row.question.knowledgePoint }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="最后答错" width="170">
        <template #default="{ row }">{{ fmtTime(row.lastWrongAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">解析</el-button>
          <el-button link type="danger" @click="remove(row)">移除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="showResolved ? '还没有已掌握的错题' : '太棒了，没有待掌握的错题！'" />
      </template>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="load"
      />
    </div>

    <!-- 错题解析 -->
    <el-dialog v-model="detailVisible" title="错题解析" width="640px" top="6vh">
      <template v-if="detail">
        <div class="detail-title">{{ detail.question.title }}</div>
        <div class="detail-meta">
          <el-tag size="small" type="danger" effect="plain">累计错 {{ detail.wrongCount }} 次</el-tag>
          <el-tag size="small" type="info" effect="plain">{{ TYPE_LABEL[detail.question.type as QuestionType] }}</el-tag>
          <span v-if="detail.question.knowledgePoint">考点：{{ detail.question.knowledgePoint }}</span>
        </div>
        <div v-if="detail.question.options?.length" class="options">
          <div v-for="o in detail.question.options" :key="o.key" class="option-row">
            <span class="option-key">{{ o.key }}</span>
            <span>{{ o.text }}</span>
          </div>
        </div>
        <el-divider />
        <div class="answer-block">
          <div class="answer-label">标准答案</div>
          <div class="answer-value">{{ formatAnswer(detail.question) }}</div>
        </div>
        <div v-if="detail.question.explanation" class="explain-block">
          <div class="answer-label">解析</div>
          <div class="explain-value">{{ detail.question.explanation }}</div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, ArrowDown } from '@element-plus/icons-vue';
import { api } from '@/api';
import { TYPE_LABEL, type QuestionType, type WrongBookItem } from '@/types';
import { formatAnswer } from '@/utils/format';

const router = useRouter();
const loading = ref(false);
const items = ref<WrongBookItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const showResolved = ref(false);

const detailVisible = ref(false);
const detail = ref<WrongBookItem | null>(null);

const pendingCount = computed(() => total.value);

async function load() {
  loading.value = true;
  try {
    const res = await api.wrongBook({ page: page.value, pageSize, resolved: showResolved.value });
    items.value = res.data;
    total.value = res.pagination.total;
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

async function refreshCount() {
  try {
    const res = await api.wrongBookCount();
    if (!showResolved.value) total.value = res.data.pending;
  } catch {
    /* ignore */
  }
}

function fmtTime(s: string): string {
  return s ? s.replace('T', ' ').slice(0, 16) : '—';
}

function openDetail(row: WrongBookItem) {
  detail.value = row;
  detailVisible.value = true;
}

async function remove(row: WrongBookItem) {
  try {
    await ElMessageBox.confirm('确定将该题移出错题本吗？', '提示', { type: 'warning' });
  } catch {
    return;
  }
  await api.removeWrong(row.question.id);
  ElMessage.success('已移除');
  await load();
  await refreshCount();
}

async function onRepractice(cmd: string | number | object) {
  const count = cmd === 'all' ? undefined : Number(cmd);
  try {
    const res = await api.repractice({ count, mode: 'practice' });
    ElMessage.success(`已生成错题重练（${res.data.total} 题）`);
    router.push(`/practice/${res.data.id}`);
  } catch {
    /* 拦截器已提示 */
  }
}

onMounted(() => {
  load();
  refreshCount();
});
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}
.q-title {
  line-height: 1.5;
  font-weight: 500;
  cursor: pointer;
}
.q-title:hover {
  color: var(--primary);
}
.q-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: normal;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.detail-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.6;
}
.detail-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 12px 0;
  color: var(--text-muted);
  font-size: 13px;
}
.options {
  margin-top: 8px;
}
.option-row {
  padding: 8px 12px;
  background: var(--bg-surface);
  border-radius: 6px;
  margin-bottom: 8px;
  display: flex;
  gap: 10px;
}
.option-key {
  font-weight: 600;
  color: var(--primary);
}
.answer-label {
  font-weight: 600;
  margin-bottom: 6px;
}
.answer-value {
  color: var(--success);
  font-weight: 600;
}
.explain-block {
  margin-top: 14px;
}
.explain-value {
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
}
</style>
