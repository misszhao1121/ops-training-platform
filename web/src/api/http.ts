import axios from 'axios';
import { ElMessage } from 'element-plus';

const http = axios.create({
  baseURL: '/api',
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(fn: () => void): void {
  onUnauthorized = fn;
}

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status;
    const message = err.response?.data?.message || err.message || '请求失败';
    if (status === 401) {
      localStorage.removeItem('token');
      onUnauthorized?.();
    } else if (status !== 400) {
      ElMessage.error(message);
    } else {
      ElMessage.error(message);
    }
    return Promise.reject(err);
  },
);

export default http;
