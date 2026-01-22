import api from "./axiosInstance";

// slug → enum
export const catToEnum = (slug) =>
  ({ notice: "NOTICE", free: "FREE", matching: "MATCH", "find-roommate": "FIND" }[slug] || "FREE");

// 목록: GET /api/posts?category=FREE
export async function fetchPostsSimple({ category, signal } = {}) {
  const { data } = await api.get("/api/posts", {
    params: { category },
    signal,
  });
  // 컨트롤러가 List<PostEntity>를 반환하므로 배열 그대로 온다.
  // BoardPage는 페이지네이션 필요 시 클라이언트에서 임시 처리
  return Array.isArray(data) ? data : [];
}

// 상세: GET /api/posts/{id}
export async function fetchPostDetail(id, { signal } = {}) {
  const { data } = await api.get(`/api/posts/${id}`, { signal });
  if (!data) return data;

  return {
    ...data,
    authorName: "익명",
    comments: (data.comments || []).map(c => ({
      ...c,
      authorName: "익명",
    })),
  };
}

// 작성: POST /api/posts  (body: PostEntity와 호환되는 필드)
export async function createPostSimple({ category, title, content, status }) {
  // 백엔드가 @RequestBody PostEntity post 를 받으니, 최소 필드 맞춰준다.
  // PostEntity에 author는 서버에서 auth로 채우는 구조.
  const payload = { category, title, content, status };
  const { data } = await api.post("/api/posts", payload);
  return data; // 서버가 저장된 PostEntity를 그대로 반환
}

// 🔥 수정(추가): PATCH /api/posts/{id}
export async function updatePost(id, { title, content }) {
  const { data } = await api.patch(`/api/posts/${id}`, { title, content });
  return data;
}

// 삭제: DELETE /api/posts/{id}
export async function deletePost(id) {
  const { data } = await api.delete(`/api/posts/${id}`);
  return data;
}

// 댓글 등록  🔥 추가
export async function createComment(postId, content) {
  const { data } = await api.post(`/api/comments/${postId}`, { content });
  return data;
}

// 🔻 댓글 삭제: DELETE /api/comments/{commentId}
export async function deleteComment(commentId) {
  const { data } = await api.delete(`/api/comments/${commentId}`);
  return data;
}

// 🔥 관리자 승인: POST /api/posts/{id}/approve
export async function approveSwap(postId) {
  const { data } = await api.post(`/api/posts/${postId}/approve`);
  return data;
}

// 🔻 관리자 거절: POST /api/posts/{id}/reject
export async function rejectSwap(postId) {
  const { data } = await api.post(`/api/posts/${postId}/reject`);
  return data;
}
