// src/api/axiosInstance.js
import axios from 'axios';
import { authStore } from '../store/auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  withCredentials: false,
  timeout: 10000,
});

// auth 경로 식별
const isAuthPath = (url = '') => /\/auth\/(login|register|refresh)\b/.test(String(url));

// 모든 요청에 accessToken 부착 (단, auth/* 는 제외)
api.interceptors.request.use((config) => {
  const url = String(config?.url || '');
  if (!isAuthPath(url)) {
    const at = authStore.getAccessToken?.() || localStorage.getItem('accessToken');
    if (at) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${at}`;
    }
  }
  return config;
});

let isRefreshing = false;
let subscribers = [];
const subscribeTokenRefresh = (cb) => subscribers.push(cb);
const onRefreshed = (token) => { subscribers.forEach((cb) => cb(token)); subscribers = []; };

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (!error?.response) return Promise.reject(error);

    const original = error.config || {};
    const status = error.response.status;
    const url = String(original?.url || '');

    if (status === 401 && !isAuthPath(url) && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            original.headers = original.headers || {};
            if (token) original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const rt = authStore.getRefreshToken?.() || localStorage.getItem('refreshToken');
        if (!rt) throw new Error('No refresh token');

        let resp;
        // ⚠️ 중요: 리라이트가 적용되는 그룹 → 'api/...' 로 호출해야 최종 /api/...로 도착함
        // 최종 전송 경로: /api + 'api/school/auth/refresh' = /api/api/school/auth/refresh
        // (프록시가 첫 /api 를 제거 → 백엔드 /api/school/auth/refresh 로 도달)
        try {
          resp = await api.post('/api/school/auth/refresh', { refreshToken: rt });
        } catch {
          try {
            resp = await api.post('/api/school/auth/refresh', null, {
              headers: {
                Authorization: `Bearer ${rt}`,
                'X-Refresh-Token': rt,
              },
            });
          } catch {
            resp = await api.post('/api/school/auth/refresh', {}, { withCredentials: true });
          }
        }

        const payload = resp?.data?.data || resp?.data || {};
        const { accessToken, refreshToken: newRT } = payload;
        if (!accessToken) throw new Error('No accessToken from refresh');

        authStore.setTokens?.({ accessToken, refreshToken: newRT || rt });
        try {
          localStorage.setItem('accessToken', accessToken);
          if (newRT || rt) localStorage.setItem('refreshToken', newRT || rt);
        } catch { }

        onRefreshed(accessToken);

        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch (e) {
        authStore.clear?.();
        try { localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); } catch { }
        throw e;
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
