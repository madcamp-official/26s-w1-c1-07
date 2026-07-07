/**
 * Google Identity Services (GIS) wrapper — renders the official Google sign-in button.
 * index.html loads https://accounts.google.com/gsi/client async, so we poll until
 * window.google is ready, then render.
 *
 * Usage (component):
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
 * Render the Google button into `container`; on click→login, pass the credential (ID token) to the callback.
 * @returns cleanup function (use as the useEffect return value)
 */
export function renderGoogleButton(container: HTMLElement, onCredential: CredentialHandler): () => void {
  let cancelled = false

  const tryRender = () => {
    if (cancelled) return
    if (!window.google?.accounts?.id) {
      setTimeout(tryRender, 100) // wait for the gsi script to load
      return
    }
    if (!GOOGLE_CLIENT_ID) {
      container.textContent = 'VITE_GOOGLE_CLIENT_ID not set (client/.env)'
      return
    }
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
    container.replaceChildren() // remove the button iframe on unmount
  }
}
