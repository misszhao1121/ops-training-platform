<template>
  <div class="page-card">
    <div class="flex-between mb-16">
      <el-button type="primary" @click="openCreate">新增题目</el-button>
    </div>

    <el-form inline @submit.prevent>
      <el-form-item>
        <el-input v-model="filters.q" placeholder="搜索题干" clearable style="width: 220px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item>
        <el-select v-model="filters.type" placeholder="题型" clearable style="width: 130px">
          <el-option v-for="(label, val) in TYPE_LABEL" :key="val" :label="label" :value="val" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-select v-model="filters.difficulty" placeholder="难度" clearable style="width: 120px">
          <el-option label="简单" value="easy" />
          <el-option label="中等" value="medium" />
          <el-option label="困难" value="hard" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="search">查询</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="questions" stripe>
      <el-table-column label="题干" min-width="280">
        <template #default="{ row }">{{ row.title }}</template>
      </el-table-column>
      <el-table-column label="题型" width="90">
        <template #default="{ row }">{{ TYPE_LABEL[row.type as QuestionType] }}</template>
      </el-table-column>
      <el-table-column label="难度" width="80">
        <template #default="{ row }">{{ DIFFICULTY_LABEL[row.difficulty as Difficulty] }}</template>
      </el-table-column>
      <el-table-column label="分类" width="120">
        <template #default="{ row }">{{ row.categoryName || '—' }}</template>
      </el-table-column>
      <el-table-column label="公开" width="70">
        <template #default="{ row }">
          <el-tag size="small" :type="row.isPublic ? 'success' : 'info'">{{ row.isPublic ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="load"
        @size-change="load"
      />
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editForm.id ? '编辑题目' : '新增题目'" width="760px" top="5vh" destroy-on-close>
      <el-form :model="editForm" label-width="90px">
        <el-form-item label="题干" required>
          <el-input v-model="editForm.title" type="textarea" :rows="2" placeholder="请输入题干" />
        </el-form-item>
        <el-form-item label="题型" required>
          <el-radio-group v-model="editForm.type" @change="onTypeChange">
            <el-radio-button v-for="(label, val) in TYPE_LABEL" :key="val" :value="val">{{ label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="难度">
          <el-radio-group v-model="editForm.difficulty">
            <el-radio-button value="easy">简单</el-radio-button>
            <el-radio-button value="medium">中等</el-radio-button>
            <el-radio-button value="hard">困难</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="分类">
          <el-tree-select
            v-model="editForm.categoryId"
            :data="categoryTree"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            value-key="id"
            check-strictly
            clearable
            placeholder="选择分类"
            style="width: 240px"
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-select v-model="editForm.tags" multiple filterable allow-create default-first-option placeholder="输入或选择标签" style="width: 100%">
            <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.name" />
          </el-select>
        </el-form-item>

        <!-- 选项编辑（单选/多选） -->
        <el-form-item v-if="['single_choice', 'multiple_choice'].includes(editForm.type)" label="选项" required>
          <div class="option-editor">
            <div v-for="(o, i) in editForm.options" :key="i" class="option-row">
              <span class="option-key">{{ o.key }}</span>
              <el-input v-model="o.text" placeholder="选项内容" />
              <el-button link type="danger" :disabled="editForm.options.length <= 2" @click="removeOption(i)">删除</el-button>
            </div>
            <el-button size="small" @click="addOption">+ 添加选项</el-button>
          </div>
        </el-form-item>

        <!-- 答案：单选 -->
        <el-form-item v-if="editForm.type === 'single_choice'" label="正确答案">
          <el-select v-model="editForm.answerChoice" placeholder="选择正确选项" style="width: 200px">
            <el-option v-for="o in editForm.options" :key="o.key" :label="`${o.key} · ${o.text || '（空）'}`" :value="o.key" />
          </el-select>
        </el-form-item>
        <!-- 答案：多选 -->
        <el-form-item v-else-if="editForm.type === 'multiple_choice'" label="正确答案">
          <el-select v-model="editForm.answerChoices" multiple placeholder="选择正确选项（可多选）" style="width: 100%">
            <el-option v-for="o in editForm.options" :key="o.key" :label="`${o.key} · ${o.text || '（空）'}`" :value="o.key" />
          </el-select>
        </el-form-item>
        <!-- 答案：判断 -->
        <el-form-item v-else-if="editForm.type === 'true_false'" label="正确答案">
          <el-radio-group v-model="editForm.answerBool">
            <el-radio :value="true">正确</el-radio>
            <el-radio :value="false">错误</el-radio>
          </el-radio-group>
        </el-form-item>
        <!-- 答案：填空 -->
        <el-form-item v-else-if="editForm.type === 'fill_blank'" label="参考答案">
          <el-input v-model="editForm.answerFill" placeholder="多个可接受答案用逗号分隔，如：uname -r, uname" />
        </el-form-item>
        <!-- 答案：简答 -->
        <el-form-item v-else label="参考答案">
          <el-input v-model="editForm.answerShort" type="textarea" :rows="3" placeholder="主观题参考答案（供人工评阅参考）" />
        </el-form-item>

        <el-form-item label="解析">
          <el-input v-model="editForm.explanation" type="textarea" :rows="2" placeholder="答案解析（可选）" />
        </el-form-item>
        <el-form-item label="考点">
          <el-input v-model="editForm.knowledgePoint" placeholder="考点（可选）" />
        </el-form-item>
        <el-form-item label="来源">
          <el-input v-model="editForm.source" placeholder="来源，如：面试高频 / 生产经验（可选）" />
        </el-form-item>
        <el-form-item label="公开">
          <el-switch v-model="editForm.isPublic" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '@/api';
import {
  DIFFICULTY_LABEL,
  TYPE_LABEL,
  type Category,
  type Difficulty,
  type Question,
  type QuestionType,
  type Tag,
} from '@/types';

const loading = ref(false);
const questions = ref<Question[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const categoryTree = ref<Category[]>([]);
const tags = ref<Tag[]>([]);

const filters = reactive({ q: '', type: undefined as string | undefined, difficulty: undefined as string | undefined });

const dialogVisible = ref(false);
const saving = ref(false);

interface EditForm {
  id: string | null;
  title: string;
  type: QuestionType;
  difficulty: Difficulty;
  categoryId: string | null;
  tags: string[];
  options: { key: string; text: string }[];
  answerChoice: string;
  answerChoices: string[];
  answerBool: boolean;
  answerFill: string;
  answerShort: string;
  explanation: string;
  knowledgePoint: string;
  source: string;
  isPublic: boolean;
}

function defaultForm(): EditForm {
  return {
    id: null,
    title: '',
    type: 'single_choice',
    difficulty: 'medium',
    categoryId: null,
    tags: [],
    options: [
      { key: 'A', text: '' },
      { key: 'B', text: '' },
      { key: 'C', text: '' },
      { key: 'D', text: '' },
    ],
    answerChoice: '',
    answerChoices: [],
    answerBool: true,
    answerFill: '',
    answerShort: '',
    explanation: '',
    knowledgePoint: '',
    source: '',
    isPublic: true,
  };
}

const editForm = reactive<EditForm>(defaultForm());

function nextKey(i: number) {
  return String.fromCharCode(65 + i);
}

function addOption() {
  const key = nextKey(editForm.options.length);
  editForm.options.push({ key, text: '' });
}

function removeOption(i: number) {
  editForm.options.splice(i, 1);
  editForm.options.forEach((o, idx) => (o.key = nextKey(idx)));
}

function onTypeChange() {
  // 切换题型时保留已有选项（选择题），判断题不需要选项
  if (editForm.type === 'true_false') editForm.options = [];
  if ((editForm.type === 'single_choice' || editForm.type === 'multiple_choice') && editForm.options.length === 0) {
    editForm.options = [
      { key: 'A', text: '' },
      { key: 'B', text: '' },
      { key: 'C', text: '' },
      { key: 'D', text: '' },
    ];
  }
}

async function load() {
  loading.value = true;
  try {
    const res = await api.questions({
      page: page.value,
      pageSize: pageSize.value,
      includeAll: true,
      q: filters.q || undefined,
      type: filters.type,
      difficulty: filters.difficulty,
    });
    questions.value = res.data;
    total.value = res.pagination.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}

function openCreate() {
  Object.assign(editForm, defaultForm());
  dialogVisible.value = true;
}

async function openEdit(row: Question) {
  const res = await api.question(row.id);
  const q = res.data;
  Object.assign(editForm, defaultForm(), {
    id: q.id,
    title: q.title,
    type: q.type,
    difficulty: q.difficulty,
    categoryId: q.categoryId,
    tags: q.tags.map((t) => t.name),
    options: q.options?.length ? q.options.map((o) => ({ ...o })) : defaultForm().options,
    explanation: q.explanation ?? '',
    knowledgePoint: q.knowledgePoint ?? '',
    source: q.source ?? '',
    isPublic: q.isPublic,
  });
  if (q.type === 'single_choice') editForm.answerChoice = String(q.answer ?? '');
  if (q.type === 'multiple_choice') editForm.answerChoices = Array.isArray(q.answer) ? q.answer.map(String) : [];
  if (q.type === 'true_false') editForm.answerBool = Boolean(q.answer);
  if (q.type === 'fill_blank') editForm.answerFill = Array.isArray(q.answer) ? q.answer.join(', ') : String(q.answer ?? '');
  if (q.type === 'short_answer') editForm.answerShort = String(q.answer ?? '');
  dialogVisible.value = true;
}

function buildPayload() {
  const base = {
    title: editForm.title,
    type: editForm.type,
    difficulty: editForm.difficulty,
    categoryId: editForm.categoryId,
    tags: editForm.tags,
    explanation: editForm.explanation,
    knowledgePoint: editForm.knowledgePoint,
    source: editForm.source,
    isPublic: editForm.isPublic,
  };
  if (editForm.type === 'single_choice') {
    return { ...base, options: editForm.options, answer: editForm.answerChoice };
  }
  if (editForm.type === 'multiple_choice') {
    return { ...base, options: editForm.options, answer: editForm.answerChoices };
  }
  if (editForm.type === 'true_false') {
    return { ...base, answer: editForm.answerBool };
  }
  if (editForm.type === 'fill_blank') {
    const arr = editForm.answerFill.split(/[,，、\s]+/).filter(Boolean);
    return { ...base, answer: arr };
  }
  return { ...base, answer: editForm.answerShort };
}

async function save() {
  if (!editForm.title.trim()) {
    ElMessage.warning('请填写题干');
    return;
  }
  saving.value = true;
  try {
    const payload = buildPayload();
    if (editForm.id) {
      await api.updateQuestion(editForm.id, payload);
      ElMessage.success('已更新');
    } else {
      await api.createQuestion(payload);
      ElMessage.success('已创建');
    }
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: Question) {
  try {
    await ElMessageBox.confirm('确定删除该题目？删除后不可恢复。', '提示', { type: 'warning' });
  } catch {
    return;
  }
  await api.deleteQuestion(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(async () => {
  load();
  const [c, t] = await Promise.all([api.categories(), api.tags()]);
  categoryTree.value = c.data;
  tags.value = t.data;
});
</script>

<style scoped>
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.option-editor {
  width: 100%;
}
.option-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.option-key {
  font-weight: 700;
  color: #409eff;
  width: 20px;
}
</style>
