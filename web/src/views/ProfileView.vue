<template>
  <div class="profile-wrap">
    <div class="page-card">
      <div class="profile-head">
        <el-avatar :size="56" class="big-avatar">{{ userInitial }}</el-avatar>
        <div>
          <h2 class="profile-name">{{ auth.user?.username }}</h2>
          <div class="profile-meta">
            <el-tag size="small" :type="auth.isAdmin ? 'danger' : 'primary'">
              {{ auth.isAdmin ? '管理员' : '普通用户' }}
            </el-tag>
            <span>{{ auth.user?.email }}</span>
            <span v-if="auth.user?.createdAt">注册于 {{ fmtTime(auth.user.createdAt) }}</span>
          </div>
        </div>
      </div>

      <el-row :gutter="16" class="mt-16">
        <el-col :span="6" v-for="c in statCards" :key="c.label">
          <div class="stat">
            <div class="stat-value">{{ c.value }}</div>
            <div class="stat-label">{{ c.label }}</div>
          </div>
        </el-col>
      </el-row>
    </div>

    <div class="page-card mt-16">
      <h3 class="block-title">修改密码</h3>
      <el-form label-width="90px" class="pwd-form" @submit.prevent>
        <el-form-item label="原密码">
          <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入原密码" style="max-width: 320px" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="至少 6 位" style="max-width: 320px" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="pwdForm.confirm" type="password" show-password placeholder="再次输入新密码" style="max-width: 320px" @keyup.enter="submitPwd" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="submitPwd">保存新密码</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const saving = ref(false);
const stats = ref<{ attemptCount: number; completedCount: number; correctCount: number; totalCount: number } | null>(null);

const userInitial = computed(() => auth.user?.username?.charAt(0).toUpperCase() ?? 'U');

const statCards = computed(() => {
  const s = stats.value;
  const accuracy = s && s.totalCount > 0 ? Math.round((s.correctCount / s.totalCount) * 100) : null;
  const fmt = (v: number | null) => (v == null ? '—' : String(v));
  return [
    { label: '练习次数', value: s?.attemptCount ?? 0 },
    { label: '已完成', value: s?.completedCount ?? 0 },
    { label: '答题总数', value: s?.totalCount ?? 0 },
    { label: '正确率', value: fmt(accuracy) },
  ];
});

const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirm: '',
});

async function submitPwd() {
  if (!pwdForm.oldPassword || !pwdForm.newPassword) {
    ElMessage.warning('请填写原密码与新密码');
    return;
  }
  if (pwdForm.newPassword.length < 6) {
    ElMessage.warning('新密码至少 6 位');
    return;
  }
  if (pwdForm.newPassword !== pwdForm.confirm) {
    ElMessage.warning('两次输入的新密码不一致');
    return;
  }
  saving.value = true;
  try {
    await api.changePassword({ oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword });
    ElMessage.success('密码修改成功');
    pwdForm.oldPassword = '';
    pwdForm.newPassword = '';
    pwdForm.confirm = '';
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

function fmtTime(s: string): string {
  return s ? s.replace('T', ' ').slice(0, 10) : '—';
}

onMounted(async () => {
  try {
    const res = await api.me();
    stats.value = res.stats;
  } catch {
    /* ignore */
  }
});
</script>

<style scoped>
.profile-wrap {
  max-width: 760px;
}
.profile-head {
  display: flex;
  align-items: center;
  gap: 16px;
}
.big-avatar {
  background: var(--primary);
  font-size: 24px;
  font-weight: 700;
}
.profile-name {
  margin: 0 0 6px;
  font-size: 20px;
}
.profile-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 13px;
}
.stat {
  text-align: center;
  padding: 8px 0;
}
.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--primary);
}
.stat-label {
  color: var(--text-muted);
  margin-top: 4px;
  font-size: 13px;
}
.block-title {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
}
</style>
