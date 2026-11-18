<template>
  <el-container class="layout">
    <!-- 侧边栏：Logo + 主导航 + 折叠按钮 -->
    <el-aside :width="isCollapsed ? '64px' : '220px'" class="aside">
      <div class="logo-area">
        <span class="logo-mark">⚙️</span>
        <span v-if="!isCollapsed" class="logo-text">考试训练</span>
      </div>

      <el-menu
        class="side-menu"
        :default-active="activeMenu"
        :collapse="isCollapsed"
        :collapse-transition="false"
        router
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
        <el-menu-item v-if="auth.isAdmin" index="/admin/questions">
          <el-icon><Setting /></el-icon>
          <template #title>题目管理</template>
        </el-menu-item>
      </el-menu>

      <div class="collapse-btn" @click="isCollapsed = !isCollapsed">
        <el-icon><component :is="isCollapsed ? Expand : Fold" /></el-icon>
        <span v-if="!isCollapsed">收起菜单</span>
      </div>
    </el-aside>

    <!-- 主体：顶栏（页面标题 + 用户菜单）+ 内容区 -->
    <el-container class="body">
      <el-header class="header" height="56px">
        <h1 class="page-heading">{{ pageTitle }}</h1>

        <el-dropdown trigger="click" @command="onCommand">
          <span class="user-chip">
            <el-avatar :size="30" class="user-avatar">{{ userInitial }}</el-avatar>
            <span class="username">{{ userName }}</span>
            <el-icon class="chevron"><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">
                <el-icon><User /></el-icon>个人中心
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import {
  Odometer,
  Collection,
  EditPen,
  Clock,
  ChatDotRound,
  Monitor,
  Setting,
  Fold,
  Expand,
  ArrowDown,
  User,
  SwitchButton,
  Tickets,
} from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

interface MenuItem {
  path: string;
  title: string;
  icon: Component;
}

// 主导航（唯一入口，避免与顶栏重复）
const menuItems: MenuItem[] = [
  { path: '/dashboard', title: '工作台', icon: Odometer },
  { path: '/bank', title: '题库', icon: Collection },
  { path: '/practice', title: '开始练习', icon: EditPen },
  { path: '/history', title: '练习历史', icon: Clock },
  { path: '/wrong-book', title: '错题本', icon: Tickets },
  { path: '/interview', title: '面试模拟', icon: ChatDotRound },
  { path: '/labs', title: '实验环境', icon: Monitor },
];

const isCollapsed = ref(false);

// 当前激活菜单：练习详情页仍高亮“开始练习”
const activeMenu = computed(() =>
  route.path.startsWith('/practice') ? '/practice' : route.path,
);

// 顶栏页面标题
const pageTitle = computed(() => {
  if (route.path.startsWith('/practice/')) return '练习进行中';
  const map: Record<string, string> = {
    '/dashboard': '工作台',
    '/bank': '题库',
    '/practice': '开始练习',
    '/history': '练习历史',
    '/admin/questions': '题目管理',
    '/interview': '面试模拟',
    '/labs': '实验环境',
  };
  return map[route.path] ?? '通用考试训练平台';
});

const userInitial = computed(
  () => auth.user?.username?.charAt(0).toUpperCase() ?? 'U',
);
const userName = computed(() => auth.user?.username ?? '访客');

function onCommand(cmd: string | number | object) {
  if (cmd === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' })
      .then(() => {
        auth.logout();
        router.push({ name: 'login' });
      })
      .catch(() => {});
  } else if (cmd === 'profile') {
    router.push('/profile');
  }
}
</script>

<style scoped>
.layout {
  height: 100vh;
}

/* 侧边栏 */
.aside {
  background: #1f2d3d;
  display: flex;
  flex-direction: column;
  transition: width 0.25s ease;
  overflow-x: hidden;
}

.logo-area {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  white-space: nowrap;
}
.logo-mark {
  font-size: 22px;
}
.logo-text {
  color: #ffffff;
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 1px;
}

.side-menu {
  flex: 1;
  border-right: none;
  background: transparent;
  padding: 8px 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.side-menu:not(.el-menu--collapse) {
  width: 100%;
}
.side-menu :deep(.el-menu-item) {
  height: 44px;
  margin: 4px 10px;
  border-radius: 8px;
  color: #b2bec3;
}
.side-menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}
.side-menu :deep(.el-menu-item.is-active) {
  background: var(--primary);
  color: #ffffff;
}

.collapse-btn {
  flex-shrink: 0;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #b2bec3;
  cursor: pointer;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  user-select: none;
  white-space: nowrap;
  transition: background 0.2s;
}
.collapse-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}

/* 顶栏 */
.body {
  min-width: 0;
}
.header {
  background: #ffffff;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}
.page-heading {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  outline: none;
}
.user-avatar {
  background: var(--primary);
  font-weight: 600;
}
.username {
  font-size: 13px;
  color: var(--text-secondary);
}
.chevron {
  color: var(--text-muted);
  font-size: 12px;
}

/* 内容区 */
.main {
  background: var(--bg-app);
  padding: 20px 24px;
  overflow: auto;
}
</style>
