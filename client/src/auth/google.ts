/**
 * Google Identity Services(GIS) 래퍼 — 공식 구글 로그인 버튼 렌더.
 * index.html 에서 https://accounts.google.com/gsi/client 를 async 로드하므로
 * window.google 이 준비될 때까지 폴링 후 렌더한다.
 *
 * 사용법 (컴포넌트):
 *   const ref = useRef<HTMLDivElement>(null)
 *   useEffect(() => renderGoogleButton(ref.current!, async (credential) => { ... }), [])
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any
  }
}

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export type CredentialHandler = (credential: string) => void

/**
 * 컨테이너에 구글 버튼을 렌더하고 클릭→로그인 시 credential(ID 토큰)을 콜백으로 전달.
 * @returns cleanup 함수 (useEffect 반환값으로 사용)
 */
export function renderGoogleButton(container: HTMLElement, onCredential: CredentialHandler): () => void {
  let cancelled = false

  const tryRender = () => {
    if (cancelled) return
    if (!window.google?.accounts?.id) {
      setTimeout(tryRender, 100) // gsi 스크립트 로드 대기
      return
    }
    if (!GOOGLE_CLIENT_ID) {
      container.textContent = 'VITE_GOOGLE_CLIENT_ID 미설정 (client/.env)'
      return
    }
    // initialize는 마지막 호출이 콜백을 갖는다 — 버튼을 렌더하는 쪽이 최신이므로 문제 없음
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (resp: { credential?: string }) => {
        if (!cancelled && resp?.credential) onCredential(resp.credential)
      },
    })
    window.google.accounts.id.renderButton(container, {
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
    })
  }

  tryRender()
  return () => {
    cancelled = true
    container.replaceChildren() // 언마운트 시 버튼 iframe 제거
  }
}
