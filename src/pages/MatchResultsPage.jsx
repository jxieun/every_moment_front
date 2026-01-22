// src/pages/MatchResultsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getRecommendations, getMatchResult } from "../api/matchApi";
import { authStore } from "../store/auth";
import "../styles/MatchResultPage.css";
import axios from "axios";
import api from "../api/axiosInstance";

/** 성별 라벨: 0/남성, 1/여성 */
const toGenderLabel = (g) => {
  if (g === null || g === undefined) return "정보 없음";
  if (typeof g === "number") return g === 0 ? "남성" : g === 1 ? "여성" : "정보 없음";
  const s = String(g).trim().toLowerCase();
  if (["0", "male", "m", "남", "남성", "남자"].includes(s)) return "남성";
  if (["1", "female", "f", "여", "여성", "여자"].includes(s)) return "여성";
  return "정보 없음";
};

/** 흡연 라벨: Boolean/문자열 → '흡연' / '비흡연' (없으면 '정보 없음') */
const toSmokingLabel = (v) => {
  if (v === null || v === undefined) return "정보 없음";
  if (typeof v === "boolean") return v ? "흡연" : "비흡연";
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "y", "yes", "smoker", "흡연", "흡연자"].includes(s)) return "흡연";
  if (["false", "0", "n", "no", "nonsmoker", "non-smoker", "비흡연", "비흡연자"].includes(s))
    return "비흡연";
  return "정보 없음";
};

/**
 * 특정 사용자 프로필 조회: /api/school/users/{userId} (UserDTO)
 * - api 인스턴스를 사용해 인터셉터/리프레시 활용
 * - 200이 아니면 null 반환(콘솔 스팸 방지)
 */
const fetchUserProfile = async (userId) => {
  const base = import.meta.env.VITE_API_BASE ?? "/api";
  try {
    const res = await api.get(`${base}/api/school/users/${userId}`, {
      // 401이어도 throw하지 않고 아래에서 분기
      validateStatus: () => true,
    });
    if (res.status !== 200) return null;
    return res?.data?.data ?? res?.data ?? null;
  } catch {
    return null;
  }
};

/** 추천 목록에 성별/흡연 정보 보강 */
const enrichWithGenderSmoking = async (list) => {
  if (!Array.isArray(list)) return [];
  const cache = new Map();

  const jobs = list.map(async (it) => {
    const opponentId = it.userId ?? it.matchUserId ?? it.id;

    // 추천 응답에 성별이 담겨 있으면 우선 사용
    let gender =
      it.gender ?? it.userGender ?? it.roommateGender ?? it.sex ?? it.genderCode ?? null;
    // 흡연은 보통 없음 → 프로필에서 확보
    let smoking =
      it.smoking ??
      it.isSmoker ??
      it.smoker ??
      it.smokingStatus ??
      it.smokeYn ??
      it.smoke ??
      it.smokingHabit ??
      null;

    if (!opponentId || (gender != null && smoking != null)) {
      return { ...it, gender, smoking };
    }

    try {
      if (!cache.has(opponentId)) {
        cache.set(opponentId, fetchUserProfile(opponentId));
      }
      const profile = await cache.get(opponentId);
      if (profile) {
        gender =
          gender ??
          profile.gender ??
          profile.userGender ??
          profile.roommateGender ??
          profile.sex ??
          profile.genderCode ??
          null;
        smoking =
          smoking ??
          profile.smoking ??
          profile.isSmoker ??
          profile.smoker ??
          profile.smokingStatus ??
          profile.smokeYn ??
          profile.smoke ??
          profile.smokingHabit ??
          null;
      }
    } catch {
      // 무시
    }

    return { ...it, gender, smoking };
  });

  return Promise.all(jobs);
};

