<template>
  <div class="page-card setup-card">
    <p class="desc">选择练习范围与题量，系统将从题库中随机抽取题目。</p>

    <el-form :model="form" label-width="90px" class="setup-form">
      <el-form-item label="模式">
        <el-radio-group v-model="form.mode">
          <el-radio-button value="practice">练习模式（即时反馈）</el-radio-button>
          <el-radio-button value="exam">考试模式（交卷后出分）</el-radio-button>
          <el-radio-button value="adaptive">自适应练习（动态难度）</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="题目范围">
        <div class="range-row">
          <el-tree-select
            v-model="form.categoryId"
            :data="categoryTree"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            value-key="id"
            check-strictly
            clearable
            placeholder="全部分类"
            style="width: 200px"
          />
          <el-select v-model="form.difficulty" placeholder="全部难度" clearable style="width: 140px">
            <el-option label="简单" value="easy" />
            <el-option label="中等" value="medium" />
            <el-option label="困难" value="hard" />
          </el-select>
          <el-select v-model="form.type" placeholder="全部题型" clearable style="width: 140px">
            <el-option v-for="(label, val) in TYPE_LABEL" :key="val" :label="label" :value="val" />
          </el-select>
          <el-select v-model="form.tag" placeholder="全部标签" clearable style="width: 150px">
            <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.name" />
          </el-select>
          <el-select
            v-model="form.knowledgePoints"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="考点组卷（可多选）"
            style="width: 220px"
          >
            <el-option v-for="k in knowledgePoints" :key="k.name" :label="`${k.name}（${k.count}）`" :value="k.name" />
          </el-select>
        </div>
      </el-form-item>
      <el-form-item label="题量" v-if="form.mode !== 'adaptive'">
        <el-input-number v-model="form.count" :min="1" :max="100" />
        <span class="tip">（1 - 100 题）</span>
        <span class="available" :class="{ insufficient: available < form.count }">
          当前条件可抽 <b>{{ available }}</b> 题
          <template v-if="available < form.count">，不足 {{ form.count }} 道，请减少题量或放宽条件</template>
        </span>
      </el-form-item>
      <el-form-item label="题量" v-else>
        <span class="available">自适应模式根据答题表现动态追加题目，答对连升难度、答错自动降级</span>
      </el-form-item>
      <el-form-item label="标题">
        <el-input v-model="form.title" placeholder="可选，留空自动命名" style="width: 320px" maxlength="100" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" size="large" :loading="loading" @click="start">开始答题</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '@/api';
import { TYPE_LABEL, type Category, type Tag } from '@/types';

const router = useRouter();
const loading = ref(false);
const categoryTree = ref<Category[]>([]);
const tags = ref<Tag[]>([]);
const available = ref(0);
const knowledgePoints = ref<{ name: string; count: number }[]>([]);

const form = reactive({
  mode: 'practice' as 'practice' | 'exam' | 'adaptive',
  categoryId: undefined as string | undefined,
  difficulty: undefined as string | undefined,
  type: undefined as string | undefined,
  tag: undefined as string | undefined,
  knowledgePoints: [] as string[],
  count: 10,
  title: '',
});

// 筛选变化时刷新可用题数（防抖 400ms）
let availableTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => [form.categoryId, form.difficulty, form.type, form.tag, form.knowledgePoints],
  () => {
    if (availableTimer) clearTimeout(availableTimer);
    availableTimer = setTimeout(async () => {
      try {
        const res = await api.practiceAvailable({
          categoryId: form.categoryId,
          difficulty: form.difficulty,
          type: form.type,
          tag: form.tag,
          knowledgePoints: form.knowledgePoints.join(','),
        });
        available.value = res.data.available;
      } catch {
        /* 提示失败不打断 */
      }
    }, 400);
  },
  { immediate: true },
);

async function start() {
  if (form.mode !== 'adaptive' && available.value < form.count) {
    ElMessage.warning(
      available.value === 0
        ? '当前筛选条件下没有可用题目，请调整条件'
        : `当前条件下仅有 ${available.value} 道题，不足 ${form.count} 道，请调整条件或减少题量`,
    );
    return;
  }
  loading.value = true;
  try {
    const res = await api.createAttempt({
      mode: form.mode,
      title: form.title || undefined,
      count: form.mode === 'adaptive' ? undefined : form.count,
      filters: {
        categoryId: form.categoryId,
        difficulty: form.mode === 'adaptive' ? undefined : form.difficulty,
        type: form.type,
        tag: form.tag,
        knowledgePoints: form.knowledgePoints.length ? form.knowledgePoints : undefined,
      },
    });
    router.push(`/practice/${res.data.id}`);
  } catch (e: any) {
    const code = e?.response?.data?.code;
    if (code === 'NO_QUESTIONS' || code === 'NOT_ENOUGH_QUESTIONS') {
      ElMessage.warning(e?.response?.data?.message || '当前筛选条件下没有足够的题目，请调整条件');
    }
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const [c, t, k] = await Promise.all([api.categories(), api.tags(), api.knowledgePoints()]);
  categoryTree.value = c.data;
  tags.value = t.data;
  knowledgePoints.value = k.data;
});
</script>

<style scoped>
.setup-card {
  max-width: 760px;
}
.desc {
  color: #909399;
  margin: -8px 0 20px;
}
.setup-form {
  max-width: 720px;
}
.range-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.tip {
  margin-left: 10px;
  color: #909399;
  font-size: 13px;
}
.available {
  margin-left: 12px;
  color: #67c23a;
  font-size: 13px;
}
.available b {
  font-weight: 600;
}
.available.insufficient {
  color: #e6a23c;
}
</style>
