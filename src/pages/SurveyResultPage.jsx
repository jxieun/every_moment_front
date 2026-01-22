import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axiosInstance';
import { authStore } from '../store/auth';
import '../styles/SurveyResult.css';


function formatAnswer(key, raw) {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = Number(raw);
  switch (key) {
    case 'sleepTime': {
      const map3 = { 1: '10시 이전', 2: '10시 전후', 3: '10시 이후' };
      const map5 = { 1: '매우 이른 편', 2: '이른 편', 3: '보통', 4: '늦은 편', 5: '매우 늦은 편' };
      return map3[n] || map5[n] || `${raw}`;
    }
    case 'cleanliness': {
      const map = { 1: '거의 안 함', 2: '주 1~2회', 3: '주 3~4회', 4: '거의 매일', 5: '매일' };
      return map[n] || `${raw}회/주`;
    }
    case 'noiseSensitivity': {
      const map = { 1: '낮음', 2: '다소 낮음', 3: '보통', 4: '다소 높음', 5: '매우 높음' };
      return map[n] || `${raw}`;
    }
    case 'height': {
      const map = { 1: '저층', 2: '중층', 3: '고층' };
      return map[n] || `${raw}층 선호`;
    }
    case 'roomTemp': {
      const map = { 1: '서늘한 편', 2: '보통', 3: '따뜻한 편' };
      return map[n] || `${raw}℃ 선호`;
    }
    default:
      return `${raw}`;
  }
}

export default function SurveyResultPage() {
  const navigate = useNavigate();
  const user = authStore.getUser?.() || {};
  const NAME = user?.nickname || user?.username || 'Admin';
  const USER_ID = user?.id || user?.userId;

  const QUESTIONS = useMemo(
    () => [
      { key: 'sleepTime', title: '1. 평소 몇시에 주무시나요?' },
      { key: 'cleanliness', title: '2. 주기적으로 얼마나 청소하시나요?(일주일 기준)' },
      { key: 'noiseSensitivity', title: '3. 소음에 얼마나 민감하신가요?' },
      { key: 'height', title: '4. 원하시는 층은 어떻게 되시나요?' },
      { key: 'roomTemp', title: '5. 선호하시는 방 온도는 어떻게 되시나요?(여름/겨울 기준)' },
    ],
    []
  );

  const [answers, setAnswers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!USER_ID) {
          setErr('로그인이 필요합니다.');
          setLoading(false);
          return;
        }
        setLoading(true);
        setErr('');

        // ✅ 백엔드 구현 경로에 맞춤
        const res = await api.get(`/api/survey/${USER_ID}`);
        const raw = res?.data?.data || res?.data;

        if (!raw) {
          setErr('설문 결과가 없습니다.');
          setLoading(false);
          return;
        }

        // 백엔드 DTO 키 그대로 사용
        const pretty = {
          sleepTime: formatAnswer('sleepTime', raw.sleepTime),
          cleanliness: formatAnswer('cleanliness', raw.cleanliness),
          noiseSensitivity: formatAnswer('noiseSensitivity', raw.noiseSensitivity),
          height: formatAnswer('height', raw.height),
          roomTemp: formatAnswer('roomTemp', raw.roomTemp),
        };

        if (mounted) setAnswers(pretty);
      } catch (e) {
        if (!mounted) return;
        const msg = e?.response?.data?.message || e?.message || '설문 결과를 불러오는 중 오류가 발생했습니다.';
        setErr(msg);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [USER_ID]);

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
    <div className="result-wrap">
      <div className="topbar">
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

        <div className="topbar-title">설문 조사 완료</div>

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
      </div>

      <main className="result-body">
        <h2 className="result-heading">{NAME}님의 설문 조사 결과입니다</h2>

        <section className="card">
          {loading ? (
            <div className="loading">불러오는 중…</div>
          ) : err ? (
            <div className="error">{err}</div>
          ) : (
            <ol className="qa-list">
              {QUESTIONS.map((q, i) => (
                <li key={q.key} className="qa-item">
                  <div className="q">
                    <span className="q-no">{i + 1}.</span>
                    <span className="q-text">{q.title.replace(/^\d+\.\s*/, '')}</span>
                  </div>
                  <div className="a">
                    <span className="radio-dot" aria-hidden="true" />
                    <span className="a-text">{answers?.[q.key] ?? '—'}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="actions">
          <button className="primary cta" onClick={() => navigate('/match')} disabled={loading || !!err}>
            나와 맞는 사람 찾기
          </button>
        </div>
      </main>
    </div>
  );
}
