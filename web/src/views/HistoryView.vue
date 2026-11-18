<template>
  <div class="page-card">
    <el-table v-loading="loading" :data="attempts" stripe>
      <el-table-column label="标题" min-width="200">
        <template #default="{ row }">{{ row.title }}</template>
      </el-table-column>
      <el-table-column label="模式" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.mode === 'exam' ? 'danger' : 'primary'">
            {{ row.mode === 'exam' ? '考试' : '练习' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'completed' ? 'success' : 'info'">
            {{ row.status === 'completed' ? '已完成' : '进行中' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="得分" width="90">
        <template #default="{ row }">{{ row.score == null ? '—' : row.score }}</template>
      </el-table-column>
      <el-table-column label="正确" width="110">
        <template #default="{ row }">{{ row.correct == null ? '—' : `${row.correct}/${row.total}` }}</template>
      </el-table-column>
      <el-table-column label="开始时间" width="180">
        <template #default="{ row }">{{ formatTime(row.startedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/practice/${row.id}`)">
            {{ row.status === 'completed' ? '查看回顾' : '继续作答' }}
          </el-button>
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '@/api';
import type { Attempt } from '@/types';

const loading = ref(false);
const attempts = ref<Attempt[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

async function load() {
  loading.value = true;
  try {
    const res = await api.attempts({ page: page.value, pageSize: pageSize.value });
    attempts.value = res.data;
    total.value = res.pagination.total;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
