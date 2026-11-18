import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guest: true } },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { guest: true } },
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
        { path: 'bank', name: 'bank', component: () => import('@/views/QuestionBankView.vue') },
        { path: 'practice', name: 'practice', component: () => import('@/views/PracticeSetupView.vue') },
        { path: 'practice/:id', name: 'practice-run', component: () => import('@/views/PracticeRunView.vue') },
        { path: 'history', name: 'history', component: () => import('@/views/HistoryView.vue') },
        { path: 'wrong-book', name: 'wrong-book', component: () => import('@/views/WrongBookView.vue') },
        { path: 'admin/questions', name: 'admin-questions', component: () => import('@/views/AdminQuestionsView.vue'), meta: { admin: true } },
        { path: 'interview', name: 'interview', component: () => import('@/views/InterviewView.vue') },
        { path: 'labs', name: 'labs', component: () => import('@/views/ComingSoonView.vue'), meta: { comingSoon: '实验环境' } },
        { path: 'profile', name: 'profile', component: () => import('@/views/ProfileView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.guest) {
    if (auth.isLoggedIn) return { path: '/dashboard' };
    return true;
  }
  if (!auth.isLoggedIn) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.meta.admin && !auth.isAdmin) return { path: '/dashboard' };
  return true;
});

export default router;
