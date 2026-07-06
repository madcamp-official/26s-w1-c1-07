export const meta = {
  name: 'madpump-game-concepts',
  description: 'Games 4-10: 게임당 서로 다른 컨셉 10개(총 70) 네온 픽토그램을, 각각 5회 QA(유사도 게이트 포함) 루프로 생성',
  phases: [
    { title: 'Ideate', detail: '7게임 × 10전략 = 70 컨셉 분산 기획' },
    { title: 'Design+QA', detail: '70 컨셉 각각 5루프 SVG 픽토그램 (유사도 게이트)' },
  ],
}

// ── 공통 컨텍스트 (팔레트 · SVG 계약 · 클리셰 · 전략 · 기존 마크) ──
const CTX = `
[디자인 시스템: NEON COIN-OP 신스웨이브 아케이드]
· 배경 다크퍼플(#0D0221 / 스크린필드 #1A0B2E). 네온 절제 — 화면당 발광(gp-glow) 3계열 이하, 나머지는 dim.
· 팔레트 토큰(이 색만): P1시안 #05D9E8 / P2핑크 #FF2A6D / 옐로 #FDF500 / 마젠타 #D300C5 / 그린 #39FF88 / muted #9D8FBF / white #F4F0FF.
· P1=시안=왼쪽, P2=핑크=오른쪽 절대 고정(2인 대전 요소가 있을 때). 옐로=강조 1점. 마젠타=그리드/보조선.

[SVG 계약 — 반드시 준수]
· 좌표계 viewBox="0 0 120 108" (가로120 세로108), 안전여백 ~8px. ~120px에서 한눈에 "이 게임"으로 읽혀야 함. 요소 40개 이하.
· 반환은 <svg> 내부 자식 마크업만 (svg 래퍼/xmlns 없이).
· 색은 그룹 클래스로만 지정: 예) <g class="gp-cyan gp-fill gp-glow">…</g>
    색: gp-cyan gp-pink gp-yellow gp-mag gp-green gp-dim gp-white
    형: gp-fill(면=currentColor 채움) / gp-stroke(선=currentColor, 채움없음)
    발광: gp-glow  |  투명 보조: gp-dim2(0.4) gp-grid(0.28) gp-faint(0.6) gp-magma(0.22)
    아케이드 폰트 텍스트: <text class="seg" x=.. y=.. text-anchor="middle">…</text> (Press Start 2P, 대문자/숫자만)
· 허용 요소: rect circle line polyline polygon path text. stroke-width/stroke-linecap/stroke-dasharray/points/d 속성 사용 가능.
· 금지: <image> <style> <script> <defs> 그라디언트 filter(제공 gp-glow 외) href url() xmlns, 그리고 인라인 style 로 색 지정. 색은 오직 gp-* 클래스.
· 다크 위 네온 원칙: 큰 면적을 순색으로 꽉 채우지 말 것 — 면은 dim 바탕/저투명, 윤곽·포인트만 발광.
· 픽셀아트 지향: 좌표를 격자(2·4·6px 배수)에 맞춰 블록감 있게. 부드러운 곡선보다 각진 픽셀/네온 라인.

[피해야 할 클리셰 — 이런 건 similarityScore 100 취급]
· 이모지, 게임번호 숫자만 중앙배치, 통짜 게임패드/조이스틱, 트로피, 톱니바퀴, 하트, 별, 느낌표/물음표, 단순 번개, 3겹 원 과녁만, 로딩 스피너, 리본배너.
· 기존 게임1 마크(세븐세그 '87' + 상/하 화살표), 게임2(수직 낙하 탄막 3줄), 게임3(교차한 검 2자루 + 지그재그 파도) 와 닮지 말 것.

[10가지 시각 전략 — 게임당 10 컨셉을 각기 다른 전략에 1:1 배정하여 분산]
S1 히어로 스프라이트(주인공 오브젝트를 픽셀 스프라이트로 크게)
S2 액션 순간 포착(충돌·명중·점프정점·발사 결정적 프레임 정지)
S3 탑다운 전술 뷰(위에서 본 배치도/맵/궤적)
S4 사이드뷰 필드(측면 스테이지 단면: 지면·천장·양측)
S5 HUD·게이지·미터(스코어/타이머/파워바/조준링 계기판 판독)
S6 엠블럼·크레스트(문장형 심볼·배지)
S7 타이포·숫자 아트(게임 상징 글자/숫자/기호 조형)
S8 추상 기하(모션라인·트레일·파형·리듬 그래픽)
S9 환경·배경(무대/풍경 자체)
S10 스플릿 듀얼(P1시안·P2핑크 미러 대치, 반반 분할)
`

