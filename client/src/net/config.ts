/** Server address — in dev (vite 5173) a separate server (3000), in production the same origin (server serves the client) */
export const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3000' : ''
