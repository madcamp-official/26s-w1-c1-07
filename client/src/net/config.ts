/** 서버 주소 — 개발(vite 5173)은 별도 서버(3000), 프로덕션은 같은 오리진(서버가 클라 서빙) */
export const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3000' : ''
