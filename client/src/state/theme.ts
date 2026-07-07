/**
 * 테마 상태 — 웹 전체 디자인 테마(design-lab 6종 컨셉) 런타임 스왑 + localStorage 지속.
 * (아키텍트 소유 — 테마 시스템 정본. 게임 로직/좌표에는 절대 관여하지 않는다 → 크로스플레이 불변.)
 *
 * 동작: <html>의 data-theme 속성을 세팅하면, theme.css의 토큰 계약(:root)을
 *       themes/<id>.css의 `:root[data-theme="<id>"]` 블록이 통째로 재정의해
 *       전체 화면이 즉시 리스킨된다(색/폰트/형태/효과). 게임은 @madpump/shared 순수
 *       코어로 구동되므로, 서로 다른 테마의 두 사람이 함께 플레이해도 판정/좌표는 동일하다.
 *
 * 사용법:
 *   initTheme();                 // main.tsx 부팅 시 1회 — 저장된 테마를 즉시 <html>에 적용(FOUC 방지)
 *   const t = useTheme();        // React 컴포넌트에서 현재 테마 구독 (ThemeShop)
 *   setTheme('neo-brutal');      // 즉시 전환 + 저장 (모달 버튼)
 *   getTheme();                  // 비-React 코드(캔버스 게임 팔레트)용 스냅샷
 */
import { createStore, useStore } from './store';

/** 선택 가능한 테마 id — design-lab/ideas/* 6종. neon-coinop = 기본 셸(theme.css :root). */
export const THEME_IDS = [
  'neon-coinop',
  'neo-brutal',
  'clay-toy',
  'broadcast-arena',
  'obsidian',
  'pico8',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'neon-coinop';

/** 모달 카드 표시용 메타(라벨/설명/미리보기 스와치). 실제 색·형태 정본은 themes/<id>.css. */
export interface ThemeMeta {
  id: ThemeId;
  /** 한글 표시명 */
  name: string;
  /** 한 줄 설명 */
  tagline: string;
  /** 카드 미리보기 스와치 [bg, accent, p1, p2] */
  swatch: [string, string, string, string];
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'neon-coinop',
    name: '네온 코인업',
    tagline: '80s 아케이드 · 신스웨이브 · CRT 스캔라인',
    swatch: ['#0d0221', '#fdf500', '#05d9e8', '#ff2a6d'],
  },
  {
    id: 'neo-brutal',
    name: '네오 브루탈',
    tagline: '크림 페이퍼 · 하드 섀도우 · 대문자',
    swatch: ['#fdf6e3', '#ff5c00', '#2b5bff', '#ff2e88'],
  },
  {
    id: 'clay-toy',
    name: '클레이 토이',
    tagline: '말랑 점토 · 파스텔 · 소프트 볼륨',
    swatch: ['#fff1e6', '#ff8a5c', '#ff6e8a', '#3fc49e'],
  },
  {
    id: 'broadcast-arena',
    name: '브로드캐스트 아레나',
    tagline: 'e스포츠 중계 그래픽 · 로워서드 · 티커',
    swatch: ['#eef2f7', '#0b2f6b', '#0b63e5', '#e0323e'],
  },
  {
    id: 'obsidian',
    name: '옵시디언',
    tagline: '다크 미니멀 · 얇은 네온 · 코너컷',
    swatch: ['#0a0c10', '#00f0ff', '#00f0ff', '#ff3358'],
  },
  {
    id: 'pico8',
    name: '피코-8',
    tagline: '16색 픽셀 · 도트 텍스처 · 8비트',
    swatch: ['#1d2b53', '#ffa300', '#29adff', '#ff004d'],
  },
] as const;

interface ThemeState {
  current: ThemeId;
}

const LS_KEY = 'madpump:theme';

function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}

/** localStorage에서 저장된 테마 로드 — 없거나 손상 시 기본 테마. (audio/engine.ts 패턴) */
function loadTheme(): ThemeId {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (raw) {
      const p = JSON.parse(raw) as { current?: unknown };
      if (isThemeId(p.current)) return p.current;
    }
  } catch {
    /* ignore — 손상/차단 시 기본 */
  }
  return DEFAULT_THEME;
}

function saveTheme(id: ThemeId): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify({ current: id }));
  } catch {
    /* ignore */
  }
}

/** <html data-theme> 세팅 = 리스킨 트리거(순수 CSS 재캐스케이드, 리로드 없음). */
function applyTheme(id: ThemeId): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', id);
  }
}

export const themeStore = createStore<ThemeState>({ current: loadTheme() });

/**
 * 부팅 시 1회 — 저장된 테마를 즉시(동기, paint 전) <html>에 적용해 FOUC를 막는다.
 * main.tsx에서 createRoot().render 이전에 호출할 것 (StrictMode 이중호출/useEffect 지연 금지).
 * index.html의 인라인 스크립트가 이미 data-theme을 세팅했더라도, 스토어와 일치시키기 위해 재확정한다.
 */
export function initTheme(): void {
  applyTheme(themeStore.get().current);
}

/** 테마 즉시 전환 + 저장 + 구독자 통지(모달 리렌더). */
export function setTheme(id: ThemeId): void {
  if (!isThemeId(id) || id === themeStore.get().current) {
    // 같은 테마여도 data-theme는 재확정(외부에서 어긋났을 수 있음)
    applyTheme(id);
    return;
  }
  saveTheme(id);
  applyTheme(id);
  themeStore.set({ current: id });
}

/** React 훅 — 현재 테마 구독 */
export function useTheme(): ThemeId {
  return useStore(themeStore).current;
}

/** 비-React 스냅샷 — 캔버스 게임 팔레트 선택 등 */
export function getTheme(): ThemeId {
  return themeStore.get().current;
}