const GAMES = [
  { n: 4, name: '공룡 달리기', rules: '사이드뷰 러너 대전. P1(공룡,시안)=점프/숙이기로 10초 생존. P2(핑크)=지면 선인장/머리높이 새 장애물 생성. 한 번이라도 충돌하면 P2 승. 크롬 공룡 오프라인 게임 감성.', current: '시안 픽셀 공룡 + 핑크 선인장 + 지면선 + 속도선' },
  { n: 5, name: '몬스터 포격전', rules: '중앙에 좌 P1(시안)·우 P2(핑크) 회전 포탑 2대. 가장자리에서 몬스터들이 목표 포탑으로 침공, 포신을 돌려 예광탄으로 요격. 격추수=스코어, 장전 쿨다운 링.', current: '핑크 스페이스인베이더 + 시안 대포 + 옐로 예광탄' },
  { n: 6, name: '펌프', rules: 'DDR/펌프잇업식 리듬 연타. 좌 P1(시안)·우 P2(핑크) 미러 레인. 노트 타일이 히트라인(NOW)으로 낙하, 타이밍 맞는 키를 누르면 +1 틀리면 -1. 스코어 잭팟 대결.', current: 'DDR 화살표 노트 + 옐로 히트라인 + 원근 레인' },
  { n: 7, name: '스피드 오목', rules: '7×7 교점판. 스캐너 커서가 판을 훑고, 자기 턴에 배치키로 커서 위치에 돌을 둔다. 먼저 3목(가로/세로/대각) 완성 시 승. 플래시로 상대 시야 방해.', current: '5x5 격자 + 시안 3목 대각선 + 핑크 돌 + 옐로 커서박스' },
  { n: 8, name: '마그마 총격 듀얼', rules: '천장 가시·바닥에서 상승하는 마그마 사이. 좌 P1(시안)·우 P2(핑크) 두 기체가 플래피처럼 낙하/점프하며 수평 발사로 상대 명중 노림. 마그마/가시 닿으면 즉사.', current: '천장 가시 + 시안/핑크 기체 + 예광탄 + 하단 마그마' },
  { n: 9, name: '줄다리기', rules: '밧줄 매듭이 좌(P1 시안 완승선)·우(P2 핑크 완승선) 사이. 두 팀이 키를 교대로 눌러 당김. 매듭이 완승선 도달 또는 10초 시점 우세한 쪽 승.', current: '밧줄 + 옐로 다이아 매듭 + 시안/핑크 셰브런' },
  { n: 10, name: '라이트 사이클', rules: '트론. 격자 위 두 바이크가 전진하며 지나온 칸에 빛의 벽(궤적)을 남김. 벽/궤적 충돌 시 사망, 마지막 생존자 승. 좌 시안·우 핑크.', current: '격자 + 시안/핑크 직각 궤적 + 헤드 사각' },
]

const CONCEPTS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['concepts'],
  properties: {
    concepts: {
      type: 'array', minItems: 10, maxItems: 10,
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'strategy', 'oneLiner', 'marks', 'palette', 'distinct'],
        properties: {
          title: { type: 'string', description: '짧은 컨셉명(한글, 4~10자)' },
          strategy: { type: 'string', description: 'S1~S10 중 하나 (겹치지 않게)' },
          oneLiner: { type: 'string', description: '보는 사람이 화면에서 보게 되는 것 한 줄' },
          marks: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'string' }, description: '핵심 시각 요소들' },
          palette: { type: 'array', items: { type: 'string' }, description: '쓸 토큰들(cyan/pink/yellow/mag/green/dim/white)' },
          distinct: { type: 'string', description: '다른 9개와 왜 다른가 한 줄' },
        },
      },
    },
  },
}

const DESIGN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'strategy', 'firstDraftSvg', 'finalSvg', 'qaLog', 'selfScores'],
  properties: {
    title: { type: 'string' },
    strategy: { type: 'string' },
    firstDraftSvg: { type: 'string', description: 'iter1 초안 SVG 내부 마크업' },
    finalSvg: { type: 'string', description: 'iter5 최종 SVG 내부 마크업(<svg> 래퍼 없이)' },
    qaLog: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object', additionalProperties: false,
        required: ['iter', 'critique', 'similarityScore', 'similarTo', 'change'],
        properties: {
          iter: { type: 'integer' },
          critique: { type: 'string', description: '이 iter의 정직한 자가비평' },
          similarityScore: { type: 'integer', description: '0(독창)~100(동일) — 다른 9컨셉/기존1~3/클리셰 대비 최댓값' },
          similarTo: { type: 'string', description: '무엇과 비슷한지(없으면 "고유")' },
          change: { type: 'string', description: '다음 버전에서 실제로 바꾼 것(유사도>55면 마크 교체 수준)' },
        },
      },
    },
    selfScores: {
      type: 'object', additionalProperties: false,
      required: ['conceptClarity', 'paletteAdherence', 'glowRestraint', 'readability', 'distinctiveness'],
      properties: {
        conceptClarity: { type: 'integer' }, paletteAdherence: { type: 'integer' },
        glowRestraint: { type: 'integer' }, readability: { type: 'integer' }, distinctiveness: { type: 'integer' },
      },
    },
  },
}

