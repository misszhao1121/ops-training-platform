<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="brand">
        <div class="brand-mark">⚙️</div>
        <h1>通用考试训练平台</h1>
        <p>多行业题库 · 练习考试 · 逐题解析，一站式技能提升</p>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent>
        <el-form-item prop="account">
          <el-input v-model="form.account" placeholder="用户名或邮箱" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" :prefix-icon="Lock" show-password @keyup.enter="onSubmit" />
        </el-form-item>
        <el-button type="primary" class="submit" size="large" :loading="loading" @click="onSubmit">
          登 录
        </el-button>
      </el-form>
      <div class="footer">
        还没有账号？<router-link to="/register" class="link">立即注册</router-link>
      </div>
      <div class="hint">
        演示账号：admin / admin123（管理员）· demo / demo123（普通用户）
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({ account: '', password: '' });
const rules: FormRules = {
  account: [{ required: true, message: '请输入用户名或邮箱', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  loading.value = true;
  try {
    await auth.login({ account: form.account, password: form.password });
    ElMessage.success('登录成功');
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
    router.push(redirect);
  } catch {
    /* 错误已由拦截器提示 */
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1f2d3d 0%, #2f4b6e 100%);
}
.auth-card {
  width: 400px;
  background: #fff;
  border-radius: 12px;
  padding: 36px 32px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}
.brand {
  text-align: center;
  margin-bottom: 24px;
}
.brand-mark {
  font-size: 40px;
}
.brand h1 {
  font-size: 22px;
  margin: 8px 0 4px;
}
.brand p {
  color: #909399;
  font-size: 13px;
  margin: 0;
}
.submit {
  width: 100%;
}
.footer {
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
  color: #606266;
}
.link {
  color: #409eff;
}
.hint {
  margin-top: 14px;
  font-size: 12px;
  color: #b0b3b8;
  text-align: center;
  background: #f7f8fa;
  padding: 8px;
  border-radius: 6px;
}
</style>
