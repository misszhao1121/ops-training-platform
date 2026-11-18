<template>
  <div class="page-card">
    <!-- 筛选工具栏：筛选条件居左，操作按钮居右 -->
    <div class="toolbar">
      <div class="filters">
        <el-input
          v-model="filters.q"
          placeholder="搜索题干 / 考点 / 来源"
          clearable
          class="w-220"
          @keyup.enter="search"
          @clear="search"
        />
        <el-tree-select
          v-model="filters.categoryId"
          :data="categoryTree"
          :props="{ label: 'name', children: 'children' }"
          node-key="id"
          value-key="id"
          check-strictly
          clearable
          placeholder="分类"
          class="w-150"
          @change="search"
        />
        <el-select
          v-model="filters.difficulty"
          placeholder="难度"
          clearable
          class="w-100"
          @change="search"
        >
          <el-option label="简单" value="easy" />
          <el-option label="中等" value="medium" />
          <el-option label="困难" value="hard" />
        </el-select>
        <el-select
          v-model="filters.type"
          placeholder="题型"
          clearable
          class="w-110"
          @change="search"
        >
          <el-option v-for="(label, val) in TYPE_LABEL" :key="val" :label="label" :value="val" />
        </el-select>
        <el-select
          v-model="filters.tag"
          placeholder="标签"
          clearable
          filterable
          class="w-130"
          @change="search"
        >
          <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.name" />
        </el-select>
        <el-button :icon="Search" @click="search">查询</el-button>
        <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
      </div>
      <div class="actions">
        <el-button :icon="Reading" :disabled="!questions.length" @click="enterFlash">
          背题模式
        </el-button>
        <el-button v-if="auth.isAdmin" :icon="Upload" @click="openImport">导入题库</el-button>
        <el-button type="primary" :icon="EditPen" @click="$router.push('/practice')">
          开始练习
        </el-button>
      </div>
    </div>

    <!-- 背题卡片模式 -->
    <template v-if="flashMode">
      <div class="flash-wrap">
        <div
          v-if="flashList.length"
          class="flash-card"
          :class="{ flipped }"
          @click="flipped = !flipped"
        >
          <template v-if="!flipped">
            <div class="flash-front">
              <div class="flash-q">{{ flashCurrent?.title }}</div>
              <div class="q-meta" style="justify-content: center">
                <el-tag size="small" type="info" effect="plain">{{ TYPE_LABEL[flashCurrent.type as QuestionType] }}</el-tag>
                <el-tag size="small" :type="difficultyType(flashCurrent.difficulty)">{{ DIFFICULTY_LABEL[flashCurrent.difficulty as Difficulty] }}</el-tag>
                <span v-if="flashCurrent.knowledgePoint">考点：{{ flashCurrent.knowledgePoint }}</span>
              </div>
              <div class="flash-tip">点击卡片查看答案</div>
            </div>
          </template>
          <template v-else>
            <div class="flash-back" @click.stop>
              <div class="flash-options">
                <div
                  v-for="o in flashCurrent.options ?? []"
                  :key="o.key"
                  class="flash-option"
                  :class="{ correct: isCorrectOption(flashCurrent, o.key) }"
                >
                  <span class="option-key">{{ o.key }}</span>
                  <span>{{ o.text }}</span>
                </div>
                <div v-if="!(flashCurrent.options ?? []).length" class="flash-answer-line">
                  答案：<b class="ok">{{ formatAnswer(flashCurrent) }}</b>
                </div>
              </div>
              <div class="flash-answer-line" v-if="formatAnswer(flashCurrent)">
                答案：<b class="ok">{{ formatAnswer(flashCurrent) }}</b>
              </div>
              <div v-if="flashCurrent.explanation" class="flash-explain">{{ flashCurrent.explanation }}</div>
              <div class="flash-tip">点击卡片返回题干</div>
            </div>
          </template>
        </div>
        <div v-else>
          <el-empty description="当前列表没有题目" />
        </div>

        <div class="flash-actions">
          <el-button :disabled="flashIndex === 0" @click="flashPrev">上一张</el-button>
          <span class="flash-progress">第 {{ flashIndex + 1 }} / {{ flashList.length }} 张</span>
          <el-button :disabled="flashIndex >= flashList.length - 1" @click="flashNext">下一张</el-button>
          <el-button :icon="Switch" @click="shuffleFlash">打乱顺序</el-button>
          <el-button type="primary" @click="flashMode = false">退出背题</el-button>
        </div>
      </div>
    </template>

    <!-- 题目列表：点击行查看详情 -->
    <template v-else>
    <el-table
      v-loading="loading"
      :data="questions"
      stripe
      class="q-table"
      @row-click="openDetail"
    >
      <el-table-column label="题目" min-width="320">
        <template #default="{ row }">
          <div class="q-title">{{ row.title }}</div>
          <div class="q-meta">
            <el-tag size="small" :type="difficultyType(row.difficulty)">
              {{ DIFFICULTY_LABEL[row.difficulty as Difficulty] }}
            </el-tag>
            <el-tag size="small" type="info" effect="plain">
              {{ TYPE_LABEL[row.type as QuestionType] }}
            </el-tag>
            <span v-if="row.categoryName">{{ row.categoryName }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="标签" width="180">
        <template #default="{ row }">
          <el-tag
            v-for="t in row.tags"
            :key="t.id"
            size="small"
            effect="plain"
            class="tag-item"
          >
            {{ t.name }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="考点" width="140">
        <template #default="{ row }">{{ row.knowledgePoint || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-tooltip :content="row.favorited ? '取消收藏' : '收藏'" placement="top">
            <el-button
              link
              :type="row.favorited ? 'warning' : 'default'"
              :icon="row.favorited ? StarFilled : Star"
              @click.stop="toggleFav(row)"
            />
          </el-tooltip>
          <el-button link type="primary" @click.stop="openDetail(row)">查看</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="没有符合条件的题目" />
      </template>
    </el-table>

    <!-- 分页 -->
    <div class="pager">
      <span class="pager-tip">共 {{ total }} 题 · 点击行查看详情</span>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="load"
        @size-change="onSizeChange"
      />
    </div>
    </template>

    <!-- 题目详情 -->
    <el-dialog v-model="detailVisible" title="题目详情" width="640px" top="6vh">
      <template v-if="detail">
        <div class="detail-title">{{ detail.title }}</div>
        <div class="detail-meta">
          <el-tag size="small" :type="difficultyType(detail.difficulty)">
            {{ DIFFICULTY_LABEL[detail.difficulty] }}
          </el-tag>
          <el-tag size="small" type="info" effect="plain">{{ TYPE_LABEL[detail.type] }}</el-tag>
          <span v-if="detail.categoryName">{{ detail.categoryName }}</span>
          <span v-if="detail.knowledgePoint">考点：{{ detail.knowledgePoint }}</span>
        </div>
        <div v-if="detail.options?.length" class="options">
          <div v-for="o in detail.options" :key="o.key" class="option-row">
            <span class="option-key">{{ o.key }}</span>
            <span>{{ o.text }}</span>
          </div>
        </div>
        <el-divider />
        <div class="answer-block">
          <div class="answer-label">标准答案</div>
          <div class="answer-value">{{ formatAnswer(detail) }}</div>
        </div>
        <div v-if="detail.explanation" class="explain-block">
          <div class="answer-label">解析</div>
          <div class="explain-value">{{ detail.explanation }}</div>
        </div>
      </template>
      <template #footer>
        <el-button
          v-if="detail"
          :type="detail.favorited ? 'warning' : 'default'"
          :icon="detail.favorited ? StarFilled : Star"
          @click="toggleFav(detail)"
        >
          {{ detail.favorited ? '已收藏' : '收藏' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 题库导入：选择文件 → 解析预览 → 确认写入 -->
    <el-dialog v-model="importVisible" title="导入题库" width="720px" top="6vh" @closed="resetImport">
      <template v-if="importStep === 'select'">
        <el-alert type="info" :closable="false" class="import-tip">
          <p>
            支持 Word(.docx)、Excel(.xlsx)、CSV、TXT、Markdown，自动识别题干、选项、答案与解析。
          </p>
          <pre class="import-sample">1. 以下哪个命令用于查看进程快照？
A. ps
B. top
答案：A
解析：ps 输出进程快照
考点：进程管理　分类：Linux 系统　难度：简单　标签：面试高频,基础概念</pre>
          <p>
            Excel / CSV 建议表头：题干 | 题型 | 难度 | 选项A | 选项B | 选项C | 选项D | 答案 | 解析 |
            考点 | 分类 | 标签
          </p>
        </el-alert>
        <el-form-item label="归属行业" label-width="90px" class="industry-row">
          <el-select
            v-model="importIndustryId"
            placeholder="选择新分类挂载到哪个行业下"
            clearable
            style="width: 280px"
          >
            <el-option
              v-for="ind in industries"
              :key="ind.id"
              :label="ind.name"
              :value="ind.id"
            />
          </el-select>
          <span class="industry-tip">文件中出现的"分类"将创建在该行业之下</span>
        </el-form-item>
        <el-upload
          drag
          :auto-upload="false"
          :limit="1"
          accept=".docx,.xlsx,.csv,.txt,.md"
          :on-change="onImportFileChange"
          :on-remove="() => (importFile = null)"
          :on-exceed="onImportExceed"
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽文件到此处，或 <em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">支持 .docx / .xlsx / .csv / .txt / .md，不超过 10MB</div>
          </template>
        </el-upload>
      </template>

      <template v-else>
        <el-alert v-if="parseErrors.length" type="warning" :closable="false" class="import-tip">
          <div v-for="(e, i) in parseErrors" :key="i">{{ e }}</div>
        </el-alert>
        <div class="import-summary">
          <span>
            已解析 <b>{{ parsedList.length }}</b> 道题：
          </span>
          <el-tag type="success" size="small">可导入 {{ validCount }}</el-tag>
          <el-tag v-if="invalidCount" type="danger" size="small">
            有问题 {{ invalidCount }}（导入时跳过）
          </el-tag>
        </div>
        <el-table :data="parsedList" size="small" max-height="360">
          <el-table-column label="状态" width="86">
            <template #default="{ row }">
              <el-tag v-if="row.valid" type="success" size="small">可导入</el-tag>
              <el-tooltip v-else :content="row.problem || '校验失败'" placement="top">
                <el-tag type="danger" size="small">有问题</el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="题干" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">{{ row.title }}</template>
          </el-table-column>
          <el-table-column label="题型" width="90">
            <template #default="{ row }">{{ TYPE_LABEL[row.type as QuestionType] }}</template>
          </el-table-column>
          <el-table-column label="难度" width="70">
            <template #default="{ row }">{{ DIFFICULTY_LABEL[row.difficulty as Difficulty] }}</template>
          </el-table-column>
          <el-table-column label="答案" width="130" show-overflow-tooltip>
            <template #default="{ row }">{{ previewAnswer(row) }}</template>
          </el-table-column>
          <el-table-column label="分类" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.categoryName || '—' }}</template>
          </el-table-column>
        </el-table>
      </template>

      <template #footer>
        <el-button
          @click="importStep === 'select' ? (importVisible = false) : (importStep = 'select')"
        >
          {{ importStep === 'select' ? '取消' : '上一步' }}
        </el-button>
        <el-button
          v-if="importStep === 'select'"
          type="primary"
          :loading="parsing"
          :disabled="!importFile"
          @click="parseFile"
        >
          解析预览
        </el-button>
        <el-button
          v-else
          type="primary"
          :loading="importing"
          :disabled="!validCount"
          @click="confirmImport"
        >
          确认导入 {{ validCount }} 题
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type UploadFile } from 'element-plus';
import { Search, RefreshLeft, EditPen, Upload, UploadFilled, Star, StarFilled, Reading, Switch } from '@element-plus/icons-vue';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import {
  DIFFICULTY_LABEL,
  TYPE_LABEL,
  type Category,
  type Difficulty,
  type ImportedQuestion,
  type Question,
  type QuestionType,
  type Tag,
} from '@/types';
import { formatAnswer } from '@/utils/format';

const auth = useAuthStore();

const loading = ref(false);
const questions = ref<Question[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const categoryTree = ref<Category[]>([]);
const tags = ref<Tag[]>([]);

const filters = reactive({
  q: '',
  categoryId: undefined as string | undefined,
  difficulty: undefined as string | undefined,
  type: undefined as string | undefined,
  tag: undefined as string | undefined,
});

const detailVisible = ref(false);
const detail = ref<Question | null>(null);

function difficultyType(d: Difficulty) {
  return d === 'easy' ? 'success' : d === 'medium' ? 'warning' : 'danger';
}

async function load() {
  loading.value = true;
  try {
    const res = await api.questions({
      page: page.value,
      pageSize: pageSize.value,
      q: filters.q || undefined,
      categoryId: filters.categoryId,
      difficulty: filters.difficulty,
      type: filters.type,
      tag: filters.tag,
    });
    questions.value = res.data;
    total.value = res.pagination.total;
  } catch {
    ElMessage.error('加载题目失败，请稍后重试');
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}

function onSizeChange() {
  page.value = 1;
  load();
}

function reset() {
  filters.q = '';
  filters.categoryId = undefined;
  filters.difficulty = undefined;
  filters.type = undefined;
  filters.tag = undefined;
  search();
}

async function openDetail(row: Question) {
  try {
    const res = await api.question(row.id);
    detail.value = res.data;
    detailVisible.value = true;
  } catch {
    ElMessage.error('加载题目详情失败');
  }
}

// 收藏 / 取消收藏（列表行与详情弹窗共用）
type FavTarget = Pick<Question, 'id'> & { favorited?: boolean };
async function toggleFav(target: FavTarget) {
  try {
    const res = await api.toggleFavorite(target.id);
    target.favorited = res.favorited;
    ElMessage.success(res.favorited ? '已收藏' : '已取消收藏');
  } catch {
    /* 拦截器已提示 */
  }
}

// ===== 背题卡片模式 =====
const flashMode = ref(false);
const flashIndex = ref(0);
const flipped = ref(false);
const flashList = ref<Question[]>([]);

const flashCurrent = computed(() => flashList.value[flashIndex.value] ?? null);

function enterFlash() {
  flashList.value = [...questions.value];
  flashIndex.value = 0;
  flipped.value = false;
  flashMode.value = true;
}

function flashPrev() {
  if (flashIndex.value > 0) {
    flashIndex.value -= 1;
    flipped.value = false;
  }
}

function flashNext() {
  if (flashIndex.value < flashList.value.length - 1) {
    flashIndex.value += 1;
    flipped.value = false;
  }
}

function shuffleFlash() {
  const list = [...flashList.value];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  flashList.value = list;
  flashIndex.value = 0;
  flipped.value = false;
}

function isCorrectOption(q: Question, key: string): boolean {
  const a = q.answer;
  if (q.type === 'single_choice') return String(a) === key;
  if (q.type === 'multiple_choice') return Array.isArray(a) && a.map(String).includes(key);
  return false;
}

// ===== 题库导入 =====
const importVisible = ref(false);
const importStep = ref<'select' | 'preview'>('select');
const importFile = ref<File | null>(null);
const importIndustryId = ref<string | undefined>(undefined);
const parsing = ref(false);
const importing = ref(false);
const parsedList = ref<ImportedQuestion[]>([]);
const parseErrors = ref<string[]>([]);

/** 行业 = 分类树的一级节点 */
const industries = computed(() => categoryTree.value.map((c) => ({ id: c.id, name: c.name })));

const validCount = computed(() => parsedList.value.filter((q) => q.valid).length);
const invalidCount = computed(() => parsedList.value.length - validCount.value);

function openImport() {
  importVisible.value = true;
}

function resetImport() {
  importStep.value = 'select';
  importFile.value = null;
  importIndustryId.value = undefined;
  parsedList.value = [];
  parseErrors.value = [];
}

function onImportFileChange(file: UploadFile) {
  if (file?.raw) {
    importFile.value = file.raw;
    parsedList.value = [];
    parseErrors.value = [];
  }
}

function onImportExceed() {
  ElMessage.warning('一次只能选择一个文件，请先移除已选文件');
}

/** File → base64（分块转换，避免大文件栈溢出） */
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function parseFile() {
  if (!importFile.value) {
    ElMessage.warning('请先选择文件');
    return;
  }
  if (importFile.value.size > 10 * 1024 * 1024) {
    ElMessage.error('文件超过 10MB，请拆分后导入');
    return;
  }
  parsing.value = true;
  try {
    const contentBase64 = await fileToBase64(importFile.value);
    const res = await api.importParseFile({
      filename: importFile.value.name,
      contentBase64,
    });
    parsedList.value = res.data;
    parseErrors.value = res.errors ?? [];
    importStep.value = 'preview';
    if (!res.data.length) {
      ElMessage.error(res.errors?.[0] ?? '未识别到任何题目');
    }
  } catch {
    /* 错误提示由 http 拦截器统一处理 */
  } finally {
    parsing.value = false;
  }
}

async function confirmImport() {
  const valid = parsedList.value.filter((q) => q.valid);
  if (!valid.length) {
    ElMessage.warning('没有可导入的题目');
    return;
  }
  importing.value = true;
  try {
    const payload = valid.map((q) => ({
      title: q.title,
      type: q.type,
      difficulty: q.difficulty,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation || undefined,
      knowledgePoint: q.knowledgePoint || undefined,
      categoryName: q.categoryName || undefined,
      tags: q.tags?.length ? q.tags : undefined,
      source: q.source || undefined,
    }));
    const res = await api.importQuestions({
      industryId: importIndustryId.value || undefined,
      questions: payload,
    });
    ElMessage.success(`成功导入 ${res.imported} 道题目`);
    if (res.skipped?.length) {
      ElMessage.warning(`${res.skipped.length} 道题目写入失败，已跳过`);
    }
    importVisible.value = false;
    search();
  } catch {
    /* 错误提示由 http 拦截器统一处理 */
  } finally {
    importing.value = false;
  }
}

function previewAnswer(q: ImportedQuestion): string {
  if (q.answer === null || q.answer === undefined || q.answer === '') return '—';
  if (q.type === 'true_false') {
    return q.answer === true || q.answer === 'true' ? '正确' : '错误';
  }
  if (Array.isArray(q.answer)) return q.answer.map(String).join('、');
  return String(q.answer);
}

onMounted(async () => {
  load();
  const [c, t] = await Promise.all([api.categories(), api.tags()]);
  categoryTree.value = c.data;
  tags.value = t.data;
});
</script>

<style scoped>
/* 工具栏 */
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
.filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 0;
}
.w-220 { width: 220px; }
.w-150 { width: 150px; }
.w-130 { width: 130px; }
.w-110 { width: 110px; }
.w-100 { width: 100px; }

/* 列表 */
.q-table :deep(.el-table__row) {
  cursor: pointer;
}
.q-title {
  line-height: 1.5;
  font-weight: 500;
}
.q-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: normal;
}
.tag-item {
  margin-right: 6px;
}

/* 分页 */
.pager {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.pager-tip {
  color: var(--text-muted);
  font-size: 13px;
}

/* 详情弹窗 */
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

/* 导入对话框 */
.import-tip {
  margin-bottom: 14px;
}
.import-sample {
  margin: 6px 0;
  padding: 10px 12px;
  background: var(--bg-surface);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.8;
  white-space: pre-wrap;
}
.import-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: var(--text-secondary);
}
.industry-row {
  margin-bottom: 14px;
}
.industry-tip {
  margin-left: 10px;
  color: var(--text-muted);
  font-size: 12px;
}

/* 背题卡片 */
.flash-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 10px 0;
}
.flash-card {
  width: 100%;
  max-width: 680px;
  min-height: 320px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: box-shadow 0.2s;
  padding: 30px;
}
.flash-card:hover {
  box-shadow: 0 6px 24px rgba(64, 158, 255, 0.12);
}
.flash-front,
.flash-back {
  width: 100%;
  text-align: center;
}
.flash-q {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.7;
  margin-bottom: 14px;
  text-align: left;
}
.flash-tip {
  margin-top: 18px;
  color: var(--text-muted);
  font-size: 12px;
}
.flash-back {
  text-align: left;
  cursor: default;
}
.flash-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.flash-option {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-surface);
  border-radius: 6px;
  font-size: 14px;
}
.flash-option.correct {
  background: #f0f9eb;
  color: #529b2e;
  font-weight: 600;
}
.flash-answer-line {
  font-size: 14px;
  margin-bottom: 8px;
}
.flash-answer-line .ok {
  color: var(--success);
}
.flash-explain {
  background: var(--bg-surface);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.flash-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.flash-progress {
  color: var(--text-muted);
  font-size: 14px;
  min-width: 90px;
  text-align: center;
}
</style>