export default function MatchResultsPage({ currentUser }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);

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

  // 내 userId
  const userId = useMemo(() => {
    if (currentUser?.id) return currentUser.id;
    const storedUser = authStore.getUser?.();
    if (storedUser?.id) return storedUser.id;
    const alt =
      Number(localStorage.getItem("userId")) ||
      Number(localStorage.getItem("userid")) ||
      Number(localStorage.getItem("memberId"));
    return Number.isFinite(alt) && alt > 0 ? alt : undefined;
  }, [currentUser]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        if (!userId) {
          setItems([]);
          setError("로그인 정보가 없어 추천을 불러올 수 없어요. (userId 없음)");
          return;
        }
        // 1) 추천 목록
        const list = await getRecommendations(userId);
        // 2) 성별/흡연 정보 보강
        const enriched = await enrichWithGenderSmoking(Array.isArray(list) ? list : []);
        if (!mounted) return;
        setItems(enriched);
      } catch (e) {
        setError(e?.message || "추천 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const displayName =
    currentUser?.nickname ||
    currentUser?.username ||
    authStore.getUser?.()?.username ||
    localStorage.getItem("username") ||
    "Admin";

  const startChatWith = async (opponentUserId) => {
    try {
      const tokens = JSON.parse(localStorage.getItem("em_tokens") || "{}");
      const accessToken = tokens.accessToken;
      if (!accessToken) {
        alert("로그인이 필요합니다.");
        return;
      }
      const base = import.meta.env.VITE_API_BASE ?? "/api";
      const { data } = await axios.post(
        `${base}/api/chat/rooms`,
        { opponentUserId },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const roomId = data?.id;
      navigate(roomId ? `/chat/${roomId}` : "/chat");
    } catch (e) {
      console.error("채팅방 생성 실패:", e);
      alert("채팅방 생성에 실패했습니다.");
    }
  };

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
          .catch(() => { });
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
    <div className="match-wrap">
      <header className="match-appbar">
        <button
          className="back-btn"
          aria-label="뒤로가기"
          onClick={() => {
            navigate(-1);
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

        <h1 className="topbar-title">매칭 하기</h1>

        <nav className="top-icons">
          <Link to="/chat" aria-label="메시지" className="mp-icon-btn">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="M20 2H4a2 2 0 0 0-2 2v14l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </Link>

          <Link to="/profile" className="mp-profile-chip" aria-label="프로필">
            <span className="mp-avatar" aria-hidden>
              👤
            </span>
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

      <main className="match-main">
        <h2 className="headline">
          <span className="nickname">{displayName}</span>
          님과 <span className="similarity">유사도</span>가 비슷해요
        </h2>

        {loading && <div className="card skeleton" />}
        {error && <div className="error">{error}</div>}

        {!loading && !error && items.length === 0 && (
          <div className="empty">
            아직 표시할 매칭 결과가 없어요.<br />
            • userId가 올바른지 <code>localStorage / em_user</code> 확인<br />
            • Network 탭에서 <code>/match/recommendation/list/{String(userId)}</code> 응답 확인
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <ul className="card-list">
            {items.map((it, idx) => {
              const matchUserId = it.userId ?? it.matchUserId ?? it.id;
              const name = it.username || it.roommateName || "익명";
              const rawScore =
                it.score ?? it.preferenceScore ?? it.similarity ?? it.similarityScore;
              const similarity =
                rawScore == null
                  ? undefined
                  : Math.round(Number(rawScore) * (Number(rawScore) > 1 ? 1 : 100));

              // 성별/흡연(보강된 값) 라벨링
              const genderLabel = toGenderLabel(
                it.gender ?? it.userGender ?? it.roommateGender ?? it.sex ?? it.genderCode
              );
              const smokingLabel = toSmokingLabel(
                it.smoking ??
                it.isSmoker ??
                it.smoker ??
                it.smokingStatus ??
                it.smokeYn ??
                it.smoke ??
                it.smokingHabit
              );

              return (
                <li className="card" key={`${matchUserId}-${idx}`}>
                  <div className="card-left">
                    <div className="name">{name}</div>

                    {/* ✅ 상대 정보: 성별 + 흡연 여부(흡연/비흡연) */}
                    <div className="meta">
                      <span className="op-gender">성별: {genderLabel}</span>
                      <span className="sep"> · </span>
                      <span className="op-smoking">흡연: {smokingLabel}</span>
                    </div>

                    <button
                      className="result-link"
                      onClick={async () => {
                        try {
                          const r = await getMatchResult(userId, matchUserId);
                          const msg = `유사도: ${r?.similarity ?? r?.similarityScore ?? similarity ?? "-"
                            }%\n상태: ${r?.status ?? r?.matchStatus ?? it?.status ?? "-"
                            }`;
                          alert(msg);
                        } catch {
                          alert("상세 매칭 결과를 불러오지 못했어요.");
                        }
                      }}
                    >
                      설문조사 결과
                    </button>
                  </div>

                  <div className="card-right">
                    <button className="chat-btn" onClick={() => startChatWith(matchUserId)}>
                      채팅하기
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}