<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="brand">
        <div class="brand-mark">⚙️</div>
        <h1>注册账号</h1>
        <p>开始你的技能提升之旅</p>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent>
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名（3-20 位）" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="email">
          <el-input v-model="form.email" placeholder="邮箱" :prefix-icon="Message" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码（至少 6 位）" :prefix-icon="Lock" show-password />
        </el-form-item>
        <el-form-item prop="confirm">
          <el-input v-model="form.confirm" type="password" placeholder="确认密码" :prefix-icon="Lock" show-password @keyup.enter="onSubmit" />
        </el-form-item>
        <el-button type="primary" class="submit" size="large" :loading="loading" @click="onSubmit">
          注 册
        </el-button>
      </el-form>
      <div class="footer">
        已有账号？<router-link to="/login" class="link">去登录</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { User, Lock, Message } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({ username: '', email: '', password: '', confirm: '' });

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度 3-20 位', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value, cb) => (value === form.password ? cb() : cb(new Error('两次密码不一致'))),
      trigger: 'blur',
    },
  ],
};

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  loading.value = true;
  try {
    await auth.register({ email: form.email, username: form.username, password: form.password });
    ElMessage.success('注册成功，已自动登录');
    router.push('/dashboard');
  } catch {
    /* 已提示 */
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
</style>
