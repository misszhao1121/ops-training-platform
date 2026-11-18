import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/dist/locale/zh-cn.mjs';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import { setOnUnauthorized } from './api/http';
import { useAuthStore } from './stores/auth';
import './styles.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ElementPlus, { locale: zhCn });

setOnUnauthorized(() => {
  const auth = useAuthStore();
  auth.logout();
  if (router.currentRoute.value.name !== 'login') {
    router.push({ name: 'login' });
  }
});

const auth = useAuthStore();
auth.fetchMe().finally(() => {
  app.mount('#app');
});
