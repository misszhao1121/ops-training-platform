import { defineStore } from 'pinia';
import { api } from '@/api';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string;
  loaded: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    token: localStorage.getItem('token') || '',
    loaded: false,
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    isAdmin: (s) => s.user?.role === 'ADMIN',
  },
  actions: {
    async login(payload: { account: string; password: string }) {
      const res = await api.login(payload);
      this.setSession(res.token, res.user);
    },
    async register(payload: { email: string; username: string; password: string }) {
      const res = await api.register(payload);
      this.setSession(res.token, res.user);
    },
    setSession(token: string, user: User) {
      this.token = token;
      this.user = user;
      localStorage.setItem('token', token);
    },
    async fetchMe() {
      if (!this.token) {
        this.loaded = true;
        return;
      }
      try {
        const res = await api.me();
        this.user = res.user;
      } catch {
        this.logout();
      }
      this.loaded = true;
    },
    logout() {
      this.token = '';
      this.user = null;
      this.loaded = true;
      localStorage.removeItem('token');
    },
  },
});