const ideatePrompt = (g) => `${CTX}

[임무] 게임 ${g.n} "${g.name}" 의 아케이드 캐비닛 스크린용 픽토그램 컨셉을 정확히 10개 기획하라.
게임 규칙: ${g.rules}
(참고) 기존 약한 시안(이걸 넘어서거나 피하라): ${g.current}

요구:
· 10개 컨셉을 S1~S10 전략에 1:1로 배정 — 두 컨셉이 같은 중심 오브젝트를 공유하지 말 것. 최대한 서로 멀게 분산.
· 각 컨셉은 ~120px에서 "${g.name}"으로 즉시 읽혀야 함. 규칙에서 상징 하나를 뽑되 표현 전략은 10가지로 다르게.
· 팔레트는 토큰만, 2인 대전 요소엔 P1시안(좌)/P2핑크(우) 규칙.
· 클리셰·기존 게임1~3 마크와 닮지 말 것.
반환: concepts[10] (title, strategy, oneLiner, marks, palette, distinct).`

const designPrompt = (g, c, i, sibs) => `${CTX}

[임무] 게임 ${g.n} "${g.name}"의 컨셉 #${i + 1}/10 "${c.title}" (전략 ${c.strategy}) 를 SVG 픽토그램으로 구현하고, 5회 QA 루프로 완성하라.
· 게임 규칙: ${g.rules}
· 이 컨셉이 보여줄 것: ${c.oneLiner}
· 핵심 마크: ${(c.marks || []).join(', ')}
· 팔레트: ${(c.palette || []).join(', ')}

[같은 게임의 다른 9개 컨셉 — 이것들과 유사하면 감점, 겹치면 새로 기획]
${sibs.map((s, k) => `  ${k + 1}. [${s.strategy}] ${s.title} — ${s.oneLiner}`).join('\n')}

[5회 QA 루프 — 반드시 실제로 5버전을 거쳐라]
루브릭(매 iter 1~5점): conceptClarity(이 게임으로 읽히나) / paletteAdherence(토큰만·좌우색규칙) / glowRestraint(발광 3계열↓) / readability(120px에서 안 복잡) / distinctiveness(독창성).
similarityScore(0~100): (a)위 다른 9컨셉 (b)기존 게임1~3 마크 (c)클리셰목록 중 가장 닮은 것 대비 최댓값. 0=고유, 100=동일.
루프 규칙:
 · iter1 = 초안 → firstDraftSvg 에 저장.
 · iter2~5 = 정직한 자가비평 후 개선. **similarityScore>55 또는 conceptClarity<4 이면 "부분수정"이 아니라 핵심 오브젝트/구도를 실질적으로 새로 기획**(마크 교체)해야 하고 similarTo 를 명시. 그 외엔 정밀 개선(정렬·글로우 절제·픽셀 스냅·가독성).
 · 매 iter 마다 SVG가 실제로 달라져야 함. 최종 similarityScore는 40 이하를 목표.
 · finalSvg = iter5의 최고안. SVG 계약을 100% 지키고, <svg viewBox="0 0 120 108"> 안에 그대로 넣어 렌더될 유효한 내부 마크업이어야 함(닫는 태그·따옴표 정확히).

반환: title, strategy, firstDraftSvg, finalSvg, qaLog[5](iter,critique,similarityScore,similarTo,change), selfScores.`

// ── 실행: 게임별 아이디에이션 → 그 게임의 10컨셉 각각 디자인+5QA ──
log('Ideate: 7게임 × 10컨셉 기획 시작')
const results = await parallel(
  GAMES.map((g) => async () => {
    const idea = await agent(ideatePrompt(g), {
      label: `ideate-g${g.n}`, phase: 'Ideate', schema: CONCEPTS_SCHEMA,
    })
    if (!idea || !idea.concepts) return { game: g.n, name: g.name, concepts: [], designs: [] }
    const concepts = idea.concepts.slice(0, 10)
    log(`g${g.n} ${g.name}: 컨셉 10 확정 → 디자인+QA`)
    const designs = await parallel(
      concepts.map((c, i) => () => {
        const sibs = concepts.filter((_, k) => k !== i)
        return agent(designPrompt(g, c, i, sibs), {
          label: `g${g.n}-c${i + 1}`, phase: 'Design+QA', effort: 'high', schema: DESIGN_SCHEMA,
        }).then((d) => (d ? { ...d, conceptId: i + 1, brief: c } : null))
      }),
    )
    const ok = designs.filter(Boolean)
    log(`g${g.n} ${g.name}: 디자인 ${ok.length}/10 완료`)
    return { game: g.n, name: g.name, concepts, designs: ok }
  }),
)

const total = results.filter(Boolean).reduce((a, r) => a + (r.designs ? r.designs.length : 0), 0)
log(`완료: 총 ${total} 디자인`)
return { results: results.filter(Boolean), total }
