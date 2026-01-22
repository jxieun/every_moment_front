// src/pages/ChatPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import api from "../api/axiosInstance";

import "../styles/ProfilePage.css"; // 상단 공통 헤더 스타일
import "../styles/Chat.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";

/* =======================
   메시지 타입/마커
======================= */
const MSG = {
  TEXT: "TEXT",
  MATCH_REQUEST: "MATCH_REQUEST",
  MATCH_ACCEPT: "MATCH_ACCEPT",
  MATCH_DECLINE: "MATCH_DECLINE",
  SYSTEM: "SYSTEM",
};
const MARK = { REQ: "[[MATCH_REQUEST]]", ACC: "[[MATCH_ACCEPT]]", DEC: "[[MATCH_DECLINE]]" };
const MARK_RE = {
  REQ: /\[\[MATCH_REQUEST#(\d+)\]\]/,
  ACC: /\[\[MATCH_ACCEPT#(\d+)\]\]/,
  DEC: /\[\[MATCH_DECLINE#(\d+)\]\]/,
};
function inferType(m) {
  const c = String(m?.content || "");
  if (c.includes(MARK.REQ) || MARK_RE.REQ.test(c)) return MSG.MATCH_REQUEST;
  if (c.includes(MARK.ACC) || MARK_RE.ACC.test(c)) return MSG.MATCH_ACCEPT;
  if (c.includes(MARK.DEC) || MARK_RE.DEC.test(c)) return MSG.MATCH_DECLINE;
  return MSG.TEXT;
}
function parseMatchIdFromContent(content) {
  const s = String(content || "");
  return s.match(MARK_RE.REQ)?.[1] || s.match(MARK_RE.ACC)?.[1] || s.match(MARK_RE.DEC)?.[1] || null;
}

/* =======================
   토큰/유저 헬퍼
======================= */
const getAccessToken = () => {
  try { return JSON.parse(localStorage.getItem("em_tokens") || "{}").accessToken; }
  catch { return undefined; }
};
const getUser = () => {
  try { return JSON.parse(localStorage.getItem("em_user") || "null"); }
  catch { return null; }
};
const isAdminFromToken = () => {
  try {
    const t = getAccessToken();
    if (!t) return false;
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const hasAdmin = (v) =>
      Array.isArray(v)
        ? v.some((x) => x === "ADMIN" || x === "ROLE_ADMIN")
        : String(v ?? "").split(/[,\s]+/).some((x) => x === "ADMIN" || x === "ROLE_ADMIN");
    return hasAdmin(p.role) || hasAdmin(p.roles) || hasAdmin(p.authorities) || hasAdmin(p.scope) || hasAdmin(p.scopes);
  } catch {
    return false;
  }
};

export default function ChatPage() {
  const navigate = useNavigate();
  const { roomId: routeRoomId } = useParams();

  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE ?? "/api", []);
  const wsBase = useMemo(() => import.meta.env.VITE_WS_BASE ?? "ws://localhost:8080", []);

  const emUser = getUser();
  const isAdmin = isAdminFromToken() || ["ADMIN", "ROLE_ADMIN"].includes(String(emUser?.role || ""));

  /* =======================
     상태
  ======================= */
  // 관리자: users(유저↔유저·보기전용) | inquiry(문의=관리자 포함 방·쓰기가능)
  // 일반유저: mine
  const [view, setView] = useState(isAdmin ? "users" : "mine"); // "users" | "inquiry" | "mine"
  const isReadOnly = isAdmin && view === "users";                // 보기 전용

  const [chatRooms, setChatRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [userId, setUserId] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [matchStatus, setMatchStatus] = useState(null);
  const [lastMatchId, setLastMatchId] = useState(null);

  const ws = useRef(null);
  const messagesEndRef = useRef(null);

  const authHeader = () => ({ Authorization: `Bearer ${getAccessToken()}` });

  /* =======================
     상단 메뉴(로그아웃)
  ======================= */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);
  const handleLogout = async () => {
    try {
      const tokens = JSON.parse(localStorage.getItem("em_tokens") || "{}");
      const accessToken = tokens?.accessToken;
      const refreshToken = tokens?.refreshToken;
      const base = import.meta.env.VITE_API_BASE ?? "/api";
      if (refreshToken) {
        await api.post(`${base}/logout`, { refreshToken }, {
          headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        }).catch(() => { });
      }
      localStorage.removeItem("em_tokens");
      localStorage.removeItem("em_user");
      localStorage.removeItem("userId");
      localStorage.removeItem("userid");
      localStorage.removeItem("memberId");
      try { const { authStore } = await import("../store/auth"); authStore?.logout?.(); } catch { }
      navigate("/", { replace: true });
    } catch {
      navigate("/", { replace: true });
    }
  };

  /* =======================
     방 목록
  ======================= */
  const fetchChatRooms = async () => {
    const at = getAccessToken();
    if (!at) return;
    try {
      // 서버 view 파라미터 매핑: users(유저↔유저) / staff(관리자 포함=문의) / mine(내방)
      const viewParam = !isAdmin ? "mine" : (view === "inquiry" ? "staff" : "users");
      const res = await axios.get(`${apiBase}/api/chat/rooms`, {
        headers: { Authorization: `Bearer ${at}` },
        params: { view: viewParam },
      });
      const list = res.data || [];
      setChatRooms(list);

      // 탭 전환 후 현재 선택 방이 목록에 없으면 자동 해제
      if (selectedRoomId) {
        const exists = list.some((r) => String(r.id) === String(selectedRoomId));
        if (!exists) setSelectedRoomId(null);
      }
    } catch (e) {
      console.error("Failed to fetch chat rooms:", e);
    }
  };
  useEffect(() => { fetchChatRooms(); /* eslint-disable-next-line */ }, [view]);

  // 탭 전환: 방/메시지/상태 초기화 + WS 닫기
  const changeView = (v) => {
    if (ws.current) { try { ws.current.close(); } catch { } }
    setSelectedRoomId(null);
    setMessages([]);
    setMatchStatus(null);
    setLastMatchId(null);
    setView(v);
  };

  // URL의 roomId는 해당 뷰 목록에 있을 때만 선택
  useEffect(() => {
    if (!routeRoomId) return;
    const ok = chatRooms.some((r) => String(r.id) === String(routeRoomId));
    if (ok) setSelectedRoomId(routeRoomId);
  }, [routeRoomId, chatRooms]);

  /* =======================
     메시지 + WS
  ======================= */
  useEffect(() => {
    const boot = async () => {
      if (!selectedRoomId) return;
      const at = getAccessToken();
      const u = getUser();
      if (!at) return;
      try {
        const res = await axios.get(`${apiBase}/api/chat/rooms/${selectedRoomId}/messages`, {
          headers: { Authorization: `Bearer ${at}` },
        });
        const hist = (res.data?.content || []).reverse();
        setMessages(hist.map((m) => ({ ...m, type: inferType(m) })));
        setUserId(u?.id ?? null);
      } catch (e) {
        console.error("Failed to fetch messages:", e);
      }

      // 읽기 전용이어도 수신은 허용
      const token = getAccessToken();
      if (ws.current) ws.current.close();
      const url = `${wsBase}/ws?token=${encodeURIComponent(token || "")}&roomId=${encodeURIComponent(selectedRoomId)}`;
      ws.current = new WebSocket(url);

      ws.current.onopen = () => console.log("WebSocket connected");
      ws.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const withType = { ...msg, type: inferType(msg) };
          setMessages((prev) => [...prev, withType]);
        } catch (e) { console.warn("WS parse error:", e); }
      };
      ws.current.onclose = () => console.log("WebSocket disconnected");
      ws.current.onerror = (err) => console.error("WebSocket error:", err);
    };

    boot();
    return () => { if (ws.current) ws.current.close(); };
  }, [selectedRoomId, apiBase, wsBase]);

  // 스크롤 하단
  useEffect(() => {
    if (messagesEndRef.current)
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* =======================
     유틸(표시/상대/라벨)
  ======================= */
  const currentRoom = useMemo(
    () => chatRooms.find((r) => String(r.id) === String(selectedRoomId)) || null,
    [chatRooms, selectedRoomId]
  );

  const roleShort = (r) => (r ? String(r).replace(/^ROLE_/, "") : "");
  const displayPeer = (r) => {
    // 관리자 전용 표기: A(3) ↔ B(4)
    const aName = r.userAName ? `${r.userAName}(${r.userAId})` : `user(${r.userAId})`;
    const bName = r.userBName ? `${r.userBName}(${r.userBId})` : `user(${r.userBId})`;
    const aR = roleShort(r.userARole);
    const bR = roleShort(r.userBRole);
    const left = aR ? `${aName}` : aName;
    const right = bR ? `${bName}` : bName;
    return `${left} ↔ ${right}`;
  };

  // ✅ 방 제목 규칙(업데이트):
  // - 일반 유저(비관리자): "채팅창 N"
  // - 관리자(users 탭/문의 탭 모두): "A(3) ↔ B(4)"
  const displayRoomTitle = (room, indexOrNull) => {
    if (isAdmin) return displayPeer(room);
    const n = Number.isInteger(indexOrNull) ? indexOrNull + 1 : room.id;
    return `채팅창 ${n}`;
  };

  const getOpponentUserId = () => {
    if (!userId || !selectedRoomId) return null;
    const me = String(userId);
    const rm = chatRooms.find((r) => String(r.id) === String(selectedRoomId));
    if (!rm) return null;
    return String(rm.userAId) === me ? rm.userBId : rm.userAId;
  };

  const senderLabel = (senderId) => {
    if (!isAdmin || !currentRoom) return null;
    const sid = String(senderId);
    if (String(currentRoom.userAId) === sid) {
      const nm = currentRoom.userAName || "user";
      return `${nm}(${currentRoom.userAId})`;
    }
    if (String(currentRoom.userBId) === sid) {
      const nm = currentRoom.userBName || "user";
      return `${nm}(${currentRoom.userBId})`;
    }
    return `user(${senderId})`;
  };

  const isMine = (m) => String(m.senderId) === String(userId);
  const formatTime = (isoString) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  /* =======================
     전송/매칭 (읽기전용 차단)
  ======================= */
  const sendWS = (payload) => {
    if (isReadOnly) return false; // 관리자 유저↔유저는 쓰기 금지
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return false;
    ws.current.send(JSON.stringify(payload));
    return true;
  };

  const handleSendMessage = () => {
    if (isReadOnly) return;
    const t = newMessage.trim();
    if (!t) return;
    if (sendWS({ type: MSG.TEXT, content: t })) setNewMessage("");
  };

  const apiPropose = async (proposerId, targetUserId) => {
    const body = { proposerId, targetUserId, proposalMessage: "룸메이트 요청" };
    const res = await axios.post(`${apiBase}/api/match/propose`, body, { headers: authHeader() });
    return res?.data?.matchId ?? res?.data?.id ?? null;
  };
  const apiAccept = async (matchId) => {
    await axios.post(`${apiBase}/api/match/accept/${matchId}`, null, { headers: authHeader() });
    return true;
  };
  const apiReject = async (matchId) => {
    await axios.post(`${apiBase}/api/match/reject/${matchId}`, null, { headers: authHeader() });
    return true;
  };
  const apiFetchResult = async (meId, otherId) => {
    const { data } = await axios.get(`${apiBase}/api/match/result/result/${meId}/${otherId}`, { headers: authHeader() });
    return data || null;
  };

  // 방 입장/상대 변경 시 최종 상태 조회
  useEffect(() => {
    const bootstrapStatus = async () => {
      if (!userId || !selectedRoomId) return;
      const otherId = getOpponentUserId();
      if (!otherId) return;
      try {
        const res = await apiFetchResult(userId, otherId);
        if (res) {
          setMatchStatus(res.status || null);
          setLastMatchId(res.matchId || null);
        } else {
          setMatchStatus(null);
          setLastMatchId(null);
        }
      } catch (e) {
        console.warn("Match result bootstrap failed:", e?.response || e);
      }
    };
    bootstrapStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedRoomId, chatRooms.length]);

  const findLastIncomingRequestId = () => {
    const reversed = [...messages].reverse();
    for (const m of reversed) {
      const type = inferType(m);
      const mine = isMine(m);
      if (type === MSG.MATCH_REQUEST && !mine) return parseMatchIdFromContent(m.content);
    }
    return null;
  };

  const refreshMatchStatus = async () => {
    try {
      const otherId = getOpponentUserId();
      if (!userId || !otherId) return;
      const res = await apiFetchResult(userId, otherId);
      if (res) {
        setMatchStatus(res.status || null);
        setLastMatchId(res.matchId || null);
      }
    } catch (e) { console.warn("Refresh match status failed:", e?.response || e); }
  };

  const sendMatchRequest = async () => {
    if (isReadOnly) return; // 보기 전용 차단
    if (!selectedRoomId || !userId) return;
    const targetUserId = getOpponentUserId();
    if (!targetUserId) { alert("상대 사용자를 찾을 수 없습니다."); return; }
    if (matchStatus === "ACCEPTED" || matchStatus === "REJECTED") return;

    setSubmitting(true);
    try {
      const matchId = await apiPropose(userId, targetUserId);
      setMatchStatus("PENDING");
      setLastMatchId(matchId);
      const marker = matchId ? `[[MATCH_REQUEST#${matchId}]]` : MARK.REQ;
      const content = `${marker} 룸메이트 요청이 왔습니다! 수락/거절을 선택해주세요.`;
      sendWS({ type: MSG.MATCH_REQUEST, content });
      await refreshMatchStatus();
    } catch (e) {
      console.error("Propose failed:", e?.response || e);
      alert("룸메이트 요청 중 오류가 발생했습니다.");
    } finally { setSubmitting(false); }
  };

  const sendAccept = async () => {
    if (isReadOnly) return;
    if (!selectedRoomId || !userId) return;
    if (matchStatus === "ACCEPTED") return;
    setSubmitting(true);
    try {
      const matchId = findLastIncomingRequestId() || lastMatchId;
      if (!matchId) throw new Error("요청 메시지에서 matchId를 찾을 수 없습니다.");
      await apiAccept(matchId);
      setMatchStatus("ACCEPTED");
      setLastMatchId(matchId);
      const marker = `[[MATCH_ACCEPT#${matchId}]]`;
      sendWS({ type: MSG.MATCH_ACCEPT, content: `${marker} 매칭 성공!` });
      await refreshMatchStatus();
    } catch (e) {
      console.error("Accept error:", e?.response || e);
      alert("매칭 수락 중 오류가 발생했습니다.");
    } finally { setSubmitting(false); }
  };

  const sendDecline = async () => {
    if (isReadOnly) return;
    if (!selectedRoomId || !userId) return;
    if (matchStatus === "REJECTED") return;
    setSubmitting(true);
    try {
      const matchId = findLastIncomingRequestId() || lastMatchId;
      if (!matchId) throw new Error("요청 메시지에서 matchId를 찾을 수 없습니다.");
      await apiReject(matchId);
      setMatchStatus("REJECTED");
      setLastMatchId(matchId);
      const marker = `[[MATCH_DECLINE#${matchId}]]`;
      sendWS({ type: MSG.MATCH_DECLINE, content: `${marker} 매칭 실패ㅠㅠ` });
      await refreshMatchStatus();
    } catch (e) {
      console.error("Reject error:", e?.response || e);
      alert("매칭 거절 중 오류가 발생했습니다.");
    } finally { setSubmitting(false); }
  };

  /* =======================
     렌더
  ======================= */
  const StatusBadge = () => {
    if (!matchStatus) return null;
    const color = matchStatus === "ACCEPTED" ? "#10b981" : matchStatus === "REJECTED" ? "#ef4444" : "#ffb22dff";
    const text = matchStatus === "ACCEPTED" ? "매칭 확정(수락됨)" : matchStatus === "REJECTED" ? "매칭 확정(거절됨)" : "매칭 대기중";
    return (
      <div
        style={{ alignSelf: "center", margin: "8px 0 0", padding: "6px 10px", borderRadius: 999, background: color, color: "#fff", fontSize: 12, fontWeight: 700 }}
        title={lastMatchId ? `matchId: ${lastMatchId}` : undefined}
      >
        {text}
      </div>
    );
  };

  const RequestCard = ({ onAccept, onDecline, disabled }) => {
    const locked = disabled || matchStatus === "ACCEPTED" || matchStatus === "REJECTED";
    return (
      <div className="match-request">
        <div className="mr-text">룸메이트 요청이 왔습니다! 수락/거절을 선택해주세요.</div>
        <div className="mr-actions">
          <button className="mr-accept" onClick={onAccept} disabled={locked || isReadOnly}>수락</button>
          <button className="mr-decline" onClick={onDecline} disabled={locked || isReadOnly}>거절</button>
        </div>
      </div>
    );
  };

  return (
    <div className="ch-wrap">
      {/* ===== 상단 공통 헤더 ===== */}
      <header className="profile-topbar" style={{ position: "sticky", top: 0, zIndex: 30 }}>
        <button className="back-btn" aria-label="뒤로가기" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar-title">채팅</h1>
        <nav className="top-icons">
          <Link to="/chat" aria-label="메시지" className="mp-icon-btn">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M20 2H4a2 2 0 0 0-2 2v14l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </Link>
          <Link to="/profile" className="mp-profile-chip" aria-label="프로필"><span className="mp-avatar" aria-hidden>👤</span></Link>
          <div className="mp-menu" ref={menuRef}>
            <button className="mp-icon-btn mp-menu-btn" aria-label="메뉴" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
            {menuOpen && (
              <ul className="mp-menu-dd" role="menu">
                <li role="menuitem"><button className="mp-menu-item" onClick={handleLogout}>로그아웃</button></li>
              </ul>
            )}
          </div>
        </nav>
      </header>

      {/* ===== 관리자 전용 탭 ===== */}
      {isAdmin && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px" }}>
          <button className={`tab ${view === "users" ? "active" : ""}`} onClick={() => changeView("users")}>유저↔유저</button>
          <button className={`tab ${view === "inquiry" ? "active" : ""}`} onClick={() => changeView("inquiry")}>문의</button>
        </div>
      )}

      {/* ===== 본문 ===== */}
      <div className="ch-body">
        {/* 좌측 리스트 */}
        <aside className="ch-sidebar">
          <div className="ch-list-header">채팅방</div>
          <ul className="ch-room-list">
            {chatRooms.map((room, i) => (
              <li key={room.id}>
                <button
                  className={`ch-room ${String(selectedRoomId) === String(room.id) ? "active" : ""}`}
                  onClick={() => setSelectedRoomId(room.id)}
                >
                  <div className="ch-room-left">
                    <div className="ch-avatar">익명</div>
                    <div className="ch-room-main">
                      <div className="ch-room-name">{displayRoomTitle(room, i)}</div>
                      <div className="ch-room-last" />
                    </div>
                  </div>
                  <div className="ch-room-time" />
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* 우측 패널 */}
        <section className="ch-panel">
          {selectedRoomId ? (
            <>
              <header className="ch-panel-head">
                <button className="ch-back" onClick={() => setSelectedRoomId(null)} title="방 닫기">❮</button>
                <div className="ch-peer">
                  <div className="ch-peer-avatar">익명</div>
                  <span className="ch-peer-name">
                    {(() => {
                      if (!currentRoom) return `채팅`;
                      const currentIndex = chatRooms.findIndex(r => String(r.id) === String(selectedRoomId));
                      return displayRoomTitle(currentRoom, currentIndex);
                    })()}
                  </span>
                </div>
                <div style={{ flex: 1 }} />
                <StatusBadge />
              </header>

              <div className="ch-msgs">
                {messages.map((m) => {
                  const type = inferType(m);
                  const mine = isMine(m);

                  if (type === MSG.MATCH_ACCEPT || type === MSG.MATCH_DECLINE) {
                    return (
                      <div key={m.id ?? `${m.createdAt}-${Math.random()}`} className="msg-row system">
                        <span className="bubble system">{type === MSG.MATCH_ACCEPT ? "매칭 성공!" : "매칭 실패ㅠㅠ"}</span>
                        <span className="time">{formatTime(m.createdAt)}</span>
                      </div>
                    );
                  }

                  if (type === MSG.MATCH_REQUEST) {
                    return (
                      <div key={m.id ?? `${m.createdAt}-${Math.random()}`} className={`msg-row ${mine ? "sent" : "received"}`}>
                        <div className="bubble">
                          {!mine ? (
                            <RequestCard onAccept={sendAccept} onDecline={sendDecline} disabled={submitting} />
                          ) : (
                            <div>
                              룸메이트 요청을 보냈습니다. 상대의 응답을 기다려 주세요.
                              {matchStatus === "PENDING" && (
                                <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                                  (상태: 대기중 · matchId {lastMatchId ?? "?"})
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <span className="time">{formatTime(m.createdAt)}</span>
                      </div>
                    );
                  }

                  // 기본 텍스트 (관리자만 발신자 라벨 노출)
                  return (
                    <div key={m.id ?? `${m.createdAt}-${Math.random()}`} className={`msg-row ${mine ? "sent" : "received"}`}>
                      <span className="bubble">
                        {isAdmin && <span className="sender-tag">{senderLabel(m.senderId)}</span>}
                        {m.content}
                      </span>
                      <span className="time">{formatTime(m.createdAt)}</span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* 입력 & 액션 */}
              <div
                className={`ch-inputbar ${isReadOnly ? "readonly" : ""}`}
                title={isReadOnly ? "관리자 보기 전용: 유저↔유저 대화에서는 전송할 수 없습니다." : undefined}
              >
                <input
                  type="text"
                  className="ch-input"
                  placeholder={isReadOnly ? "유저↔유저 채팅은 관리자 쓰기 금지" : "메시지 입력"}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (!isReadOnly && e.key === "Enter") handleSendMessage();
                  }}
                  disabled={submitting || isReadOnly}
                />
                <button
                  className="ch-send"
                  onClick={handleSendMessage}
                  title={isReadOnly ? "전송 불가" : "보내기"}
                  disabled={submitting || isReadOnly}
                >
                  <FontAwesomeIcon icon={faPaperPlane} />
                </button>

                <div className="ch-actions-right">
                  <button
                    className="ch-match-btn"
                    onClick={sendMatchRequest}
                    title={isReadOnly ? "관리자 보기 전용" : "룸메이트 요청 보내기"}
                    disabled={
                      submitting ||
                      isReadOnly ||
                      !selectedRoomId ||
                      matchStatus === "ACCEPTED" ||
                      matchStatus === "REJECTED"
                    }
                  >
                    룸메이트 요청
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="ch-empty">채팅방을 선택하세요</div>
          )}
        </section>
      </div>

      {/* 보강 스타일(활성 탭 흰 글자, 관리자 라벨) */}
      <style>{`
        .tab, .tab:link, .tab:visited { color:#111; }
        .tab.active, .tab.active:link, .tab.active:visited, .tab.active:hover, .tab.active:focus {
          color:#fff !important;
        }
        .ch-inputbar.readonly { opacity:.6; }
        .ch-inputbar.readonly * { cursor:not-allowed !important; }
        .sender-tag { display:block; font-size:12px; color:#6b7280; margin-bottom:4px; }
      `}</style>
    </div>
  );
}
