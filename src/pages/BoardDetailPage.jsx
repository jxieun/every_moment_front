import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchPostDetail,
  deletePost,
  deleteComment,
  createComment,
} from "../api/posts";
import "../styles/BoardDetailPage.css";
import { authStore } from "../store/auth";  // ✅ 로그인 사용자 정보
import axios from "axios";

const CATS = [
  { slug: "notice", label: "공지 게시판", enum: "NOTICE" },
  { slug: "free", label: "자유 게시판", enum: "FREE" },
  { slug: "matching", label: "매칭 게시판", enum: "MATCH" },
  { slug: "find-roommate", label: "매칭 없이 룸메 찾기 게시판", enum: "FIND" },
];

export default function BoardDetailPage() {
  const { cat, id } = useParams();
  const navigate = useNavigate();
  const currentCat = useMemo(() => CATS.find((c) => c.slug === cat), [cat]);
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE ?? "/api", []);

  const user = authStore.getUser(); // ✅ 현재 로그인 사용자
  const isAdmin = user?.role === "ROLE_ADMIN";

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [commentText, setCommentText] = useState("");
  const [deletingCmtId, setDeletingCmtId] = useState(null);

  // ▼ 메뉴 드롭다운 상태 & 외부 클릭 닫기
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const getAccessToken = () => {
    try {
      return JSON.parse(localStorage.getItem("em_tokens") || "{}").accessToken;
    } catch {
      return undefined;
    }
  };

  // ✅ 게시글 상세 불러오기
  async function fetchPost() {
    try {
      setErr("");
      setLoading(true);
      const masked = await fetchPostDetail(id);
      setPost(masked);
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || "불러오기에 실패했습니다.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  // ✅ 1:1 채팅방 create-or-get 후 /chat/:roomId 이동
  const openChatWith = async (opponentUserId) => {
    if (!opponentUserId) return;
    if (!user) return alert("로그인이 필요합니다.");
    if (String(opponentUserId) === String(user.id)) {
      return alert("본인과는 채팅할 수 없어요.");
    }
    try {
      const { data } = await axios.post(
        `${apiBase}/api/chat/rooms`,
        { opponentUserId },
        { headers: { Authorization: `Bearer ${getAccessToken()}` } }
      );
      navigate(`/chat/${data.id}`, { state: { opponentUserId } });
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || "채팅방 생성 실패";
      alert(msg);
    }
  };

  useEffect(() => {
    if (!currentCat) {
      navigate("/boards/notice", { replace: true });
      return;
    }
    fetchPost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, currentCat]);

  const isAdminRole = (r) => typeof r === "string" && r.includes("ADMIN");
  const displayName = (name, role, forceAdmin = false) =>
    forceAdmin || isAdminRole(role) ? "관리자" : (name || "익명");

  // ✅ 공지 여부 & 댓글 작성 가능 여부
  const isNotice = useMemo(
    () => currentCat?.enum === "NOTICE" || post?.category === "NOTICE",
    [currentCat?.enum, post?.category]
  );
  const canWriteComment = !isNotice || isAdmin;

  // 글 작성자가 운영자일시 채팅 button -> 문의로 변경 
  const isAuthorAdmin = !!(post?.authorRole?.includes("ADMIN") || post?.authorIsAdmin);
  const showAdminContactForPost =
    !!user && post?.authorId && String(post.authorId) !== String(user.id) && (isNotice || isAuthorAdmin);
  const showChatForPost =
    !!user && post?.authorId && String(post.authorId) !== String(user.id) && !isNotice && !isAuthorAdmin;

  // ✅ 댓글 등록
  async function addComment(e) {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    try {
      await createComment(id, text);
      setCommentText("");
      await fetchPost();
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || "댓글 등록 실패";
      alert(msg);
    }
  }

  // ✅ 댓글 삭제
  async function removeComment(commentId) {
    if (!window.confirm("이 댓글을 삭제할까요?")) return;
    try {
      setDeletingCmtId(commentId);
      await deleteComment(commentId);
      await fetchPost();
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || "댓글 삭제 실패";
      alert(msg);
    } finally {
      setDeletingCmtId(null);
    }
  }

  // ✅ 글 삭제
  async function removePostHandler() {
    if (!window.confirm("이 글을 삭제할까요?")) return;
    try {
      await deletePost(id);
      navigate(`/boards/${cat}`);
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || "삭제 실패";
      alert(msg);
    }
  }

  // ✅ 관리자 승인/거절
  async function handleApprove() {
    try {
      await axios.post(`${apiBase}/api/posts/${id}/approve`, {}, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      await fetchPost();
      alert("승인되었습니다.");
    } catch (e) {
      alert(e?.response?.data?.message || "승인 실패");
    }
  }

  async function handleReject() {
    try {
      await axios.post(`${apiBase}/api/posts/${id}/reject`, {}, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      await fetchPost();
      alert("거절되었습니다.");
    } catch (e) {
      alert(e?.response?.data?.message || "거절 실패");
    }
  }

  // ✅ 날짜 포맷
  const fmt = (ts) =>
    ts
      ? new Date(ts).toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
      : "";

  const isEdited = (createdAt, updatedAt) => {
    if (!createdAt || !updatedAt) return false;
    const c = new Date(createdAt).getTime();
    const u = new Date(updatedAt).getTime();
    return Number.isFinite(c) && Number.isFinite(u) && u !== c;
  };

  // ✅ 권한 체크
  const canEdit =
    user && post && String(post.authorId) === String(user.id); // 글쓴이만 수정
  const canDelete =
    (user && post && String(post.authorId) === String(user.id)) || isAdmin; // 글쓴이 or 관리자 삭제

  // ▼ 로그아웃 핸들러
  const handleLogout = async () => {
    try {
      const tokens = JSON.parse(localStorage.getItem("em_tokens") || "{}");
      const accessToken = tokens?.accessToken;
      const refreshToken = tokens?.refreshToken;

      const base = import.meta.env.VITE_API_BASE ?? "/api";
      if (refreshToken) {
        await api
          .post(
            `${base}/logout`,
            { refreshToken },
            {
              headers: {
                "Content-Type": "application/json",
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
              },
            }
          )
          .catch(() => { }); // 서버 실패해도 아래 클린업 진행
      }

      localStorage.removeItem("em_tokens");
      localStorage.removeItem("em_user");
      localStorage.removeItem("userId");
      localStorage.removeItem("userid");
      localStorage.removeItem("memberId");

      try {
        const { authStore } = await import("../store/auth");
        authStore?.logout?.();
      } catch { }

      navigate("/", { replace: true });
    } catch {
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="bd-wrap">
      <header className="bp-topbar">
        <button
          className="back-btn"
          aria-label="뒤로가기"
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate(`/boards/${cat}`);
          }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <h1 className="topbar-title">게시판</h1>

        <nav className="top-icons">

          <Link to="/chat" aria-label="메시지" className="mp-icon-btn">💬</Link>

          <Link to="/profile" className="mp-profile-chip" aria-label="프로필">
            <span className="mp-avatar" aria-hidden>👤</span>
          </Link>

          {/* ▼ 메뉴 버튼 + 드롭다운 */}
          <div className="mp-menu" ref={menuRef}>
            <button
              className="mp-icon-btn mp-menu-btn"
              aria-label="메뉴"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            {menuOpen && (
              <ul className="mp-menu-dd" role="menu">
                <li role="menuitem">
                  <button className="mp-menu-item" onClick={handleLogout}>
                    로그아웃
                  </button>
                </li>
              </ul>
            )}
          </div>
        </nav>
      </header>

      <main className="bd-main">
        {loading && <div className="bd-loading">불러오는 중…</div>}
        {err && <div className="bd-error">{err}</div>}

        {!loading && post && (
          <>
            {/* ===== 게시글 카드 ===== */}
            <div className="bd-card">
              <div className="bd-meta">
                <div className="bd-author">👤 {post.authorName || "익명"}</div>
                <div className="bd-time">
                  {fmt(post.createdAt)}
                  {isEdited(post.createdAt, post.updatedAt) && (
                    <span className="bd-edited">(수정됨 {fmt(post.updatedAt)})</span>
                  )}
                </div>

                <div className="bd-actions">
                  {canEdit && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => navigate(`/boards/${cat}/${id}/edit`)}
                    >
                      수정
                    </button>
                  )}
                  {canDelete && (
                    <button className="link-btn" onClick={removePostHandler}>
                      삭제
                    </button>
                  )}

                  {/* ✅ 관리자 승인/거절 버튼 */}
                  {isAdmin && post.status === "SWAP_REQUEST" && (
                    <>
                      <button type="button" className="act approve" onClick={handleApprove}>승인</button>
                      <button type="button" className="act reject" onClick={handleReject}>거절</button>
                    </>
                  )}

                  {showAdminContactForPost && (
                    <button type="button" className="act" onClick={() => openChatWith(post.authorId)} title="운영자 문의">
                      운영자 문의
                    </button>
                  )}
                  {showChatForPost && (
                    <button type="button" className="act" onClick={() => openChatWith(post.authorId)} title="채팅">
                      채팅
                    </button>
                  )}
                </div>
              </div>
              <h2 className="bd-title">{post.title}</h2>
              <p className="bd-content">{post.content}</p>

              {/* ✅ 상태 표시 */}
              {post.status && (
                <div className={`bd-status ${post.status.toLowerCase()}`}>
                  상태: {post.status === "NORMAL" && "일반"}
                  {post.status === "SWAP_REQUEST" && "스왑 요청"}
                  {post.status === "SWAP_APPROVED" && "승인됨"}
                  {post.status === "SWAP_REJECTED" && "거절됨"}
                </div>
              )}
            </div>

            {/* 댓글 영역 */}
            <section className="bd-comments">
              {(post.comments || []).map((c) => {
                const canDeleteComment =
                  (user && String(c.authorId) === String(user.id)) || isAdmin;
                const isCommentAdmin = !!(isAdminRole(c.authorRole) || c.authorIsAdmin);
                const showAdminContactForComment =
                  !!user && String(c.authorId) !== String(user.id) && (isNotice || isCommentAdmin);
                const showChatForComment =
                  !!user && String(c.authorId) !== String(user.id) && !isNotice && !isCommentAdmin;

                return (
                  <div key={c.id} className="cmt-block">
                    <div className="cmt-box">
                      <div className="cmt-header">
                        <div className="cmt-author">👤 {c.authorName || "익명"}</div>
                        <div className="cmt-time">{fmt(c.createdAt)}</div>
                        <div className="cmt-actions">
                          {canDeleteComment && (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => removeComment(c.id)}
                              disabled={deletingCmtId === c.id}
                              title="댓글 삭제"
                            >
                              {deletingCmtId === c.id ? "삭제중…" : "삭제"}
                            </button>
                          )}
                          {showAdminContactForComment && (
                            <button type="button" className="act" onClick={() => openChatWith(c.authorId)} title="운영자 문의" style={{ marginLeft: 8 }}>
                              운영자 문의
                            </button>
                          )}
                          {showChatForComment && (
                            <button type="button" className="act" onClick={() => openChatWith(c.authorId)} title="채팅" style={{ marginLeft: 8 }}>
                              채팅
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="cmt-body">{c.content}</div>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* 댓글 작성 폼 */}
            {canWriteComment ? (
              <form className="bd-write" onSubmit={addComment}>
                <textarea
                  placeholder="댓글을 입력하세요"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <button type="submit" className="bd-submit">
                  등록
                </button>
              </form>
            ) : (
              <div className="bd-notice-hint">공지에는 댓글을 작성할 수 없습니다.</div>
            )}
          </>
        )}
      </main>
    </div>
  );
}