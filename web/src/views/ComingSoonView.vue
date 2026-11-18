<template>
  <div class="page-card coming-soon">
    <div class="icon">🚧</div>
    <h2 class="title">{{ title }} · 即将上线</h2>
    <p class="desc">
      该模块已在架构与数据模型中预留，正在规划中。
      <br />
      当前版本已上线：题库、随机练习、模拟考试、练习历史与统计。
    </p>
    <el-button type="primary" @click="$router.push('/practice')">先去练习</el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => (route.meta.comingSoon as string) ?? '功能');
</script>

<style scoped>
.coming-soon {
  text-align: center;
  padding: 80px 20px;
}
.icon {
  font-size: 64px;
}
.title {
  margin: 16px 0 8px;
}
.desc {
  color: #909399;
  line-height: 1.8;
  margin-bottom: 24px;
}
</style>
