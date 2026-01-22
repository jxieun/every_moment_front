// src/api/matchApi.js
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "/api",
  timeout: 10000,
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.content)) return data.content;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.results)) return data.results;
  return [];
}

// ✅ 백엔드: /api/match/recommendation/list/{userId}
export async function getRecommendations(userId) {
  if (!userId) return [];
  try {
    const { data } = await api.get(`/api/match/recommendation/list/${userId}`);
    return toArray(data);
  } catch {
    return [];
  }
}

// ✅ 상세 결과
export async function getMatchResult(userId, matchUserId) {
  if (!userId || !matchUserId) return {};
  try {
    const { data } = await api.get(`/api/match/result/result/${userId}/${matchUserId}`);
    return data || {};
  } catch {
    return {};
  }
}
