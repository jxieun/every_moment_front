# 🎨 Every Moment (모든 순간) Frontend

사용자 가치관 기반 매칭 플랫폼 **Every Moment**의 React 프론트엔드입니다.

## 🚀 배포 주소 (Live URLs)
- **Frontend**: [https://everymomentmini2front.vercel.app](https://everymomentmini2front.vercel.app)
- **Backend API**: [https://every-moment-back.onrender.com](https://every-moment-back.onrender.com)

## 🔑 테스트 계정
| 역할 | 이메일 | 비밀번호 | 비고 |
|---|---|---|---|
| **관리자** | `admin@example.com` | `AdminPassw0rd!` | 전체 채팅 관리 |
| **데모 유저** | `demo@example.com` | `Passw0rd!` | 일반 매칭/설문 |

## 🛠️ 기술 스택
- **Framework**: React (Vite)
- **Style**: CSS Modules, FontAwesome
- **Communication**: Axios, WebSocket (STOMP)

## 🛠️ 주요 이슈 해결 내역 (Troubleshooting)
- **API Prefix**: 모든 API 엔드포인트에 `/api` 프리픽스 추가 (401 오류 해결)
- **WebSocket**: 실시간 채팅 및 매칭 상태 동기화 로직 개선
- **IME Input**: 한글 입력 시 중복 메시지 전송 방지 (`isComposing` 체크)
- **Admin Actions**: 관리자 게시글 승인/거절 기능 엔드포인트 수정

## ⚙️ 실행 방법
1. **설치**
   ```bash
   npm install
   ```
2. **실행**
   ```bash
   npm run dev
   ```
