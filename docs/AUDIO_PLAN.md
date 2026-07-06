# MADPUMP — 8-BIT 오디오 킷 (OST 프롬프트 · SFX 소스 · SFX 목록)

> 정본. 브랜치 `feature/audio`. 레퍼런스=커비류 밝은 메이저 칩튠, 원칙=기승전결 없이 반복 루프.
> 트랙 9종 · SFX 소스 17곳 · SFX 큐 70개(필수 55).

## 1. OST 프롬프트 (Suno Custom 모드 · Instrumental ON)

> 레퍼런스: 커비류 밝은 메이저 칩튠. 원칙: 기승전결 없이 도는 짧은 루프를 엔진이 무한 반복.

공통 스타일 태그: `8-bit chiptune`, `NES / Famicom 2A03 soundchip`, `bright major key`, `Kirby / Nintendo-style happy`, `bouncy staccato arpeggios`, `cheerful square / pulse-wave lead`, `warm triangle-wave bass`, `tight noise-channel percussion`, `catchy melodic hook`, `upbeat competitive retro arcade`, `seamless loopable`, `constant-density ostinato groove`, `no build-up / no drop / no crescendo / no key change / no big finish`, `steady constant energy throughout`, `instrumental only, no vocals`

### MADPUMP Main Theme  ·  title/lobby (must)
- **BPM/KEY:** 150 BPM, C major, 4/4  |  **길이:** 60s
- **루프 노트:** 게임 얼굴 테마 — 오래 머무는 화면이므로 후크가 가장 분명한 take를 선별(정체성 트랙). 가장 평탄한 16마디(16x4x60/150=25.6s)만 트림, 제로크로싱 컷 + 40ms 크로스페이드. C major = 결과 복귀(victory C, countdown C)와 같은 홈 조성.

**STYLE OF MUSIC 칸:**
```
150 BPM, C major, 4/4. Bright cheerful 8-bit chiptune, NES Famicom 2A03 soundchip, Kirby-style happy title-theme energy, bouncy major-key staccato arpeggios, catchy playful square/pulse-wave lead melody with a clear hook, warm triangle-wave bass, snappy noise-channel percussion, upbeat and welcoming retro arcade lobby vibe, mid-tempo bounce, seamless loopable, constant-density ostinato groove, no intro, no outro, no build-up, no drop, no crescendo, no key change, no big finish, steady constant energy throughout, instrumental only, no vocals
```

**LYRICS 칸:**
```
[Instrumental]
[Main Loop]
Bright major-key 8-bit chiptune, bouncy arpeggios, a catchy square-lead hook over a warm triangle-bass ostinato, snappy noise hats.
16-bar loop in C major, I-V-vi-IV vamp, repeat the same 16 bars, no variation, no key change.
No intro, no outro, start on the downbeat, flat dynamics, no crescendo, no riser, no fill that signals a new section.
[Loop][Loop]
```

### Pick Your Fight  ·  game-select (must)
- **BPM/KEY:** 138 BPM, G major, 4/4  |  **길이:** 45s
- **루프 노트:** 게임선택 + 코드방 대기 + 코인 베팅 모달 공용. 로비보다 살짝 밝고(딸림조 G) 밀도 낮게 유지해 '고르는 시간'의 여백 + UI 블립 SFX와 안 겹침. 8마디=13.9s @138 트림 루프.

**STYLE OF MUSIC 칸:**
```
138 BPM, G major, 4/4. Light playful 8-bit chiptune menu loop, NES 2A03 soundchip, sparse bouncy pluck arpeggio, gentle pulse-wave lead, soft triangle bass, minimal noise hats, curious and inviting but relaxed retro-arcade waiting-room mood, low activity that leaves room for UI blip SFX, mid-tempo, seamless loopable, constant energy, no build-up, no drop, no crescendo, no key change, steady throughout, instrumental only, no vocals
```

**LYRICS 칸:**
```
[Instrumental]
[Menu Loop]
Lighter and sparser than the main theme, gentle pluck arpeggio, soft pulse lead, low density to leave headroom for click/hover UI SFX.
8-bar loop in G major, 4-chord vamp, repeat the identical 8 bars, no variation, no build.
No intro, no outro, downbeat start, flat dynamics, no riser, no impact hit.
[Loop][Loop][Loop]
```

### Battle Loop A (Speed)  ·  gameplay (must)
- **BPM/KEY:** 165 BPM, D major, 4/4  |  **길이:** 45s
- **루프 노트:** 속도형 게임 공용(연타 게이지·줄다리기·펌프 리듬·공룡 달리기·로켓 피하기). 처음부터 풀에너지, 후반 고조 금지. 리드를 두껍게 X — 정타/점프/피격 SFX 헤드룸 우선. 8마디=11.6s 트림 루프.

**STYLE OF MUSIC 칸:**
```
165 BPM, D major, 4/4. Fast energetic 8-bit chiptune battle loop, NES 2A03 soundchip, driving bouncy arpeggios, punchy square/pulse-wave lead, busy triangle-wave bassline, tight noise-channel drums, competitive exciting upbeat retro-arcade energy, relentless forward groove, thin enough to leave headroom for gameplay SFX, seamless loopable, no intro, no outro, no build-up, no drop, no crescendo, no key change, steady constant high energy from bar 1, instrumental only, no vocals
```

**LYRICS 칸:**
```
[Instrumental]
[Battle Loop]
Uptempo driving 8-bit chiptune, busy arpeggios, punchy pulse lead, active triangle bass, tight noise drums, full energy from bar 1, stays flat.
8-bar loop in D major, I-V-vi-IV vamp, repeat the identical 8 bars, no variation, no key change, no fill that marks a section.
No intro, no outro, downbeat start, flat dynamics, no crescendo, no riser.
Keep the mid and high spectrum uncluttered for hit / jump / parry SFX.
[Loop][Loop][Loop][Loop]
```

### Battle Loop B (Bouncy Duel)  ·  gameplay (nice)
- **BPM/KEY:** 150 BPM, F major, 4/4  |  **길이:** 45s
- **루프 노트:** 전략·리듬형 게임 공용(펜싱 SURGE·스피드 오목·몬스터 포격·라이트사이클·마그마 듀얼). A보다 통통 튀는 톤으로 게임 다양성 확보. MVP는 A만 배포해도 됨 — B는 톤 다양화용 nice. 8마디=12.8s 트림 루프.

**STYLE OF MUSIC 칸:**
```
150 BPM, F major, 4/4. Cheerful mid-tempo 8-bit chiptune duel loop, NES 2A03 soundchip, hoppy staccato arpeggios, playful pulse-wave lead, round triangle bass, light noise percussion, fun competitive Kirby-style brightness, buoyant bouncy groove, leaves headroom for gameplay SFX, seamless loopable, no build-up, no drop, no crescendo, no key change, steady constant energy, instrumental only, no vocals
```

**LYRICS 칸:**
```
[Instrumental]
[Battle Loop]
Bouncy cheerful 8-bit chiptune, hoppy staccato arpeggio, playful pulse lead, round triangle bass, light noise hats, buoyant but steady.
8-bar loop in F major, 4-chord vamp, repeat the identical 8 bars, no variation, no key change.
No intro, no outro, downbeat start, flat dynamics, no riser, no impact hit.
Keep it airy so placement / hit / shoot SFX cut through.
[Loop][Loop][Loop][Loop]
```

### Clutch!  ·  tense (nice)
- **BPM/KEY:** 178 BPM, D major, 4/4  |  **길이:** 32s
- **루프 노트:** 클러치 순간(HP1·링아웃 직전·오목 리치·완승선 근접)에 Battle Loop A 위에서 크로스페이드 스왑. Battle Loop A와 같은 D major → 8마디 경계 300~500ms equal-power 전환이 이질감 없음. 긴장=속도·밀도로만(단조로 어둡게 X). 8마디=10.8s.

**STYLE OF MUSIC 칸:**
```
178 BPM, D major, 4/4. Bright but urgent 8-bit chiptune tension loop, NES 2A03 soundchip, the battle theme sped up, rapid tremolo arpeggios, insistent pulse-wave lead, driving triangle bass, busy noise-channel snare, thrilling last-second comeback energy, STILL cheerful major key, NOT dark, NOT minor, tension expressed through speed and density only, seamless loopable, no build-up, no drop, no crescendo, no key change, no resolution, held-flat high tension, instrumental only, no vocals
```

**LYRICS 칸:**
```
[Instrumental]
[Tension Loop]
Urgent but still bright 8-bit chiptune, a sped-up variation of the battle loop, faster tremolo arpeggios, insistent pulse lead, driving triangle bass, busy noise snare. Major key, cheerful, NOT dark or minor.
8-bar loop in D major, repeat the identical 8 bars, no variation, no key change.
No intro, no outro, downbeat start, flat dynamics, no riser, no build that resolves - keep tension flat and looping.
[Loop][Loop][Loop][Loop]
```

### Ready? Fight!  ·  countdown (nice)
- **BPM/KEY:** 150 BPM, C major, 4/4  |  **길이:** 5s
- **루프 노트:** 카운트다운 화면 전용 원샷(루프 아님). 끝을 GO 스탭에서 깔끔히 끊어 바로 Battle Loop A/B로 전환. duration 매우 짧게 잡아 서사 생성 방지. C major = 로비/승리 패밀리.

**STYLE OF MUSIC 칸:**
```
150 BPM, C major, 4/4. Short punchy 8-bit chiptune countdown sting, NES 2A03 soundchip, three ascending bright pulse blips (3-2-1) then a confident GO chord stab, energetic Kirby-style major key, arcade match-start fanfare, one-shot, non-looping, clean hard stop on the GO hit, no fade-out, instrumental only, no vocals
```

**LYRICS 칸:**
```
[Instrumental]
[Countdown Sting]
Short 8-bit chiptune: three ascending bright pulse blips (3 - 2 - 1) then a confident GO chord stab. Major key, energetic, arcade start.
One-shot, no loop, end cleanly on the GO hit so the battle loop can start right after. No fade-out.
```

### WIN!  ·  victory (must)
- **BPM/KEY:** 150 BPM, C major, 4/4  |  **길이:** 7s
- **루프 노트:** WIN 오버레이 원샷 — 예외적으로 종지(마무리 코드) 허용(루프 아님). C major = 로비와 같은 홈 조성이라 결과→로비 복귀가 해결감 있게 이어짐. 코인 +N 팝업과 히트 동기화. 짧게 생성 후 5~7초 트림.

**STYLE OF MUSIC 칸:**
```
150 BPM, C major, 4/4. Short triumphant 8-bit chiptune victory jingle, NES 2A03 soundchip, bright rising major-arpeggio fanfare, celebratory pulse-wave lead, happy triangle bass, sparkle noise accents, joyful Kirby-style win, arcade result screen, resolves on a happy major chord, one-shot, non-looping, clean ending, no fade-out, instrumental only, no vocals
```

**LYRICS 칸:**
```
[Instrumental]
[Victory Jingle]
Short triumphant 8-bit chiptune fanfare: rising bright major arpeggio, celebratory pulse lead, sparkle accents, resolving on a happy major chord.
One-shot, no loop, hard clean ending, no fade-out. Joyful Kirby-style win.
```

### LOSE  ·  defeat (must)
- **BPM/KEY:** 132 BPM, C major -> A minor turn, 4/4  |  **길이:** 6s
- **루프 노트:** LOSE 오버레이 원샷 — 좌절 대신 '아쉽지만 귀여운' 커비류 톤(다시 하고 싶게). 어둡거나 무거운 take는 폐기. 코인 -N 팝업과 동기화. victory/draw와 같은 세션에서 연속 생성해 음색 패밀리 통일.

**STYLE OF MUSIC 칸:**
```
132 BPM, C major turning to A minor, 4/4. Short gentle 8-bit chiptune defeat jingle, NES 2A03 soundchip, soft descending square-wave arpeggio, mellow pulse-wave lead, light triangle bass, a cute playful wah-wah loss cadence, encouraging and light, NOT grim, NOT dark, resolves on a soft chord, one-shot, non-looping, clean ending, no long fade, instrumental only, no vocals
```

**LYRICS 칸:**
```
[Instrumental]
[Defeat Jingle]
Short soft 8-bit chiptune: gentle descending arpeggio, mellow pulse lead, a cute playful wah-wah loss cadence - light and encouraging, NOT grim or dark.
One-shot, no loop, clean ending resolving on a soft chord. Makes you want to rematch.
```

### DRAW  ·  draw (must)
- **BPM/KEY:** 140 BPM, C major (suspended, unresolved end), 4/4  |  **길이:** 5s
- **루프 노트:** DRAW 오버레이 원샷 — 승도 패도 아닌 중립감을 두 음 왕복 모티프 + sus 미해결로 표현. 코인 정산 0 표시와 동기. victory/defeat와 같은 세션·음색으로 뽑아 3종이 한 세트로 들리게(3~5초).

**STYLE OF MUSIC 칸:**
```
140 BPM, C major with a suspended unresolved end, 4/4. Short neutral playful 8-bit chiptune draw jingle, NES 2A03 soundchip, a bouncy back-and-forth two-note square motif, plain pulse-wave tone, minimal triangle bass, cheeky arcade tie feel, non-committal and light, ends unresolved on a suspended chord, one-shot, non-looping, clean hard stop, no fade-out, instrumental only, no vocals
```

**LYRICS 칸:**
```
[Instrumental]
[Draw Jingle]
Short neutral 8-bit chiptune: a bouncy back-and-forth two-note motif, plain pulse tone, light and cheeky, ending unresolved on a suspended chord to say 'tie'.
One-shot, no loop, short clean hard stop, no fade-out.
```

## 2. 루프 매뉴얼 (기승전결 없이 뽑기)

### 루핑 기법
- 짧은 duration으로 서사를 굶긴다: 루프 소스는 30~60초로만 생성. 길게 뽑을수록 Suno가 인트로→빌드→브리지→아웃트로를 끼워 기승전결이 생긴다. 반복은 곡이 아니라 게임 엔진이 담당한다.
- 가사칸을 [Instrumental] + 동일-반복 구조 태그로 고정: [Verse]/[Chorus]/[Bridge]/[Drop]/[Build]/[Intro]/[Outro]를 절대 쓰지 말고 [Main Loop]/[Battle Loop]/[Loop][Loop]만 사용. 가사 한 줄도 넣지 않아 절 구성이 생길 여지를 없앤다.
- 스타일 문자열에 부정어 스택을 상수처럼 박는다: 'no build-up, no drop, no crescendo, no breakdown, no key change, no big finish, no riser, no impact hit, flat dynamics, steady energy throughout'. 이 스택이 Suno의 드라마 본능을 가장 효과적으로 누른다.
- 오스티나토 + 짧은 순환 코드 vamp를 명시한다: 'looping triangle-bass ostinato', 'repeating arpeggio riff', '8-bar loop, I–V–vi–IV vamp, repeat identical'. 종지(딸림7 해결·마무리 코드)를 요청하지 않아 계속 돈다.
- 정수 BPM + 4/4를 명시해 마디 트림을 계산한다: 1마디(초)=60/BPM×4. 예) 150 BPM → 1마디 1.6s, 16마디 25.6s. 이 지점을 기준으로 다운비트끼리 잘라 루프 경계가 항상 박에 떨어지게 한다.
- 리롤 후 '가장 평평한' take만 채택한다: 같은 프롬프트로 3~5개 생성해 심벌 크래시·리타르단도·페이드아웃·후반 빌드가 없는(끝까지 에너지 평탄) take만 남기고 나머지는 폐기.
- 제로크로싱 컷 + 20~80ms equal-power 크로스페이드로 심리스화: 생성물의 인트로 페이드인/엔딩을 잘라내고, 가장 잘 도는 8/16마디만 트림해 이음새를 겹쳐 클릭음을 없앤다.
- 최종 방어선은 코드단이다: Web Audio AudioBufferSourceNode.loop=true + loopStart/loopEnd를 실제 마디 시작 샘플에 정렬. Suno가 완벽 심리스를 못 줘도 브라우저에서 gapless로 돈다(HTML5 <audio> loop는 갭이 도드라지니 지양).
- A / A2 미세 변주로 지루함만 제거한다: 4~8마디마다 아르페지오 옥타브나 카운터-하모니만 살짝 바꾸되 코드 진행·밀도·에너지는 동일 유지 → 루프감은 살고 빌드업은 안 생긴다.
- 조성 패밀리 + 라우드니스 정합으로 전환을 매끄럽게: gameplay A·tense·countdown·victory를 인접/동일 조성으로 묶고 전 루프를 같은 목표 LUFS(약 -14)로 노멀라이즈. 게임 중 gameplay↔tense는 8마디 경계에서 300~500ms equal-power 크로스페이드로 스왑.
- 원샷 징글은 반대로 짧게(3~8초) + 'one-shot, no loop, hard stop, no fade-out'을 명시해 결과 오버레이의 코인 정산 애니메이션과 프레임 단위로 정렬한다.

### Suno 실전 워크플로
1. Suno는 반드시 Custom 모드. 'Style of Music' 칸에 각 트랙 stylePrompt를 통째로 붙이고, 'Lyrics' 칸에 promptBox([Instrumental] + 구조태그 + 서술)를 붙인다. 'Instrumental' 토글을 반드시 ON(보컬 원천 차단).
2. v4.5 권장. Advanced에서 Weirdness는 낮게(10~25%), Style Influence는 높게(70~90%)로 잡아 칩튠 정체성이 흔들리지 않고 스타일 문자열을 강하게 따르게 한다.
3. 곡 길이는 짧게(루프 45~60s, 징글 5~8s)로 설정하고, 한 트랙당 3~5회 생성한다. 부정어를 넣어도 take마다 편차가 있으므로 반드시 복수 생성.
4. 오디션 → 폐기 기준: 심벌 크래시·리타르단도·페이드아웃으로 끝나거나 후반에 빌드/전조가 생기는 take는 즉시 버리고, 끝까지 에너지가 평탄한 '가장 loop스러운' take만 채택. 징글은 반대로 마무리 코드로 딱 끊기는 take 채택.
5. DAW(Reaper/Audacity 등)로 반입해 가장 평탄한 8/16마디를 찾는다. 트림 길이 = 60/BPM x 4 x 마디수 초에 스냅(예: 150BPM 16마디=25.6s). 앞뒤 페이드/인트로를 잘라내고 다운비트끼리 위상 정렬, 컷은 제로크로싱에서.
6. 루프 이음새에 20~80ms equal-power 크로스페이드를 걸어 클릭음 제거. gapless OGG/AAC로 인코딩(웹 배포용).
7. 전 루프를 같은 목표 LUFS(약 -14)로 노멀라이즈해 화면 전환 시 볼륨 튐 방지. victory/defeat/draw 3종은 같은 세션에서 연속 생성해 음색·레벨을 맞춘다.
8. 게임 엔진에 심는다: 루프는 Web Audio AudioBufferSourceNode.loop=true + loopStart/loopEnd를 실제 마디 시작 샘플에 정렬(Suno가 완벽 심리스를 못 줘도 gapless 보장). 징글은 loop=false 원샷으로 재생하며 코인 +N/-N/0 애니메이션과 프레임 정렬.
9. 인컨텍스트 검증: gameplay A -> Clutch tense 크로스페이드(8마디 경계, 300~500ms), 결과 -> 로비 복귀(victory C -> lobby C)를 실제로 들어보고 레벨/조성 이질감을 조정한다.

### 함정 & 회피
- Suno가 습관적으로 붙이는 인트로 페이드인 + 리타르단도/페이드아웃 엔딩 → 그대로 쓰면 루프 불가. 반드시 앞뒤를 트림하고 마디 경계 크로스페이드로 심리스화할 것.
- 긴 duration은 후반부에 브리지·전조·빌드업(=기승전결)을 부른다. 소스는 짧게(30~60s) 뽑고 반복은 엔진이 담당 — 통곡 재생 금지.
- 부정어 스택('no build-up' 등)만으로는 100% 안 막힌다. take마다 편차가 있으니 반드시 3~5회 리롤 후 '가장 평평한' take 선별 + 트림으로 이중 방어.
- tense를 단조(minor)나 어둡게 처리하면 밝은 커비 정체성이 깨진다. 긴장은 BPM·아르페지오 밀도·트레몰로로만 표현하고 메이저키 유지('still cheerful, not dark')를 프롬프트에 못 박을 것.
- 인게임 루프의 중고역을 리드·드럼으로 꽉 채우면 정타/피격/링아웃/점프/착수 SFX가 묻힌다. gameplay/tense 루프는 얇게 유지해 SFX 헤드룸을 비워둘 것.
- 레퍼런스 곡명('Kirby's Return to Dream Land...')을 프롬프트에 직접 쓰면 저작권 리스크 + 스타일 오염. 곡명 대신 음색 서술('Kirby-style bright NES chiptune, bouncy arpeggios')로 대체.
- 브라우저 gapless 함정: HTML5 <audio>의 loop는 루프 갭이 도드라진다. 반드시 Web Audio AudioBufferSourceNode.loop + loopStart/loopEnd(마디 샘플 정렬)로 재생할 것.
- 심벌 크래시·big-finish로 끝나는 '피날레형' take는 아무리 멜로디가 좋아도 루프 불가 — 미련 없이 폐기.
- 트랙 간 조성/LUFS 불일치는 화면 전환을 튀게 만든다. C(로비/승리/카운트다운)·G(선택)·D(gameplay A/tense)·F(gameplay B) 패밀리로 설계하고 라우드니스를 통일할 것.
- 'Instrumental' 토글을 켜도 가끔 보컬 애드립이 샌다. 새면 미련 없이 재생성. 스타일 문자열에 'instrumental only, no vocals, no vocal chops'를 항상 유지.
- victory/defeat/draw를 서로 다른 세션에서 따로 뽑으면 음색이 안 맞아 '한 세트'로 안 들린다. 반드시 같은 세션·같은 음색 패밀리로 연속 생성.
- 'chiptune 순도'를 지키려면 'orchestral', 'lo-fi', 'synthwave', 'cinematic' 같은 단어를 스타일에 절대 넣지 말 것(음색 오염). 음원 채널(square/pulse/triangle/noise)을 구체적으로 나열하는 게 정체성 유지에 유리.

## 3. SFX · 칩튠 소스

| 소스 | 유형 | 비용 | 칩튠적합 | 크레딧 | 라이선스 | 최적용도 |
|---|---|---|---|---|---|---|
| [jsfxr (sfxr.me)](https://sfxr.me/) | generator | free | high | 무크레딧 | MIT (tool, by chr15m); generated .wav is yours to use commercially | 가장 빠른 웹 8bit SFX 제작. 연타/게이지업/정타-오타/점프/피격/격추/착수/링아웃 등 코어 액션별 원샷을 프리셋(Pickup, Laser, Explosion, Hit, Jump, Blip)으로 즉석 생성·다운로드. JSON 파라미터로 재현/버전관리 가능. |
| [Bfxr](https://www.bfxr.net/) | generator | free | high | 무크레딧 | 오픈소스(sfxr 기반, by increpare); 생성음은 로열티프리로 상업 사용 가능 | sfxr보다 파형/필터/믹서가 풍부해 넉백 펜싱의 패링·리포스트, 대포 발사, 로켓 탄막 같은 '레이어 있는' SFX를 정교하게. 웹/데스크톱 둘 다. |
| [ChipTone (SFBGames)](https://sfbgames.itch.io/chiptone) | generator | free | high | 무크레딧 | 무료 웹 툴; 생성 사운드는 상업 포함 자유 사용 | 브라우저에서 시각적 파형 편집 + 아르페지오/슬라이드로 커비류 밝은 톤의 UI 블립·코인 정산·WIN/LOSE 스팅어 만들기에 최적. 결과물 즉시 wav export. |
| [rFXGen (raylib / raysan5)](https://raylibtech.itch.io/rfxgen) | generator | freemium | high | 무크레딧 | 오픈소스; 웹/데스크톱 무료, 생성 .wav는 사용자 소유 | sfxr 파생 중 가장 개발친화적. .rfx 파라미터 저장으로 10종 게임의 SFX 세트를 일괄 관리·재생성. 배치 export로 canvas 게임에 바로 번들. |
| [jfxr](https://jfxr.frozenfractal.com/) | generator | free | high | 무크레딧 | 오픈소스 웹 툴; 생성음 자유 사용 | sfxr 계열 대안 웹 생성기. 슬라이더 세밀 조정으로 줄다리기 당김 틱, 오목 커서 이동 블립 등 미세 톤 차이가 필요한 반복 SFX에. |
| [BeepBox](https://www.beepbox.co/) | generator | free | high | 무크레딧 | MIT(오픈소스); 만든 곡은 사용자 소유, 상업 사용 가능 | 레퍼런스(커비 8bit)식 밝은 메이저키 루프 BGM을 브라우저에서 직접 작곡. 기승전결 없이 4~8마디 loop를 만들어 무한 반복 → 로비/인게임 배경음. wav/mp3 export. |
| [Bosca Ceoil (Blue)](https://boscaceoil.net/) | generator | free | high | 무크레딧 | 무료/오픈소스(Terry Cavanagh); 제작 곡은 사용자 소유 | 초보 친화 칩튠 작곡. 짧은 승리/카운트다운 징글과 통통 튀는 루프 BGM 스케치. wav/mid export로 이후 다른 툴에서 다듬기 좋음. |
| [FamiStudio](https://famistudio.org/) | generator | free | high | 무크레딧 | 오픈소스(무료); 제작 곡 사용자 소유 | NES 사운드칩 정통 재현. Nintendo/커비류 톤을 가장 authentic하게 뽑고 싶을 때. 루프 포인트 지정으로 이음매 없는 배경 loop 제작, wav/nsf export. |
| [Kenney.nl (Audio packs)](https://kenney.nl/assets/category:Audio) | asset-pack | free | high | 무크레딧 | CC0 (퍼블릭 도메인) | 즉시 쓸 수 있는 완제 SFX 팩(Digital Audio, Interface Sounds, UI Audio, Music Jingles, Impact). CC0라 크레딧 불필요 — 로비 버튼/코인/베팅 모달/결과 오버레이 UI 사운드를 빠르게 채우기에 최고의 baseline. |
| [OpenGameArt.org (OGA)](https://opengameart.org/content/audio-cc0-8bit-chiptune) | library | free | high | 필요 | 혼합(CC0 / CC-BY / CC-BY-SA / GPL) — 항목별 상이, 필터 필수 | 'CC0 8bit/Chiptune' 큐레이션 컬렉션이 있어 레트로 SFX·루프 음악을 대량 확보. CC0만 필터링하면 무크레딧 사용 가능. 각 항목 라이선스 개별 확인 필요. |
| [Freesound.org](https://freesound.org/) | library | freemium | med | 필요 | 항목별 CC0 / CC-BY(4.0) / CC-BY-NC / Sampling+ 혼합 | 방대한 커뮤니티 사운드 DB. '8bit', 'chiptune', 'arcade', 'coin' 검색 + 라이선스 필터로 특정 액션음 원소스 확보. CC-BY 다수라 상업 배포 시 크레딧 관리 필요. |
| [Pixabay (Sound Effects)](https://pixabay.com/sound-effects/) | library | free | med | 무크레딧 | Pixabay Content License — 상업 사용 OK, 무크레딧 (원본 재판매/스톡 재배포만 금지) | 라이선스가 단순·안전해 리스크 없이 UI/임팩트 SFX와 짧은 배경음 확보. 8bit 전용 폭은 좁아 UI·범용 효과음 보강용으로 적합. |
| [Mixkit (Sound Effects)](https://mixkit.co/free-sound-effects/) | library | free | low | 무크레딧 | Mixkit License — 상업 사용 OK, 무크레딧 (사운드 단독 재배포/스톡화 금지) | 게임 UI/win·lose/whoosh/impact 등 깔끔한 범용 SFX. 칩튠 전용은 아니지만 결과 오버레이·전환음의 '광택' 보강에 무크레딧으로 안전. |
| [ZapSplat](https://www.zapsplat.com/) | library | freemium | med | 필요 | 무료 = 크레딧 필요, Gold(유료) = 무크레딧; 상업 사용 허용 | 대형 SFX 라이브러리에 'retro/8-bit/arcade game' 카테고리 보유. 무료 티어는 크레딧 표기 조건. 다양한 게임 액션음을 폭넓게 커버. |
| [itch.io (Game assets / Audio)](https://itch.io/game-assets/tag-chiptune) | marketplace | freemium | high | 필요 | 판매자별 상이(무료 pay-what-you-want ~ 유료, 상업 라이선스 다수) — 팩별 확인 | 인디 칩튠 SFX/BGM 팩의 최대 산지. 'chiptune', '8-bit sfx' 태그로 게임 톤에 맞춘 완제 루프·SFX 번들 구매/무료 확보. 팩마다 라이선스·크레딧 조건 개별 확인. |
| [GameDev Market](https://www.gamedevmarket.net/category/audio/) | marketplace | paid | med | 무크레딧 | 구매 시 로열티프리 상업 라이선스(Pro/Standard) — 재배포 금지 | 품질 검수된 게임 오디오 팩(레트로/칩튠 포함) 구매. 로열티프리라 정산·베팅·매치 SFX 세트를 크레딧 없이 상업 배포. 유료지만 라이선스 명확. |
| [Unity Asset Store (Audio)](https://assetstore.unity.com/audio) | marketplace | freemium | med | 무크레딧 | Unity Asset Store EULA(에셋별 Standard/Extended) — 상업 사용 허용, 재판매 금지 | 무료/유료 8bit·arcade 오디오 팩 다수. React canvas 프로젝트여도 wav 에셋만 추출해 사용 가능(EULA는 배포 형태 확인). 대량 SFX 세트 확보용. |

**노트:**
- 핵심 강조: sfxr 계열 웹 '생성기'(jsfxr/sfxr.me, Bfxr, ChipTone, rFXGen, jfxr)가 이 프로젝트에 가장 적합. 링크 썩음 없이 브라우저에서 즉시 8bit 원샷을 뽑고, 생성 결과물은 로열티프리라 라이선스 리스크가 사실상 0. 10종 게임의 코어 액션(연타/게이지업/정타·오타/점프·숙이기/피격/격추/링아웃/착수/줄다리기 틱)마다 프리셋으로 SFX 세트를 만드는 것을 1순위로 권장.
- 루프 BGM(레퍼런스=Kirby Return to Dream Land 8bit) 제작은 BeepBox 또는 FamiStudio가 최적. 요구대로 기승전결 없이 4~8마디 밝은 메이저키 loop를 만들고 '루프 포인트'를 지정해 이음매 없이 무한 반복. Bosca Ceoil은 초보 친화 스케치용.
- 라이선스 안전도 순위(무크레딧 상업 사용 관점): CC0/생성기 출력 > Kenney(CC0) > Pixabay/Mixkit(자체 라이선스, 무크레딧) > GameDev Market/Unity(로열티프리 유료) > Freesound/OGA/ZapSplat(항목별 CC-BY 다수 → 크레딧 관리 필요) > itch.io(팩별 상이).
- attributionRequired=true로 표시한 소스(OGA, Freesound, ZapSplat, itch.io)는 '항목/판매자별로 다름'이라는 의미. CC0 항목만 필터링하면 무크레딧 사용 가능하지만, 상업 배포 전 개별 라이선스 재확인 필수. CC-BY를 쓸 경우 크레딧 파일을 프로젝트에 유지할 것.
- 실전 파이프라인 제안: (1) UI/시스템 SFX = Kenney CC0 팩으로 baseline → (2) 게임별 코어 액션 SFX = jsfxr/Bfxr/ChipTone로 커스텀 생성 → (3) 로비·인게임 루프 BGM = BeepBox/FamiStudio 자작 → (4) 부족분만 Freesound/OGA에서 CC0 위주로 보충. 이 조합이 라이선스 리스크 최소 + 톤 일관성 최대.
- 주의(나쁜 fallback 방지): 검증되지 않은 다운로드 URL이나 임의의 딥링크는 지어내지 않았고, 각 소스는 널리 알려진 공식 도메인 랜딩/카테고리 페이지로 연결. 개별 애셋 파일 URL은 라이선스가 항목마다 달라 반드시 해당 페이지에서 직접 확인해야 함.
- Unity Asset Store 에셋은 EULA상 'Unity 프로젝트 내 사용'을 전제로 하는 경우가 있어, 순수 React canvas 웹 프로젝트에서 wav만 추출해 쓸 때는 각 에셋의 배포 조건을 반드시 확인할 것(Standard vs Extended).

## 4. 만들어야 할 SFX (큐마다 후보 3개+)

### UI · 내비게이션 (11)

#### `ui-hover` — 버튼 호버 [must]
- 트리거: 메뉴/버튼에 포커스·마우스 오버될 때
- 음색: 아주 짧은 8bit 블립, 부드럽고 밝은 사인톤
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool; 생성 .wav는 상업 사용 자유, 무크레딧)
    - locator: jsfxr: 'Blip/Select' 프리셋 클릭 → Wave를 Sine으로 변경 → Attack Time 0, Sustain Time ~0.02~0.03s, Decay Time ~0.05s로 아주 짧게 → Start Frequency 중고음(~0.5~0.6) → Sustain Punch 0 → Export .wav. 부드럽고 밝은 초단 블립.
    - why: 호버는 '아주 짧은 사인톤 블립'이 핵심 — Blip/Select 프리셋을 sine으로 바꾸면 정확히 그 톤. 링크 썩음 없이 재현·버전관리 가능.
  - **[Kenney.nl (Interface Sounds / UI Audio pack) · download-link]** (CC0 (퍼블릭 도메인), 무크레딧)
    - locator: https://kenney.nl/assets/interface-sounds — 팩 내 'click' / 'select' / 'tick' 계열 짧은 파일(예: select_00x.ogg) 중 가장 짧은 톤 사용
    - why: 완제 UI 팩이라 즉시 사용 가능. 짧은 select/tick 톤이 호버 블립으로 바로 적합. CC0라 라이선스 리스크 0.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0만 필터링하면 무크레딧, CC-BY면 크레딧 필요)
    - locator: freesound.org: '8bit blip' 또는 'menu hover 8bit' 검색 → License 필터를 Creative Commons 0로 설정 → duration < 0.5s 정렬
    - why: 커뮤니티 원소스에서 실제 8bit 호버 블립 확보 가능. CC0 필터로 안전하게.
  - **[jfxr · jsfxr-preset]** (오픈소스 웹 툴; 생성음 자유 사용)
    - locator: jfxr: 'Blip' 템플릿 → Waveform sine → Sustain 20ms, Decay 40ms → Frequency 800~1000Hz → Frequency slide 0 → Export. sfxr 대안으로 미세 톤 조정.
    - why: sfxr 계열 대안. 슬라이더가 세밀해 호버용 초단 톤을 미묘하게 다르게 여러 개 뽑기 좋음.

#### `ui-click` — 버튼 클릭/선택 [must]
- 트리거: 버튼·게임카드 클릭 시
- 음색: 짧고 통통 튀는 팝(pop), 경쾌한 스퀘어파형
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool; 생성 .wav 상업 사용 자유, 무크레딧)
    - locator: jsfxr: 'Blip/Select' 프리셋 → Wave를 Square 유지 → Sustain Punch ~0.2~0.3 추가로 '톡' 튀는 어택 → Decay Time ~0.08s → Start Frequency 중음 → 살짝 Frequency Slide 음수(짧은 하강)로 '팝' 느낌 → Export .wav
    - why: '짧고 통통 튀는 팝, 경쾌한 스퀘어파형'이 요구 — Blip/Select의 square + punch가 정확히 그 결과. 재현 가능.
  - **[Kenney.nl (Interface Sounds pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/interface-sounds — 'click_00x' 계열 파일 사용
    - why: click 전용 파일이 팩에 다수 포함 — 버튼 클릭에 그대로. CC0라 즉시 상업 사용.
  - **[Pixabay (Sound Effects) · search-query]** (Pixabay Content License — 상업 OK, 무크레딧)
    - locator: https://pixabay.com/sound-effects/search/8bit%20click/ — '8bit click' 또는 'game click pop' 검색
    - why: 라이선스가 단순·안전. 8bit click/pop UI 음을 리스크 없이 확보하는 보강 옵션.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴; 생성음 상업 포함 자유 사용)
    - locator: ChipTone: Shape=Square, 짧은 Punch envelope, Pitch를 살짝 상→하 슬라이드로 'pop' 형성, Length 최소 → wav export
    - why: 시각적 파형 편집으로 통통 튀는 pop을 정밀하게 다듬을 수 있어 커비류 밝은 톤 유지에 유리.

#### `ui-confirm` — 확정/진행 [must]
- 트리거: 확인·다음·확정 버튼으로 다음 단계 진입
- 음색: 상승하는 2음 아르페지오, 긍정적 메이저
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool; 상업 사용 자유, 무크레딧)
    - locator: jsfxr: 'Pickup/Coin' 프리셋 클릭 → 이 프리셋은 기본이 '띵-↑' 상승 2음(pitch jump) 구조라 '상승하는 2음 아르페지오, 긍정적 메이저'에 거의 완벽 → Wave Square 유지, Change Amount(피치 점프) 양수 확인 → Export .wav
    - why: Pickup/Coin 프리셋이 원래 상승 2음 구조 — confirm의 '상승 2음 메이저'와 의미가 정확히 일치. 가장 신뢰도 높은 재현 레시피.
  - **[Bosca Ceoil (Blue) · generator-recipe]** (무료/오픈소스; 제작 곡 사용자 소유, 상업 사용 가능)
    - locator: Bosca Ceoil: 8bit 스퀘어 악기로 2음(예: C→G 또는 C→E) 짧은 상승 아르페지오 배치 → 짧은 징글로 wav export
    - why: 확정음을 메이저 음정으로 직접 지정 가능 — 커비풍 긍정 톤을 의도대로 튜닝.
  - **[Kenney.nl (Music Jingles / Interface Sounds) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/music-jingles — 짧은 positive/confirm 계열 징글 또는 interface-sounds의 confirmation 파일
    - why: 완제 confirm 징글을 즉시 사용. CC0로 안전한 baseline.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 필터 시 무크레딧)
    - locator: freesound.org: '8bit confirm' 또는 'arcade positive select' 검색 → CC0 필터 → 상승 2음 톤 선별
    - why: 실제 상승형 confirm 원소스 확보. CC0만 골라 리스크 제거.

#### `ui-cancel-back` — 취소/뒤로가기 [must]
- 트리거: 취소·뒤로·모달 닫기 없이 이탈
- 음색: 하강하는 2음, 부드럽고 살짝 낮은 블립
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool; 상업 사용 자유, 무크레딧)
    - locator: jsfxr: 'Pickup/Coin' 프리셋 → Change Amount(피치 점프)를 음수로 뒤집어 '↓ 하강 2음'으로 → Start Frequency를 조금 낮춤 → Wave Square 또는 Sine으로 부드럽게 → Export .wav. 또는 'Blip' 프리셋 + Frequency Slide 음수.
    - why: '하강하는 2음, 부드럽고 살짝 낮은 블립' — Pickup의 피치 점프를 음수로 반전하면 confirm의 정확한 반대 소리. confirm과 짝을 이뤄 일관성 확보.
  - **[jfxr · generator-recipe]** (오픈소스; 생성음 자유 사용)
    - locator: jfxr: 'Blip' 템플릿 → Frequency를 중음에서 시작 → Frequency slide 음수(하강) → Sine/Triangle으로 부드럽게 → 짧은 Decay → Export
    - why: 하강 블립을 슬라이더로 미세 조정. 살짝 낮은 톤을 정밀하게.
  - **[Kenney.nl (Interface Sounds pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/interface-sounds — 'back' / 'close' / 'minimize' 계열 하강 톤 파일 사용
    - why: back/close 전용 하강 UI 톤이 팩에 포함 — 취소/뒤로에 그대로. CC0 안전.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 필터 시 무크레딧)
    - locator: freesound.org: '8bit back' 또는 'menu cancel retro' 검색 → CC0 필터 → 하강 2음 선별
    - why: 실제 하강형 cancel 원소스 확보용 대안.

#### `ui-toggle` — 토글 전환 [nice]
- 트리거: 옵션·사운드 온오프 등 토글 상태 변경
- 음색: 딱 떨어지는 스위치형 클릭 2종(온/오프 톤차)
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool; 상업 사용 자유, 무크레딧)
    - locator: jsfxr: 'Blip/Select' 프리셋으로 2개 생성 — (ON) Start Frequency 약간 높게 + Square, (OFF) Start Frequency 약간 낮게 동일 파라미터 → 딱 떨어지는 초단 클릭 2종. Sustain/Decay 최소, Slide 0으로 '스위치' 느낌 유지 → 각각 Export.
    - why: '온/오프 톤차가 있는 스위치형 클릭 2종'이 요구 — 같은 프리셋에서 주파수만 위/아래로 2개 뽑으면 정확히 한 쌍. 톤 일관성 보장.
  - **[Kenney.nl (Interface Sounds pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/interface-sounds — 'switch' / 'toggle' / 'tick' 계열 파일 2개(높낮이 다른 것) 페어링
    - why: switch/toggle 톤이 팩에 존재 — 온/오프 페어로 바로 매핑. CC0 안전.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 필터 시 무크레딧)
    - locator: freesound.org: 'toggle switch 8bit' 또는 'ui switch on off' 검색 → CC0 필터 → 톤차 나는 페어 선별
    - why: 실제 스위치 온/오프 원소스 확보. nice 우선순위라 라이브러리 픽으로 충분.

#### `ui-tab-switch` — 탭/카테고리 이동 [nice]
- 트리거: 로비 탭·게임목록 카테고리 전환
- 음색: 가벼운 슬라이드 블립, 좌우 팬 느낌
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool; 상업 사용 자유, 무크레딧)
    - locator: jsfxr: 'Blip/Select' 프리셋 → Frequency Slide를 짧은 양수(살짝 상승 슬라이드)로 '슬라이드 블립' → Decay 매우 짧게 → 좌우 팬은 생성기 밖(웹오디오 stereo pan)에서 탭 방향에 따라 L/R로 적용 → Export mono .wav
    - why: '가벼운 슬라이드 블립'이 핵심 — Blip + 짧은 frequency slide로 재현. 좌우 팬은 코드단 stereo pan으로 처리하는 게 정석.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴; 상업 포함 자유 사용)
    - locator: ChipTone: Shape=Triangle/Square, 짧은 Pitch slide up, Length 짧게 → 가벼운 whoosh-blip → wav export
    - why: 슬라이드/아르페지오 툴이 있어 가벼운 팬 느낌 블립을 시각적으로 다듬기 좋음.
  - **[Kenney.nl (Interface Sounds pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/interface-sounds — 'tick' / 'select' / 'scroll' 계열 가벼운 짧은 톤
    - why: 탭 이동용 가벼운 tick/scroll 톤을 즉시 확보. CC0 안전, nice 우선순위에 충분.

#### `ui-modal-open` — 모달 열림 [must]
- 트리거: 코인 베팅·코드입력 등 모달 등장
- 음색: 부풀어 오르는 짧은 스윕업, 통통한 어택
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool; 상업 사용 자유, 무크레딧)
    - locator: jsfxr: 'Powerup' 프리셋 클릭 → 기본이 '부풀어 오르는 상승 스윕'이라 modal-open에 적합 → Attack 살짝, Sustain 짧게, Frequency Slide 양수(상승) 유지 → Length 0.15~0.25s로 짧게 → Sustain Punch로 통통한 어택 → Export .wav
    - why: '부풀어 오르는 짧은 스윕업, 통통한 어택'이 요구 — Powerup 프리셋의 상승 스윕이 정확히 그 형태. must 우선순위 핵심.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리 상업 사용 가능, 무크레딧)
    - locator: Bfxr: Powerup 계열 생성 후 필터/믹서로 스윕업 레이어 보강 → 상승 pitch + 짧은 통통 어택 → wav export
    - why: sfxr보다 필터/레이어가 풍부해 부풀어 오르는 스윕을 더 통통하게 다듬을 수 있음.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 필터 시 무크레딧)
    - locator: freesound.org: 'ui swipe up' 또는 'menu open whoosh 8bit' 또는 'popup open' 검색 → CC0 필터 → 짧은 상승 스윕 선별
    - why: 실제 modal open 스윕업 원소스 확보. CC0만 골라 안전.
  - **[Mixkit (Sound Effects) · search-query]** (Mixkit License — 상업 OK, 무크레딧 (단독 재배포 금지))
    - locator: mixkit.co/free-sound-effects/: 'pop up' / 'interface swipe' / 'whoosh' 검색 → 짧은 상승 전환음
    - why: 깔끔한 범용 whoosh/pop-up으로 modal open의 광택을 무크레딧으로 보강.

#### `ui-modal-close` — 모달 닫힘 [must]
- 트리거: 모달 닫힐 때
- 음색: 짧게 수축하는 스윕다운
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool; 상업 사용 자유, 무크레딧)
    - locator: jsfxr: 'Powerup' 프리셋 생성 후 Frequency Slide를 음수(하강)로 뒤집어 '수축하는 스윕다운' → Length 짧게(0.12~0.2s) → Sustain 짧게 → Export .wav. modal-open과 짝을 이루도록 동일 톤에서 슬라이드만 반전.
    - why: '짧게 수축하는 스윕다운' — open의 상승 스윕을 슬라이드 음수로 반전하면 정확한 대칭 사운드. open/close 톤 일관성 확보.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리 상업 사용, 무크레딧)
    - locator: Bfxr: 하강 pitch slide로 스윕다운 생성 → 짧은 decay → wav export
    - why: 스윕다운을 필터로 부드럽게 수축시켜 닫힘 느낌을 정교화.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 필터 시 무크레딧)
    - locator: freesound.org: 'ui swipe down' 또는 'menu close 8bit' 또는 'popup close' 검색 → CC0 필터 → 짧은 하강 스윕 선별
    - why: 실제 modal close 스윕다운 원소스 확보용. CC0 안전.
  - **[Kenney.nl (Interface Sounds pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/interface-sounds — 'close' / 'minimize' 계열 하강 톤
    - why: close 전용 하강 UI 톤 즉시 사용. CC0 baseline.

#### `ui-login-success` — 구글 로그인 성공 [must]
- 트리거: 로그인 완료 후 로비 진입
- 음색: 밝고 화사한 3~4음 팡파르 미니, 커비풍 메이저
- 후보:
  - **[Bosca Ceoil (Blue) · generator-recipe]** (무료/오픈소스; 제작 곡 사용자 소유, 상업 사용 가능)
    - locator: Bosca Ceoil: 8bit 스퀘어 리드로 밝은 메이저 3~4음 상승 아르페지오(예: C-E-G-C 또는 C-G-C 팡파르) 짧게 배치 → 커비풍 통통한 리듬 → wav export
    - why: '밝고 화사한 3~4음 팡파르, 커비풍 메이저'는 음정을 직접 지정해야 원하는 멜로디가 나옴 — 작곡 툴로 의도대로 만드는 게 최선. 레퍼런스 톤과 직결.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리 상업 사용, 무크레딧)
    - locator: Bfxr: 'Powerup' 계열 여러 번 생성해 상승 아르페지오형 팡파르 후보 확보, 또는 여러 Blip을 시퀀스로 배치 → 밝은 메이저 상승 → wav export
    - why: Powerup류에서 상승 팡파르 느낌을 빠르게 뽑아 로그인 성공 스팅어로. 생성기 레시피로 링크 리스크 없음.
  - **[Kenney.nl (Music Jingles pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/music-jingles — 밝은 'win' / 'positive' / 'level up' 계열 짧은 징글 사용
    - why: 완제 승리/긍정 징글을 로그인 성공 팡파르로 즉시 사용. CC0 안전 baseline.
  - **[OpenGameArt.org (OGA) · search-query]** (혼합 — CC0 필터 시 무크레딧 (항목별 확인 필수))
    - locator: opengameart.org: 'fanfare 8bit' 또는 'level up chiptune' 검색 → License를 CC0로 필터 → 밝은 메이저 팡파르 선별
    - why: 칩튠 팡파르 원소스가 다수. CC0만 골라 로그인 성공음으로 안전하게.

#### `ui-landing-appear` — 랜딩 등장/로그아웃 [nice]
- 트리거: 랜딩 화면 진입 또는 로그아웃 복귀
- 음색: 부드럽게 반짝이는 웰컴 차임
- 후보:
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴; 상업 포함 자유 사용)
    - locator: ChipTone: Shape=Sine/Triangle, 아르페지오(arp) 기능으로 밝은 메이저 반짝임 부여 + 살짝 vibrato → 부드러운 어택/긴 릴리즈로 '차임' 느낌 → wav export
    - why: '부드럽게 반짝이는 웰컴 차임'은 아르페지오+부드러운 엔벨로프가 핵심 — ChipTone의 arp/시각 편집으로 정확히 구현.
  - **[Bosca Ceoil (Blue) · generator-recipe]** (무료/오픈소스; 제작 곡 사용자 소유, 상업 사용 가능)
    - locator: Bosca Ceoil: 벨/차임류 음색으로 짧은 상승 반짝임 3~4음 배치 → 부드러운 웰컴 차임 → wav export
    - why: 차임 멜로디를 직접 지정. 랜딩 등장의 밝은 무드를 의도대로.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 필터 시 무크레딧)
    - locator: freesound.org: 'welcome chime 8bit' 또는 'sparkle chime retro' 검색 → CC0 필터 → 부드러운 반짝 차임 선별
    - why: 실제 반짝 차임 원소스 확보. nice 우선순위라 라이브러리 픽으로 충분.
  - **[Pixabay (Sound Effects) · search-query]** (Pixabay Content License — 상업 OK, 무크레딧)
    - locator: https://pixabay.com/sound-effects/search/chime/ — 'chime' / 'sparkle' / 'magic ui' 검색
    - why: 안전한 라이선스로 웰컴 차임 보강. 8bit 아니어도 부드러운 반짝임 톤 확보 가능.

#### `ui-error-beep` — 무효 입력 에러 [must]
- 트리거: 비활성 버튼·잘못된 조작 시
- 음색: 짧고 낮은 부저형 더블 블립, 귀엽게 톡 튕김
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool; 상업 사용 자유, 무크레딧)
    - locator: jsfxr: 'Hit/Hurt' 또는 'Blip' 프리셋 → Wave를 Square/Sawtooth → Start Frequency 낮게 → 짧은 톤 2회 반복 느낌으로 Repeat Speed 살짝 올려 '더블 블립' → Frequency Slide 소폭 음수로 톡 튕김 → Length 짧게 → Export .wav
    - why: '짧고 낮은 부저형 더블 블립, 귀엽게 톡 튕김' — Blip + Repeat Speed로 더블 블립을 만들고 낮은 주파수+square로 부저 느낌. must 핵심.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리 상업 사용, 무크레딧)
    - locator: Bfxr: 낮은 square 톤 생성 + Repeat/Duty 조정으로 2연타 부저 → 살짝 하강 slide로 귀여운 톡 → wav export
    - why: Repeat/duty 컨트롤이 풍부해 '더블 블립' 부저를 정교하게. 낮고 귀여운 톤 유지.
  - **[Kenney.nl (Interface Sounds pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/interface-sounds — 'error' / 'denied' / 'wrong' 계열 낮은 부저 톤 사용
    - why: error/denied 전용 톤이 팩에 포함 — 무효 입력에 그대로. CC0 안전 baseline.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 필터 시 무크레딧)
    - locator: freesound.org: '8bit error' 또는 'buzzer wrong retro' 또는 'invalid input beep' 검색 → CC0 필터 → 낮은 더블 부저 선별
    - why: 실제 에러 부저 원소스 확보. CC0만 골라 안전하게.

### 매치메이킹 · 방 (8)

#### `mm-searching-loop` — 매칭중 루프 [must]
- 트리거: 빠른시작 상대 탐색 중 반복 재생
- 음색: 통통 튀는 8~16비트 루프, 기승전결 없이 일정 에너지로 도는 대기감
- 후보:
  - **[BeepBox (beepbox.co) · generator-recipe]** (MIT (오픈소스); 만든 곡은 사용자 소유, 상업 사용 가능)
    - locator: BeepBox: 새 곡 → tempo 140~155, key=C major. 2마디 loop로 설정(bars=2, loop 전체). 채널1 lead: square wave, 8분음표로 C5-E5-G5-E5 통통 튀는 아르페지오 반복. 채널2 bass: triangle wave로 C3-G2 교대. drums 채널에 가벼운 hi-hat 8비트. 빌드/드롭 없이 동일 패턴 무한 반복 → wav/mp3 export. 대기감 있는 밝은 메이저 루프.
    - why: 기승전결 없는 일정 에너지 8bit 루프를 브라우저에서 직접 작곡 가능 — 요구사항의 '반복적 루프감' 정확히 충족. 커비 8bit 레퍼런스 톤과 결.
  - **[FamiStudio (famistudio.org) · generator-recipe]** (오픈소스(무료); 제작 곡 사용자 소유)
    - locator: FamiStudio: NES 2A03 사운드칩으로 4~8마디 밝은 메이저 패턴 작곡 후 루프 포인트를 마디 처음으로 지정 → 이음매 없는 seamless loop wav export. Pulse1=lead 아르페지오, Pulse2=하모니, Triangle=베이스, Noise=경쾌한 퍼커션. 볼륨/필터 정적 유지해 빌드업 제거.
    - why: Nintendo/커비류 톤을 가장 authentic하게 재현하며 루프 포인트 지정으로 매칭 대기 중 끊김 없는 반복 재생에 최적.
  - **[Freesound.org · search-query]** (항목별 CC0 / CC-BY(4.0) 혼합 — CC0 필터 시 무크레딧, CC-BY는 크레딧 필요)
    - locator: freesound.org: 검색 "8bit loop" 또는 "chiptune loop bright" + 필터 License=Creative Commons 0 + 길이 2~10s. 예: 'arcade waiting loop', 'chiptune menu loop'로 짧은 루프 스템 확보.
    - why: 커뮤니티 DB에서 완제 칩튠 대기 루프를 즉시 확보 가능. CC0만 필터링하면 크레딧 부담 없이 사용.
  - **[Bosca Ceoil (Blue) · generator-recipe]** (무료/오픈소스(Terry Cavanagh); 제작 곡 사용자 소유)
    - locator: Bosca Ceoil: 통통 튀는 4마디 패턴 스케치 → 전체를 loop로 지정, 인스트루먼트=chiptune pulse/square. 짧게 만들고 무한 반복. wav/mid export 후 필요시 BeepBox에서 다듬기.
    - why: 초보 친화 툴로 빠르게 루프감 있는 대기 BGM 스케치 가능 — 반복 에너지 유지에 적합.

#### `mm-match-found` — 매칭 성사 [must]
- 트리거: 상대 매칭 완료 순간
- 음색: 상승 아르페지오 + 딩! 밝은 성사 스팅어
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT (tool); 생성 .wav 상업 사용 자유)
    - locator: jsfxr: 'Powerup' 프리셋 클릭 → Attack=0, Sustain 짧게, Frequency slide(양수)로 상승감 강화, arpeggio 옵션 켜서 상승 아르페지오화. square wave 유지. 끝에 짧은 딩 느낌 나도록 sustain punch 약간. Export wav + JSON 저장으로 버전관리.
    - why: Powerup 프리셋이 밝은 상승 성사 스팅어에 정확히 부합 — '상승 아르페지오 + 딩!' 캐릭터 즉석 생성. 링크 썩음 없어 신뢰도 최고.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴; 생성 사운드 상업 포함 자유)
    - locator: ChipTone: pitch에 상승 slide + arpeggio(major 3음: root-3rd-5th) 설정, tone=square, 끝에 짧은 bell/딩 레이어 추가. 밝은 성사 스팅어로 튜닝 후 wav export.
    - why: 아르페지오/슬라이드로 커비류 밝은 성사 스팅어를 시각적 파형 편집으로 정교하게 제작 가능.
  - **[Kenney.nl (Music Jingles / Interface Sounds) · download-link]** (CC0 (퍼블릭 도메인) — 크레딧 불필요)
    - locator: https://kenney.nl/assets/music-jingles 또는 https://kenney.nl/assets/interface-sounds — 짧은 상승 성공 징글/positive confirm 사운드 선택.
    - why: 완제 성공 징글을 크레딧 없이 즉시 사용 — 매칭 성사 순간 스팅어 baseline으로 최적.
  - **[Freesound.org · search-query]** (CC0 / CC-BY 혼합 — CC0 필터 권장)
    - locator: freesound.org: "success arpeggio 8bit" 또는 "match found chiptune" + License=CC0 필터. 'level up 8bit', 'positive win jingle short'도 검색.
    - why: 상승 아르페지오 성공음 원소스를 다양하게 확보 가능.

#### `room-create` — 코드방 생성 [must]
- 트리거: 코드방 생성 완료·코드 발급
- 음색: 산뜻한 팝 + 반짝임, 방이 '뿅' 생기는 느낌
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT (tool); 생성 .wav 상업 사용 자유)
    - locator: jsfxr: 'Pickup/Coin' 프리셋 → 짧고 산뜻한 팝. Frequency 살짝 높이고 arpeggio 켜서 반짝임 추가, sustain 매우 짧게(뿅 느낌). square/sine 조합. Export wav + JSON 저장.
    - why: Pickup/Coin 프리셋의 짧은 상승 팝이 '방이 뿅 생기는' 산뜻한 느낌에 부합 — arpeggio로 반짝임 보강.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴; 생성 사운드 상업 포함 자유)
    - locator: ChipTone: 짧은 pluck + 끝에 고음 sparkle(짧은 high-pitch blip 레이어) 조합. pitch 살짝 상승 슬라이드로 '팝' 강조. wav export.
    - why: UI 블립 + 반짝임 레이어링에 최적 — 방 생성의 산뜻한 팝+sparkle 조합 제작.
  - **[Kenney.nl (Interface Sounds / UI Audio) · download-link]** (CC0 (퍼블릭 도메인) — 크레딧 불필요)
    - locator: https://kenney.nl/assets/interface-sounds — 밝은 pop/confirm/appear 계열 UI 사운드 선택.
    - why: 완제 UI 팝 사운드를 무크레딧으로 즉시 사용 — 방 생성 confirm에 baseline.
  - **[Pixabay (Sound Effects) · search-query]** (Pixabay Content License — 상업 사용 OK, 무크레딧)
    - locator: pixabay.com/sound-effects: "pop sparkle" 또는 "magic pop ui" 검색.
    - why: 라이선스 단순·안전. 반짝이는 팝 UI 효과음 보강용.

#### `room-join` — 코드방 입장 [must]
- 트리거: 코드 입력 후 방 입장 성공
- 음색: 문 열리듯 짧은 스윕 + 긍정 블립
- 후보:
  - **[Bfxr (bfxr.net) · generator-recipe]** (오픈소스(sfxr 기반); 생성음 로열티프리 상업 사용 가능)
    - locator: Bfxr: short frequency sweep(낮음→높음, 문 열리듯) + 끝에 positive blip 레이어. tone=square, slide 양수, sustain 짧게. 필터로 부드러운 스윕 만들고 마지막에 딩 톤 추가. Export wav.
    - why: sfxr보다 풍부한 필터/믹서로 '스윕 + 긍정 블립' 레이어드 SFX를 정교하게 — 문 열리듯 입장 성공음에 부합.
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT (tool); 생성 .wav 상업 사용 자유)
    - locator: jsfxr: 'Blip/Select' 프리셋 → Frequency slide 양수로 짧은 상승 스윕화, sustain 짧게, 끝음 밝게. Export wav + JSON 저장.
    - why: Blip/Select 프리셋에 상승 슬라이드를 더해 짧은 스윕+긍정 블립 조합 즉석 생성.
  - **[Freesound.org · search-query]** (CC0 / CC-BY 혼합 — CC0 필터 권장)
    - locator: freesound.org: "whoosh blip 8bit" 또는 "enter room ui swoosh" + License=CC0. 'door open chiptune', 'ui enter positive'도 검색.
    - why: 스윕(whoosh)+블립 조합 원소스 확보 가능.
  - **[Kenney.nl (Interface Sounds) · download-link]** (CC0 (퍼블릭 도메인) — 크레딧 불필요)
    - locator: https://kenney.nl/assets/interface-sounds — swipe/transition/confirm 계열에서 짧은 스윕+긍정음 선택.
    - why: 무크레딧 완제 UI 전환음으로 입장 성공 표현 가능.

#### `room-join-fail` — 방 입장 실패 [nice]
- 트리거: 잘못된 코드·만석·없는 방 입장 시도
- 음색: 낮은 더블 부저, 귀엽게 거절하는 톤
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT (tool); 생성 .wav 상업 사용 자유)
    - locator: jsfxr: 'Hit/Hurt' 프리셋 기반 → Frequency 낮게, slide 음수(하강), square wave, 두 번 짧게 반복되도록 Repeat Speed 올려 더블 부저화. 볼륨 과하지 않게. Export wav + JSON.
    - why: 낮은 하강 톤 + repeat로 '귀엽게 거절하는 낮은 더블 부저' 캐릭터 정확히 구현. 링크 썩음 없음.
  - **[Bfxr (bfxr.net) · generator-recipe]** (오픈소스; 생성음 로열티프리 상업 사용 가능)
    - locator: Bfxr: low square tone 2연타(짧은 간격), 약간의 하강 pitch, 필터로 부드럽게 다듬어 harsh하지 않게. '삐-빅' 거절 톤. Export wav.
    - why: 필터 조정으로 귀엽고 과하지 않은 거절 부저 톤을 정교하게 제작.
  - **[Kenney.nl (Interface Sounds / UI Audio) · download-link]** (CC0 (퍼블릭 도메인) — 크레딧 불필요)
    - locator: https://kenney.nl/assets/interface-sounds — error/deny/negative 계열 UI 사운드 선택.
    - why: 완제 error/deny UI 사운드 무크레딧 사용 — 입장 실패 baseline.
  - **[Freesound.org · search-query]** (CC0 / CC-BY 혼합 — CC0 필터 권장)
    - locator: freesound.org: "error buzzer 8bit" 또는 "deny beep retro" + License=CC0. 'wrong answer chiptune', 'negative ui blip'도 검색.
    - why: 낮은 거절 부저 원소스를 다양하게 확보.

#### `room-opponent-join` — 상대 접속 [must]
- 트리거: 대기방에 상대가 들어옴
- 음색: 밝은 등장 차임, 인기척 팝
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT (tool); 생성 .wav 상업 사용 자유)
    - locator: jsfxr: 'Pickup/Coin' 또는 'Blip/Select' 프리셋 → 짧은 상승 2음 차임, arpeggio 켜서 밝은 등장감. sustain 짧게, 팝 느낌. Export wav + JSON.
    - why: 밝은 등장 차임/인기척 팝을 상승 아르페지오로 즉석 생성 — 방에 상대 입장 알림에 부합.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴; 생성 사운드 상업 포함 자유)
    - locator: ChipTone: 밝은 2음 상승 차임(도-미 또는 도-솔), square/sine 톤, 끝에 짧은 sparkle. 인기척 팝 느낌으로 짧게. wav export.
    - why: 커비류 밝은 등장 차임을 아르페지오로 정교하게 제작 가능.
  - **[Kenney.nl (Interface Sounds / UI Audio) · download-link]** (CC0 (퍼블릭 도메인) — 크레딧 불필요)
    - locator: https://kenney.nl/assets/interface-sounds — notification/appear/join 계열 밝은 알림 사운드 선택.
    - why: 완제 알림/등장 UI 사운드 무크레딧 사용 — 상대 접속 알림 baseline.
  - **[Pixabay (Sound Effects) · search-query]** (Pixabay Content License — 상업 사용 OK, 무크레딧)
    - locator: pixabay.com/sound-effects: "notification chime bright" 또는 "player join pop" 검색.
    - why: 밝은 등장 차임/알림음을 안전한 라이선스로 확보.

#### `room-opponent-leave` — 상대 이탈 [must]
- 트리거: 상대가 방을 나가거나 연결 끊김
- 음색: 짧게 사그라드는 하강 톤, 살짝 쓸쓸하지만 과하지 않게
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT (tool); 생성 .wav 상업 사용 자유)
    - locator: jsfxr: 'Blip/Select' 또는 'Powerup' 프리셋 → Frequency slide 음수(하강), sustain/decay로 짧게 사그라들게, square wave. 2~3음 하강. 과하지 않게 볼륨 조절. Export wav + JSON.
    - why: 하강 슬라이드로 '짧게 사그라드는 하강 톤, 살짝 쓸쓸하지만 과하지 않게' 정확히 구현.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴; 생성 사운드 상업 포함 자유)
    - locator: ChipTone: 하강 pitch slide(솔-미-도), decay를 붙여 fade-out, square 톤. 짧고 부드럽게 사그라드는 이탈음. wav export.
    - why: 하강+fade 조정으로 쓸쓸하지만 과하지 않은 이탈 톤을 정교하게 제작.
  - **[Kenney.nl (Interface Sounds) · download-link]** (CC0 (퍼블릭 도메인) — 크레딧 불필요)
    - locator: https://kenney.nl/assets/interface-sounds — back/close/leave/negative(soft) 계열 하강 UI 사운드 선택.
    - why: 완제 하강/닫힘 UI 사운드 무크레딧 사용 — 상대 이탈 baseline.
  - **[Freesound.org · search-query]** (CC0 / CC-BY 혼합 — CC0 필터 권장)
    - locator: freesound.org: "descending blip 8bit" 또는 "player leave chiptune" + License=CC0. 'power down soft retro', 'ui cancel down'도 검색.
    - why: 하강 이탈 톤 원소스를 다양하게 확보.

#### `room-ready` — 준비 완료 [nice]
- 트리거: 양측 레디·시작 준비 완료
- 음색: 탄력 있는 2음 확정 블립
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT (tool); 생성 .wav 상업 사용 자유)
    - locator: jsfxr: 'Blip/Select' 프리셋 → 2음 상승 확정 블립(도-솔 또는 도-도옥타브), square wave, sustain 짧고 탄력 있게(punch 약간), arpeggio로 2음 처리. Export wav + JSON.
    - why: '탄력 있는 2음 확정 블립' 캐릭터를 arpeggio 2음 상승으로 정확히 구현 — 레디 확정음에 최적.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴; 생성 사운드 상업 포함 자유)
    - locator: ChipTone: 짧은 2음 상승 blip(도-솔), 탄력감 위해 짧은 attack + 약간의 pitch bounce, square 톤. 확정감 있게 wav export.
    - why: 2음 확정 블립을 탄력 있는 톤으로 정교하게 제작 가능.
  - **[Kenney.nl (Interface Sounds / UI Audio) · download-link]** (CC0 (퍼블릭 도메인) — 크레딧 불필요)
    - locator: https://kenney.nl/assets/interface-sounds — confirm/ready/select 계열 짧은 확정 UI 사운드 선택.
    - why: 완제 confirm UI 사운드 무크레딧 사용 — 레디 확정 baseline.
  - **[Freesound.org · search-query]** (CC0 / CC-BY 혼합 — CC0 필터 권장)
    - locator: freesound.org: "confirm blip 8bit" 또는 "ready two tone chiptune" + License=CC0. 'ui accept retro', 'select confirm arcade'도 검색.
    - why: 2음 확정 블립 원소스를 다양하게 확보.

### 코인 · 경제 (6)

#### `coin-bet-confirm` — 베팅 확정 [must]
- 트리거: 코인 베팅 모달에서 베팅 확정
- 음색: 동전이 딸깍 걸리는 무게감 있는 확정 톤, 밝은 금속 블립
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴, 생성 wav 상업 사용 자유·무크레딧)
    - locator: jsfxr: 'Blip/Select' 프리셋 클릭 → Wave=Square, Start Frequency(p_base_freq) 중간(~0.45), Attack 0, Sustain 아주 짧게(~0.05), Decay 짧게(~0.12), Slide(p_freq_ramp) 살짝 음수(-0.05)로 끝을 '딸깍 걸리는' 하강, Arpeggio 끔. Low-pass filter 약간 걸어 금속기 다듬기. Export wav.
    - why: 짧고 무게감 있는 단일 '딸깍 확정' 블립을 파라미터로 정확히 재현·버전관리 가능. 아케이드 UI 확정음 톤에 최적.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴, 생성 사운드 상업 포함 자유 사용·무크레딧)
    - locator: ChipTone: Shape=Square, 짧은 pluck 엔벨로프에 downward pitch bend 소량 추가(걸림 무게감), 톤 위에 metallic click 느낌의 밝은 하모닉 1레이어 → wav export.
    - why: 시각 파형 편집으로 '금속 블립 + 딸깍 걸림'의 2요소를 한 샘플에 합성하기 좋음.
  - **[Kenney.nl (Interface Sounds / UI Audio) · download-link]** (CC0 (퍼블릭 도메인), 크레딧 불필요)
    - locator: https://kenney.nl/assets/interface-sounds (또는 https://kenney.nl/assets/ui-audio) 에서 'confirmation'/'select'/'click' 계열 wav 선택
    - why: 완제 UI 확정음을 즉시 baseline으로 확보. CC0라 상업 배포 리스크 제로.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0만 필터링해 무크레딧 사용)
    - locator: Freesound: '8bit coin select' 또는 'chiptune confirm click' + 라이선스 필터 Creative Commons 0
    - why: 동전이 슬롯에 걸리는 실제 metallic click 원소스를 8bit 톤으로 변형해 쓰기 좋음.

#### `coin-gain` — 코인 획득 (+N) [must]
- 트리거: 매치 승리 정산으로 코인 증가
- 음색: 상승하는 코인 카운트 차르릉, 여러 동전 반짝임
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴, 생성 wav 상업 사용 자유·무크레딧)
    - locator: jsfxr: 'Pickup/Coin' 프리셋 클릭(기본이 이미 상승 아르페지오 동전음) → Change Amount(p_arp_mod) 양수로 키워 상승감 강화, Change Speed(p_arp_speed) 빠르게, Sustain 살짝 늘려 '차르릉' 여운, Square wave 유지. 여러 동전 느낌은 코드에서 2~3회 미세 피치시프트 반복재생. Export wav.
    - why: 'Pickup/Coin' 프리셋 자체가 상승 코인 카운트음의 정석. +N 정산 상승감에 그대로 부합.
  - **[Bosca Ceoil (Blue) · generator-recipe]** (무료/오픈소스, 제작 곡 사용자 소유)
    - locator: Bosca Ceoil: 밝은 메이저키에서 짧은 상승 아르페지오(예: C-E-G-C 상승) 2박 징글, pulse/square 음색 → wav export. 커비류 밝은 톤 유지.
    - why: 단순 블립이 아니라 '여러 동전 반짝임'을 멜로딕한 상승 징글로 표현. 결과 오버레이 +N 정산에 화사함 부여.
  - **[Kenney.nl (Coin / RPG Audio / Music Jingles) · download-link]** (CC0 (퍼블릭 도메인), 크레딧 불필요)
    - locator: https://kenney.nl/assets/rpg-audio (coin/handle 계열) 또는 https://kenney.nl/assets/music-jingles 의 positive/collect 징글 wav
    - why: 즉시 쓸 완제 코인 획득/긍정 징글. CC0로 안전, 웹 canvas에 바로 번들.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 우선, CC-BY 사용 시 크레딧 관리)
    - locator: Freesound: '8bit coins jingle' 또는 'chiptune coin pickup ascending' + CC0 필터
    - why: 여러 동전이 쏟아지는 차르릉 원소스 확보용 대안. 상승 톤 항목 다수.

#### `coin-loss` — 코인 손실 (−N) [must]
- 트리거: 매치 패배 정산으로 코인 감소
- 음색: 하강하는 동전 빠짐 톤, 낙담하지만 경쾌함 유지
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴, 생성 wav 상업 사용 자유·무크레딧)
    - locator: jsfxr: 'Pickup/Coin' 프리셋 로드 후 Change Amount(p_arp_mod)를 음수로 뒤집어 '하강 아르페지오', Start Frequency 약간 낮춤, Decay 짧게 유지해 경쾌함 보존(너무 어둡지 않게). Square wave. Export wav.
    - why: 획득음과 대칭(상승→하강)으로 만들어 UI 일관성 확보. 하강이지만 짧고 발랄해 '낙담하지만 경쾌'에 부합.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴, 생성 사운드 상업 포함 자유 사용·무크레딧)
    - locator: ChipTone: Square, 2~3음 하강 아르페지오(예: G-E-C) 짧은 엔벨로프, 마지막 음에 살짝 pitch-drop으로 '동전 빠짐' 뉘앙스 → wav export.
    - why: 하강 톤을 밝은 메이저 스케일 안에서 조절해 어둡지 않게 유지 가능.
  - **[Kenney.nl (Music Jingles / Interface Sounds) · download-link]** (CC0 (퍼블릭 도메인), 크레딧 불필요)
    - locator: https://kenney.nl/assets/music-jingles 의 negative/lose 계열 짧은 징글 wav 선택
    - why: 완제 '가벼운 부정' 징글을 즉시 확보. CC0라 무크레딧 상업 배포.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 우선)
    - locator: Freesound: '8bit lose coin' 또는 'chiptune negative descending' + CC0 필터
    - why: 하강 동전 빠짐 원소스 대안. 경쾌함 유지되는 짧은 항목 선별.

#### `coin-tally-tick` — 잔액 카운트 틱 [nice]
- 트리거: 잔액 숫자 롤업 애니메이션 중 반복
- 음색: 빠른 미세 블립 연속, 숫자 굴러가는 느낌
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴, 생성 wav 상업 사용 자유·무크레딧)
    - locator: jsfxr: 'Blip/Select' 프리셋 → 극단적으로 짧게(Sustain 0, Decay ~0.03), 볼륨 낮춤, Arpeggio 끔. 단일 미세 블립 1개만 만들고 잔액 롤업 애니메이션 프레임마다 코드에서 반복재생(피치 미세 랜덤화로 기계적 반복 회피). Export wav.
    - why: 숫자 롤업은 '한 개의 짧은 틱'을 빠르게 반복하는 게 정석. 파라미터로 길이/볼륨 정밀 제어.
  - **[jfxr · generator-recipe]** (오픈소스 웹 툴, 생성음 자유 사용)
    - locator: jfxr: 슬라이더로 아주 짧은 고음 tick 생성 — Frequency 높게, Duration 극소, Sustain 0, 미세한 pitch로 여러 변형(tick_a/tick_b) 만들어 번갈아 재생.
    - why: 미세 톤 차이가 필요한 반복 SFX에 특화. 2~3종 변형으로 롤업 반복의 단조로움 제거.
  - **[Kenney.nl (Interface Sounds / UI Audio) · download-link]** (CC0 (퍼블릭 도메인), 크레딧 불필요)
    - locator: https://kenney.nl/assets/interface-sounds 의 'tick'/'minimal click' 계열 짧은 wav
    - why: 완제 초단타 UI 틱을 즉시 확보. 반복재생용 baseline.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 우선)
    - locator: Freesound: 'ui counter tick blip' 또는 '8bit rollup tick' + CC0 필터
    - why: 숫자 굴러가는 카운터 틱 원소스 대안 확보.

#### `coin-unlock` — 게임 해금 [must]
- 트리거: 오프라인 게임 순차 해금 달성
- 음색: 화려한 잠금해제 팡파르, 자물쇠 탁 열림 + 반짝
- 후보:
  - **[Bosca Ceoil (Blue) · generator-recipe]** (무료/오픈소스, 제작 곡 사용자 소유)
    - locator: Bosca Ceoil: 밝은 메이저키 짧은 승리 팡파르 징글(상승 3~4음 + 마지막 화음 강조), pulse/square lead + 짧은 반짝임 상단 노트 → wav export.
    - why: '화려한 잠금해제 팡파르'의 멜로딕 코어를 커비류 밝은 톤으로 직접 작곡. 성취감 스팅어에 적합.
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴, 생성 wav 상업 사용 자유·무크레딧)
    - locator: jsfxr: 'Powerup' 프리셋으로 상승 반짝임(sparkle) 생성 + 'Hit/Hurt' 또는 'Blip/Select' 저역 톤으로 '자물쇠 탁 열림' clunk 1개 별도 생성 → 두 wav를 코드/DAW에서 레이어(clunk 먼저, 곧바로 sparkle 상승). Export.
    - why: '자물쇠 탁(임팩트) + 반짝(상승)'의 2요소를 프리셋 2개로 분리 제작해 합성하면 화려한 해금감 구현.
  - **[Kenney.nl (Music Jingles) · download-link]** (CC0 (퍼블릭 도메인), 크레딧 불필요)
    - locator: https://kenney.nl/assets/music-jingles 의 'unlock'/'achievement'/positive 팡파르 wav 선택
    - why: 완제 해금/업적 팡파르를 즉시 확보. CC0라 무크레딧 상업 사용.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 우선, CC-BY 시 크레딧 관리)
    - locator: Freesound: '8bit unlock fanfare' 또는 'chiptune achievement level up' + CC0/CC-BY 필터
    - why: 화려한 해금 팡파르 원소스 대안. level up/achievement 항목 다수.

#### `coin-insufficient` — 잔액 부족 에러 [must]
- 트리거: 코인 부족 상태로 베팅·해금 시도
- 음색: 낮고 짧은 거절 부저 + 텅 빈 느낌의 톤
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴, 생성 wav 상업 사용 자유·무크레딧)
    - locator: jsfxr: 'Blip/Select'(또는 'Hit/Hurt') 프리셋 → Wave=Square, Start Frequency 낮게(~0.2), Slide(p_freq_ramp) 음수로 짧게 하강해 '거절 부저', Sustain 짧게, Decay 짧게. 필요시 2음(높음→낮음) 하강으로 '땡-' 느낌. Export wav.
    - why: 낮고 짧은 하강 거절 부저를 파라미터로 정확히. 아케이드 'denied' 톤의 정석.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴, 생성 사운드 상업 포함 자유 사용·무크레딧)
    - locator: ChipTone: Square/저역, 두 음 하강(예: E→C) 짧은 buzz, 살짝 detune으로 '텅 빈/거절' 뉘앙스 → wav export.
    - why: '낮고 짧은 거절 + 텅 빈 톤' 두 뉘앙스를 detune/하강으로 조합하기 좋음.
  - **[Kenney.nl (Interface Sounds / UI Audio) · download-link]** (CC0 (퍼블릭 도메인), 크레딧 불필요)
    - locator: https://kenney.nl/assets/interface-sounds (또는 ui-audio) 의 'error'/'denied'/'back' 계열 wav 선택
    - why: 완제 에러/거절 UI 사운드를 즉시 확보. CC0로 안전.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 우선)
    - locator: Freesound: '8bit error denied buzz' 또는 'chiptune negative buzzer' + CC0 필터
    - why: 낮은 거절 부저 원소스 대안. arcade error 항목 다수.

### 매치 플로우 (7)

#### `flow-countdown-tick` — 카운트다운 3·2·1 [must]
- 트리거: 인게임 진입 전 3·2·1 각 숫자마다
- 음색: 긴장감 있는 동일 피치 틱 3연발, 점점 임박한 느낌
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴, 생성 .wav는 상업 사용 자유·무크레딧)
    - locator: jsfxr: 'Blip/Select' 프리셋 클릭 → Wave=Square, Attack=0, Sustain=0.05, Decay=0.10, Start Frequency ≈ 0.45 고정(피치 변화 슬라이드/슬라이드 램프 0으로), Sustain Punch 약간. 동일 파라미터로 1개 원샷 export 후 게임 코드에서 3·2·1에 같은 클립 3번 재생(마지막 GO는 별도). 동일 피치 틱이라 긴장 누적감.
    - why: 동일 피치 짧은 틱을 정확히 재현·버전관리 가능. '점점 임박' 느낌은 코드에서 3발 반복+마지막 강조로 구현하는 게 정석.
  - **[Freesound.org · search-query]** (항목별 상이 — CC0 필터 시 무크레딧, CC-BY 항목은 크레딧 필요)
    - locator: freesound: '8bit countdown' 또는 'chiptune tick' 또는 'retro beep countdown' 검색 → License 필터를 'Creative Commons 0'로 설정
    - why: 완성형 3·2·1 카운트다운 원소스 또는 단일 틱 확보. CC0 필터로 라이선스 리스크 제거.
  - **[Kenney.nl (Audio packs) · download-link]** (CC0 (퍼블릭 도메인), 무크레딧)
    - locator: https://kenney.nl/assets/interface-sounds — 팩 내 'select'/'click'/'tick' 계열 짧은 블립을 카운트다운 틱으로 전용
    - why: 즉시 쓸 수 있는 짧고 깔끔한 UI 블립 다수. 크레딧 불필요로 baseline 채우기 최적.
  - **[jfxr · generator-recipe]** (오픈소스 웹 툴, 생성음 자유 사용)
    - locator: jfxr: Square wave, Frequency ≈ 660Hz 고정, Sustain 30~50ms, 짧은 Decay, Frequency slide=0(피치 일정). 슬라이더로 톤 미세조정해 카운트다운 틱 전용 버전 생성
    - why: 미세 톤 차이가 필요한 반복 틱에 슬라이더 세밀 조정이 강점. sfxr 계열 대안으로 재현성 확보.

#### `flow-go` — GO! 시작 신호 [must]
- 트리거: 카운트다운 끝 GO 표시 순간
- 음색: 터지는 밝은 팡! 상승 강조음, 스타트 게이트 개방감
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴, 생성 .wav 상업 사용 자유·무크레딧)
    - locator: jsfxr: 'Powerup' 프리셋 클릭 → Wave=Square, Slide(Frequency Ramp)를 양수로 크게(상승), Sustain 0.1~0.2, Decay 0.2, Sustain Punch 올림, 약간의 Repeat Speed로 통통. 밝은 상승 '팡!' 스타트감. 카운트다운 틱과 대비되게 피치 높게.
    - why: Powerup 프리셋의 상승 슬라이드가 '스타트 게이트 개방'감에 정확히 맞음. 링크 썩음 없이 재현 가능.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴, 생성 사운드 상업 포함 자유 사용·무크레딧)
    - locator: ChipTone: 오실레이터 Square/Pulse + 피치 envelope를 상승(rising)으로, arpeggio 살짝 얹어 밝은 상승 스팅어. Attack 짧게, Release로 팡 터지는 tail. wav export
    - why: 시각적 파형 편집+아르페지오로 커비류 밝은 'GO!' 상승 스팅어를 정교하게. 결과 즉시 wav.
  - **[Pixabay (Sound Effects) · search-query]** (Pixabay Content License — 상업 OK, 무크레딧)
    - locator: https://pixabay.com/sound-effects/search/ → '8bit power up' 또는 'game start' 또는 'arcade start' 검색
    - why: 라이선스 단순·안전. 상승 스타트음 완제품을 리스크 없이 확보.
  - **[Freesound.org · search-query]** (CC0 필터 시 무크레딧)
    - locator: freesound: 'retro game start' 또는 '8bit go' 또는 'chiptune fanfare short' 검색 → License 'CC0' 필터
    - why: 짧은 상승 스타트 스팅어 원소스 확보. CC0로 크레딧 관리 불필요.

#### `flow-match-start` — 매치 시작 앰비언스 [nice]
- 트리거: 라운드 개시 직후 짧은 강조
- 음색: 짧은 에너지 버스트, 경쾌한 대전 개시감
- 후보:
  - **[Bosca Ceoil (Blue) · generator-recipe]** (무료/오픈소스(Terry Cavanagh), 제작 곡 사용자 소유)
    - locator: Bosca Ceoil: 밝은 메이저 코드 1~2마디 짧은 스팅어(빠른 BPM), pulse 리드 + 짧은 percussion 한 방으로 에너지 버스트. wav export 후 트리밍
    - why: 짧은 대전 개시 징글을 통통 튀게 스케치. GO! 직후 겹치는 짧은 에너지 버스트로 적합.
  - **[Bfxr · generator-recipe]** (오픈소스(sfxr 기반), 로열티프리 상업 사용)
    - locator: Bfxr: 'Powerup' 계열 시작 후 두 오실레이터 레이어(상승 슬라이드 + 짧은 노이즈 hit) 믹서로 합쳐 짧은 버스트. Sustain 0.15, Punch 상승
    - why: 레이어 있는 짧은 임팩트 버스트를 정교하게. sfxr보다 믹서가 풍부해 '개시감' 강조 가능.
  - **[Kenney.nl (Audio packs) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/music-jingles — 짧은 jingle 중 밝은 스타트/positive 계열 선택해 라운드 개시 강조음으로
    - why: 완제 짧은 징글로 즉시 채움. nice 우선순위라 생성 없이 baseline으로 충분.

#### `flow-timeup` — 타임업 [must]
- 트리거: 제한시간 종료
- 음색: 종료 버저 + 짧은 알림 차임, 밝지만 단호
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴, 상업 사용 자유·무크레딧)
    - locator: jsfxr: 'Hit/Hurt' 프리셋 → Wave=Square 또는 Sawtooth, 저음 Start Frequency, 약간 하강 슬라이드, Sustain 0.2로 길게, 약한 Vibrato로 '버저'감. 이 원샷 + 별도 밝은 Blip 차임 2음을 코드에서 연속 재생하면 '버저+알림 차임'
    - why: 종료 버저의 단호한 톤과 뒤이은 밝은 차임을 각각 생성해 조합. 밝지만 단호한 캐릭터 재현.
  - **[Freesound.org · search-query]** (CC0 필터 시 무크레딧, CC-BY는 크레딧 필요)
    - locator: freesound: 'buzzer time up' 또는 'game over buzzer 8bit' 또는 'timer end beep' 검색 → License 'CC0' 필터
    - why: 완성형 타임업 버저 원소스 확보. CC0 필터로 안전.
  - **[Mixkit (Sound Effects) · search-query]** (Mixkit License — 상업 OK, 무크레딧(단독 재배포 금지))
    - locator: https://mixkit.co/free-sound-effects/game/ → 'buzzer' / 'time up' / 'game notification' 검색
    - why: 깔끔한 범용 버저/알림음을 무크레딧으로. 결과 전환 광택 보강에 안전.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴, 상업 자유·무크레딧)
    - locator: ChipTone: pulse 오실레이터로 하강 buzzer envelope + 뒤에 짧은 2음 상승 차임 arpeggio. 두 파트를 한 클립으로 export
    - why: 버저+차임을 한 툴에서 시각 편집으로 조합. 밝은 톤 유지하며 단호함 표현.

#### `flow-win-stinger` — 승리 스팅어 [must]
- 트리거: 결과 오버레이 WIN 표시
- 음색: 화사한 승리 팡파르, 메이저 상승 마무리
- 후보:
  - **[Bosca Ceoil (Blue) · generator-recipe]** (무료/오픈소스, 제작 곡 사용자 소유)
    - locator: Bosca Ceoil: 메이저키 I-IV-V-I 또는 상승 아르페지오 2마디 팡파르(빠른 BPM), pulse 리드 2트랙 하모니 + 짧은 드럼 fill로 마무리 상승. wav export
    - why: 화사한 승리 팡파르를 커비류 밝은 메이저로 직접 작곡. 상승 마무리감 정확히 구현.
  - **[Freesound.org · search-query]** (CC0 필터 시 무크레딧, CC-BY 다수는 크레딧 필요)
    - locator: freesound: '8bit win' 또는 'chiptune victory fanfare' 또는 'level complete jingle' 검색 → License 'CC0' 필터
    - why: 완성형 승리 팡파르 다수. 라이선스 필터로 CC0만 골라 무크레딧 사용.
  - **[Kenney.nl (Audio packs) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/music-jingles — 'win'/'positive'/'complete' 계열 짧은 승리 징글 선택
    - why: must 항목을 즉시 채우는 완제 승리 징글. 크레딧 불필요.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴, 상업 자유·무크레딧)
    - locator: ChipTone: 상승 arpeggio(메이저 3화음) + 마지막 롱 tail 코드로 화사한 마무리. Attack 짧게, Release 길게, echo 약간. wav export
    - why: 밝은 WIN 스팅어를 아르페지오+에코로 광택 있게. 결과 오버레이 스팅어 전용 제작.

#### `flow-lose-stinger` — 패배 스팅어 [must]
- 트리거: 결과 오버레이 LOSE 표시
- 음색: 귀엽게 축 처지는 하강 모티프, 좌절이지만 가벼움
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴, 상업 사용 자유·무크레딧)
    - locator: jsfxr: 'Powerup' 프리셋으로 시작하되 Slide(Frequency Ramp)를 '음수'로(하강), Wave=Square, Sustain 0.3, Decay 0.3, 약간의 Vibrato로 축 처지는 'wah-wah' 하강. 귀엽게 처지는 좌절 모티프.
    - why: 하강 슬라이드 파라미터로 '축 처지는' 패배 모티프를 정확히. 가벼운 톤 유지 가능해 무겁지 않음.
  - **[Bosca Ceoil (Blue) · generator-recipe]** (무료/오픈소스, 제작 곡 사용자 소유)
    - locator: Bosca Ceoil: 하강 3~4음 모티프(예: 반음계 또는 마이너 3rd 하강), pulse 리드 단성, 느린 감쇠로 귀엽게 처짐. wav export
    - why: 'sad trombone'식 하강 모티프를 칩튠 톤으로 스케치. 좌절이지만 가벼운 캐릭터.
  - **[Freesound.org · search-query]** (CC0 필터 시 무크레딧)
    - locator: freesound: '8bit fail' 또는 'chiptune lose' 또는 'retro descending sad' 검색 → License 'CC0' 필터
    - why: 완성형 패배/실패 하강 스팅어 원소스. CC0로 크레딧 불필요.
  - **[Pixabay (Sound Effects) · search-query]** (Pixabay Content License — 상업 OK, 무크레딧)
    - locator: https://pixabay.com/sound-effects/search/ → '8bit lose' 또는 'game fail' 또는 'sad trombone retro' 검색
    - why: 라이선스 단순·안전하게 하강 패배음 확보. 리스크 제로 보강용.

#### `flow-draw-stinger` — 무승부 스팅어 [must]
- 트리거: 결과 오버레이 DRAW 표시
- 음색: 애매하게 맴도는 중립 2음, 갸웃하는 느낌
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴, 상업 사용 자유·무크레딧)
    - locator: jsfxr: 'Blip/Select' 프리셋 2개 생성 — 1음은 중간 피치, 2음은 반음/온음 위 또는 아래로 애매하게, 슬라이드 없이 고정. Sustain 0.1. 코드에서 두 블립을 짧은 간격으로 연속 재생 → 갸웃하는 중립 2음.
    - why: 해결되지 않는 중립 2음('음...?')을 두 블립 조합으로 재현. 애매하게 맴도는 느낌 정확.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴, 상업 자유·무크레딧)
    - locator: ChipTone: pulse 오실레이터로 2음 모티프(예: 장2도 왕복 또는 tritone 근처의 미해결 인터벌), 두 번째 음 살짝 wobble/vibrato. 한 클립으로 export
    - why: 미해결 인터벌 2음을 시각 편집으로 정교하게. '갸웃'하는 중립감을 톤으로 설계.
  - **[Freesound.org · search-query]** (CC0 필터 시 무크레딧)
    - locator: freesound: '8bit neutral' 또는 'chiptune question' 또는 'retro tie draw' / 'confused blip' 검색 → License 'CC0' 필터
    - why: 중립/의문형 짧은 2음 스팅어 원소스 탐색. DRAW는 드문 편이라 'question/neutral' 검색으로 대체 확보.
  - **[jfxr · generator-recipe]** (오픈소스 웹 툴, 생성음 자유 사용)
    - locator: jfxr: Square wave 2개 톤 — Frequency A와 A보다 살짝 다른 B(예: 440Hz→392Hz), 각 Sustain 80ms, 슬라이드 0. 두 wav를 코드에서 붙이거나 jfxr에서 순차 톤으로. 미묘한 톤 차이 조정에 슬라이더 활용
    - why: 미세 톤 차이가 핵심인 중립 2음에 슬라이더 세밀 조정이 강점. 갸웃 인터벌 정밀 튜닝.

### 게임 1–5 액션 (20)

#### `g1-tap` — 연타 입력 [must]
- 트리거: 게임1 keydown 매 연타마다
- 음색: 아주 짧고 탄력 있는 틱, 빠른 반복에 뭉치지 않게
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 생성 wav 상업 사용 자유, 무크레딧)
    - locator: jsfxr: 'Blip/Select' 프리셋 클릭 → waveform=Square, Env Attack=0.0, Env Sustain=0.02~0.03, Env Decay=0.04, Start Frequency≈0.42, Slide=0, no repeat/vibrato. 길이를 최대한 짧게(30~50ms) 잡아 60fps 연타에도 꼬리 안 남게. Export .wav 후 볼륨만 -3dB.
    - why: keydown마다 재생되는 아주 짧고 탄력 있는 틱. Blip은 원래 UI 커서용이라 반복에 뭉치지 않고 CPU/디코드 부담도 최소.
  - **[Kenney.nl (Digital Audio / Interface Sounds pack) · download-link]** (CC0 (퍼블릭 도메인), 무크레딧)
    - locator: https://kenney.nl/assets/digital-audio (팩 내 tone1.ogg~ / click 계열 짧은 원샷 중 30~60ms짜리 선택)
    - why: 완제 원샷이라 즉시 번들 가능. 짧은 digital tick 여러 개 들어있어 연타 피드백에 바로 매핑.
  - **[Freesound.org · search-query]** (CC0 항목만 선택 시 무크레딧 (CC-BY 항목은 크레딧 필요 — 필터 필수))
    - locator: Freesound: "8bit blip" 또는 "retro tick short" + License 필터=Creative Commons 0 로 정렬, duration<1s
    - why: 커뮤니티 원소스로 톤 변주 확보. CC0만 골라 라이선스 리스크 제거.

#### `g1-gauge-rise` — 게이지 상승 [must]
- 트리거: 게임1 속도 게이지 누적 상승 중
- 음색: 피치가 서서히 올라가는 상승 톤(연타에 연동)
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 생성 wav 상업 자유)
    - locator: jsfxr: 'Powerup' 프리셋 → waveform=Square, Slide(주파수 슬라이드)= +0.2~0.4 (양수), Env Sustain=0.15, Env Decay=0.2, Start Frequency≈0.3. 단, 게임 로직에서 '한 방'을 쓰지 말고 연타 인덱스에 따라 playbackRate를 sqrt 곡선으로 올려 pitch를 연동시키는 게 이상적. 짧은 blip 원샷 하나만 export하고 코드에서 rate 조절.
    - why: 게이지가 연타에 연동돼 서서히 오르는 상승감. playbackRate 스텝으로 재생하면 게이지 값과 정확히 동기화.
  - **[BeepBox · generator-recipe]** (MIT / 만든 곡 사용자 소유, 상업 사용 가능)
    - locator: beepbox.co: 8마디 짧게, 단일 채널에 반음씩 올라가는 상행 스케일(예 C-D-E-F-G-A-B-C) 16분음표로 찍고 wav export. 인게임에서 게이지 % 구간마다 다음 노트로 점프.
    - why: 실제 상행 아르페지오를 구간 매핑으로 재생하면 '차오르는' 느낌이 더 음악적. 레퍼런스 커비 톤과 결도 맞음.
  - **[Freesound.org · search-query]** (항목별 CC0(무크레딧)/CC-BY(크레딧 필요) — 필터로 구분)
    - locator: Freesound: "power up rising" 또는 "chiptune charge up" + License=CC0/CC-BY 필터
    - why: 연속 상승 원샷을 통째로 확보하는 대안. 게이지 지속 시간에 길이 맞는 것 선택.

#### `g1-gauge-max` — 게이지 최대 도달 [must]
- 트리거: 게임1 게이지 맥스 도달
- 음색: 터지는 강조 + 반짝, 최고조 알림
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 생성 wav 상업 자유)
    - locator: jsfxr: 'Powerup' 프리셋 → Start Frequency 높게(≈0.5), Arpeggio(Change Amount 양수 + Change Speed)로 반짝임 추가, Vibrato Depth 소량, Env Sustain=0.1 Env Decay=0.35. 'Mutate' 몇 번 눌러 터지는 느낌 튜닝.
    - why: 최고조 도달의 '팡+반짝' 강조. 아르페지오가 커비류 밝은 sparkle를 만듦.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료 웹 툴, 생성 사운드 상업 자유, 무크레딧)
    - locator: sfbgames.itch.io/chiptone: 짧은 스팅어로 상승 아르페지오 + 하이톤 벨 레이어, tail에 sparkle(high square 짧게 여러 발). wav export.
    - why: 시각 파형 편집으로 '터지는 강조 + 반짝'을 레이어링해 만들기 최적.
  - **[Kenney.nl (Music Jingles pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/music-jingles (짧은 positive jingle 중 1~1.5s 상승 마무리형 선택)
    - why: 완제 승리/달성 징글을 최고조 알림으로 재사용. 즉시 번들 가능.

#### `g2-clash` — 난타/칼 부딪침 [must]
- 트리거: 게임2 공격 입력·검격
- 음색: 카랑한 금속 클링, 8bit 검격 블립
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Hit/Hurt' 프리셋 → waveform=Square(또는 Noise 소량 믹스), Start Frequency 높게(≈0.5~0.6), Slide 약간 음수, Env Attack=0, Sustain=0.02, Decay=0.06. 아주 짧고 카랑하게.
    - why: 8bit 검격 블립. 짧고 high-freq라 카랑한 금속 클링 느낌.
  - **[Bfxr · generator-recipe]** (오픈소스, 생성음 로열티프리 상업 사용)
    - locator: bfxr.net: square 톤 + noise 채널 소량 레이어, high-pass filter로 금속성 강조, 짧은 decay. 'metallic clang' 목표로 mixer에서 두 파형 겹침.
    - why: sfxr보다 필터/믹서가 풍부해 진짜 금속 클링의 배음을 더 정교하게 낼 수 있음.
  - **[Freesound.org · search-query]** (CC0 선택 시 무크레딧)
    - locator: Freesound: "8bit sword" 또는 "retro clang metal" + License=CC0 필터, duration<1s
    - why: 검격 원소스 변주. 난타로 반복되므로 짧고 tail 없는 것 선택.

#### `g2-parry` — 패링 성공 [must]
- 트리거: 게임2 패링 성공 순간
- 음색: 번쩍이는 팅! 방어 성공 강조, 상쾌한 하이톤
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Blip/Select' 또는 'Powerup' 프리셋 → waveform=Square, Start Frequency 아주 높게(≈0.65), Slide 살짝 +, Arpeggio 소량으로 '팅↗' 상쾌한 하이톤, Decay=0.1.
    - why: 번쩍이는 방어 성공 강조음. 하이톤+짧은 상행이 '팅!' 청량감을 줌.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료, 상업 자유, 무크레딧)
    - locator: sfbgames.itch.io/chiptone: 짧은 벨/차임 톤 + 아주 짧은 슬라이드 업, 하이패스로 반짝. wav export.
    - why: 패링 특유의 번쩍 '팅'을 벨 톤으로 정밀 조형. 리포스트와 구분되는 순간적 하이라이트.
  - **[Freesound.org · search-query]** (CC0(무크레딧)/CC-BY(크레딧) — 필터 구분)
    - locator: Freesound: "parry" OR "ding sparkle" OR "8bit shine" + License=CC0/CC-BY 필터
    - why: 완제 하이톤 팅 원소스 확보 대안.

#### `g2-riposte` — 리포스트 반격 [must]
- 트리거: 게임2 패링 후 반격 발동
- 음색: 빠르게 되받아치는 슉-탁 콤보 톤, 통쾌함
- 후보:
  - **[Bfxr · generator-recipe]** (오픈소스, 로열티프리 상업 사용)
    - locator: bfxr.net: 두 이벤트 레이어 — (1) 짧은 whoosh(noise + 하강 슬라이드)로 '슉', (2) 바로 뒤 square hit로 '탁'. mixer로 0.05s 간격 겹쳐 슉-탁 콤보 한 파일 export.
    - why: 패링 후 되받아치는 2단 '슉-탁' 통쾌함. 레이어링이 필요해 bfxr 믹서가 적합.
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Laser/Shoot' 프리셋 → Slide 음수(하강)로 '슉' 만들고, 별도로 'Hit/Hurt' 하나 더 만들어 코드에서 40~60ms 뒤 연속 재생(2파일 시퀀스).
    - why: 두 원샷을 코드에서 짧게 이어 붙여 반격 콤보 톤 구성. 링크 썩음 없이 재현 가능.
  - **[Freesound.org · search-query]** (CC0 선택 시 무크레딧)
    - locator: Freesound: "8bit counter attack" OR "swipe hit combo" + License=CC0 필터
    - why: 반격 콤보 완제 원소스 대안.

#### `g2-knockback` — 넉백 [must]
- 트리거: 게임2 상대를 뒤로 밀어낼 때
- 음색: 묵직하게 밀리는 푸시 임팩트, 저역 통통
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Explosion' 프리셋 → 강도 줄이고 Start Frequency 낮게(≈0.2), Slide 음수, Env Sustain=0.05 Decay=0.15, Low-pass filter로 저역만 남겨 '푸시' 임팩트. Noise 소량.
    - why: 묵직하게 밀어내는 저역 통통. Explosion을 저역화하면 punch감.
  - **[Bfxr · generator-recipe]** (오픈소스, 상업 자유)
    - locator: bfxr.net: low square 'thud' + noise 짧게 레이어, low-pass 강하게, 짧은 pitch-down 슬라이드로 밀리는 느낌.
    - why: 저역 통통 push를 필터로 정교하게. 링아웃/피격과 구분되는 둔탁한 톤.
  - **[Kenney.nl (Impact Sounds pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/impact-sounds (짧은 low thud/impact 원샷 선택)
    - why: 완제 임팩트로 저역 넉백 즉시 대체 가능.

#### `g2-ringout` — 링아웃 낙사 [must]
- 트리거: 게임2 링 밖으로 떨어져 탈락
- 음색: 하강 휘파람 낙하 + 퐁 사라짐, 코믹 낙사
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Powerup' 프리셋에서 Slide를 강한 음수(하강)로 뒤집어 '휘~↓' 하강 휘파람, 끝에 'Pickup/Coin' 짧은 원샷으로 '퐁' 사라짐. 2파일 시퀀스 또는 bfxr에서 한 파일로 합침.
    - why: 코믹 낙사의 하강 휘파람 + 퐁. 하강 슬라이드가 떨어지는 감각을 직접 표현.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료, 상업 자유, 무크레딧)
    - locator: sfbgames.itch.io/chiptone: 긴 pitch-down 슬라이드(휘파람 톤) 그린 뒤 tail에 짧은 'pop' 배치. wav export.
    - why: 슬라이드 곡선을 시각적으로 그려 코믹한 낙하 휘파람을 만들기 좋음.
  - **[Freesound.org · search-query]** (CC0 선택 시 무크레딧)
    - locator: Freesound: "falling whistle" OR "cartoon fall pop" OR "8bit fall" + License=CC0 필터
    - why: 코믹 낙사 완제 원소스 대안.

#### `g2-combo` — 콤보 누적 [nice]
- 트리거: 게임2 연속 히트 콤보 카운트 증가
- 음색: 히트마다 반음씩 올라가는 콤보 상승 블립
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Blip/Select' 프리셋 짧은 원샷 1개 export → 코드에서 콤보 카운트마다 playbackRate를 반음씩(×2^(1/12)) 올려 재생. 별도 파일 불필요.
    - why: 히트마다 반음씩 오르는 콤보 상승 블립을 단일 파일 + rate 조절로 구현. 가장 가볍고 정확.
  - **[BeepBox · generator-recipe]** (MIT / 사용자 소유, 상업 사용 가능)
    - locator: beepbox.co: 반음 상행 스케일 12노트를 16분음표로 찍어 export 후, 콤보 N번째 노트만 잘라 재생하거나 인덱스 매핑.
    - why: 정확한 12평균율 반음 상승을 보장. 톤 일관성 좋음.
  - **[Freesound.org · search-query]** (CC0 선택 시 무크레딧)
    - locator: Freesound: "combo counter" OR "8bit rising blip" + License=CC0 필터
    - why: 완제 콤보 블립 세트 대안(nice-to-have라 저비용 확보).

#### `g3-hit-correct` — 리듬 정타 (+1) [must]
- 트리거: 게임3 정확한 시퀀스 키 입력 성공
- 음색: 찰떡 타이밍 딩! 밝은 정답 톤, 리듬 온비트감
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Pickup/Coin' 프리셋 → Arpeggio(Change Amount +) 유지, Start Frequency 높게, Env Decay=0.12, 밝은 '딩!'. 코인 특유의 2톤 상승이 온비트감을 줌.
    - why: 찰떡 타이밍 밝은 정답 톤. Pickup/Coin의 상행 2톤이 리듬 '딩!'에 딱.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료, 상업 자유, 무크레딧)
    - locator: sfbgames.itch.io/chiptone: 밝은 벨 톤 + 짧은 상행 아르페지오 2음, 온비트용으로 attack 즉각·decay 짧게. wav export.
    - why: 리듬 정타의 '온비트 딩'을 벨로 밝게 조형. 커비류 밝은 메이저 톤.
  - **[Kenney.nl (Digital Audio / Interface Sounds) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/interface-sounds (positive confirm/select 톤 중 밝은 상승형 선택)
    - why: 완제 confirm 톤을 정타 피드백으로 즉시 사용.

#### `g3-hit-wrong` — 리듬 오타 (−1) [must]
- 트리거: 게임3 잘못된 키·오타 입력
- 음색: 삑! 짧은 오답 부저, 리듬 흐트러진 느낌
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Hit/Hurt' 프리셋 → waveform=Square, Start Frequency 낮게(≈0.2), Slide 음수(하강)로 '삑↓', Env Decay=0.1, 살짝 buzzy하게(중복 파형/약간 노이즈).
    - why: 짧은 오답 부저 '삑!'. 하강 톤이 리듬 흐트러진 부정 피드백을 줌.
  - **[Bfxr · generator-recipe]** (오픈소스, 상업 자유)
    - locator: bfxr.net: 낮은 square + 약한 noise로 buzzer 톤, 짧은 하강 슬라이드, low-pass 소량. '삑' 부저 느낌.
    - why: 정타와 명확히 대비되는 어둡고 짧은 부저를 필터로 다듬기 좋음.
  - **[Freesound.org · search-query]** (CC0 선택 시 무크레딧)
    - locator: Freesound: "8bit error" OR "wrong buzzer retro" + License=CC0 필터, duration<1s
    - why: 오답 부저 완제 원소스 대안.

#### `g3-sequence-clear` — 시퀀스 완성 [nice]
- 트리거: 게임3 한 시퀀스 완주
- 음색: 상승 아르페지오 마무리, 리듬 프레이즈 종결감
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Powerup' 프리셋 → Arpeggio 활성(Change Amount +, Change Speed 빠르게)로 상행 아르페지오 마무리, Env Sustain=0.1 Decay=0.3.
    - why: 리듬 프레이즈 종결감의 상승 아르페지오. Powerup 아르페지오가 딱.
  - **[Bosca Ceoil (Blue) · generator-recipe]** (무료/오픈소스, 제작 곡 사용자 소유)
    - locator: boscaceoil.net: 4비트 짧은 상행 마무리 징글(도-미-솔-도) 작곡 후 wav export.
    - why: 짧은 종결 징글 스케치에 최적. 리듬 게임 프레이즈 끝맺음에 음악적.
  - **[Kenney.nl (Music Jingles pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/music-jingles (짧은 상승 완료형 jingle 선택)
    - why: 완제 상행 징글을 시퀀스 완주 보상음으로 즉시 사용.

#### `g4-rocket-fire` — 로켓 발사 [must]
- 트리거: 게임4 발사대에서 3방향 부채꼴 탄 발사
- 음색: 슉! 3연 발사 스윕, 살짝 겹쳐 부채꼴 느낌
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Laser/Shoot' 프리셋 → waveform=Saw/Square, Slide 음수(하강 슉), Env Decay=0.15. 원샷 1개 export 후 3발을 코드에서 20~30ms 간격·pitch 미세 차이로 겹쳐 부채꼴 3연발 연출.
    - why: 슉! 3방향 부채꼴 발사. 단일 laser를 짧은 스태거로 3번 겹치면 spread감.
  - **[Bfxr · generator-recipe]** (오픈소스, 상업 자유)
    - locator: bfxr.net: laser 톤 3개를 mixer에서 살짝 다른 피치로 겹쳐 한 파일 export → '스윕' 부채꼴 한 방에.
    - why: 레이어 있는 3연 발사를 한 파일로. 매번 3재생 부담 없이 spread 사운드.
  - **[Freesound.org · search-query]** (CC0 선택 시 무크레딧)
    - locator: Freesound: "8bit laser shoot" OR "retro spread shot" + License=CC0 필터
    - why: 발사 원소스 변주 대안.

#### `g4-dodge` — 회피 이동 [nice]
- 트리거: 게임4 좌우 이동으로 탄 회피
- 음색: 가벼운 스텝 스와이프, 슉 하는 이동 블립
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Blip/Select' 또는 'Jump' 프리셋 → waveform=Noise 소량+Square, 짧은 하강 슬라이드로 가벼운 '슉' 스와이프, Env Decay=0.06. 아주 가볍게.
    - why: 가벼운 스텝 스와이프 이동 블립. 짧고 가벼워 좌우 이동에 자주 쳐도 안 거슬림.
  - **[Kenney.nl (Interface / Digital Audio) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/interface-sounds (짧은 whoosh/swipe 톤 선택)
    - why: 완제 whoosh로 회피 이동음 즉시 대체(nice-to-have라 저비용).
  - **[Freesound.org · search-query]** (CC0 선택 시 무크레딧)
    - locator: Freesound: "8bit whoosh short" OR "retro swipe" + License=CC0 필터
    - why: 이동 블립 원소스 대안.

#### `g4-hit` — 피격 (HP−) [must]
- 트리거: 게임4 탄에 맞아 HP 감소
- 음색: 따끔한 히트 임팩트 + 짧은 데미지 톤
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Hit/Hurt' 프리셋 그대로 → Start Frequency 중간, Slide 음수 소량, Env Decay=0.12. 따끔한 데미지 톤.
    - why: Hit/Hurt는 이 용도의 표준 프리셋. 따끔한 임팩트+짧은 데미지 톤 즉석 생성.
  - **[Kenney.nl (Impact Sounds pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/impact-sounds (짧은 hit/hurt 원샷 선택)
    - why: 완제 임팩트로 피격음 즉시 번들.
  - **[Freesound.org · search-query]** (CC0 선택 시 무크레딧)
    - locator: Freesound: "8bit hurt" OR "retro damage hit" + License=CC0 필터, duration<1s
    - why: 피격 원소스 변주 대안.

#### `g4-invincible` — 무적 상태 [nice]
- 트리거: 게임4 피격 후 0.45s 무적 지속 중
- 음색: 반짝반짝 깜빡이는 얇은 루프 블링크음
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Blip/Select' 프리셋으로 아주 짧은 하이톤 blip 1개 export → 무적 0.45s 동안 코드에서 ~80ms 간격 반복 재생(깜빡임과 동기). 또는 Vibrato Depth/Speed를 크게 준 얇은 톤 하나를 루프.
    - why: 반짝반짝 깜빡이는 blink음. 짧은 blip을 무적 시간 동안 주기 반복하면 스프라이트 깜빡임과 싱크.
  - **[ChipTone (SFBGames) · generator-recipe]** (무료, 상업 자유, 무크레딧)
    - locator: sfbgames.itch.io/chiptone: 빠른 vibrato/tremolo가 걸린 얇은 하이톤을 0.4~0.5s 루프용으로 만들어 export.
    - why: 얇은 blink 루프음을 tremolo로 직접 조형. 깜빡임의 '반짝' 질감.
  - **[Freesound.org · search-query]** (CC0(무크레딧)/CC-BY(크레딧) — 필터 구분)
    - locator: Freesound: "8bit invincible" OR "blink loop chiptune" + License=CC0/CC-BY 필터
    - why: 무적/블링크 루프 완제 원소스 대안(nice-to-have).

#### `g4-ko` — HP 소진 KO [must]
- 트리거: 게임4 HP 3 모두 소진
- 음색: 폭발형 다운 + 하강 톤, 코믹 KO
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Explosion' 프리셋 → 뒤에 하강 톤 붙이기 위해 별도 'Powerup' 하강 슬라이드(음수) 원샷 하나 더 만들어 코드에서 폭발 직후 연속 재생. 코믹 다운.
    - why: 폭발형 다운 + 하강 톤의 코믹 KO. 폭발+하강 슬라이드 2단 구성.
  - **[Bfxr · generator-recipe]** (오픈소스, 상업 자유)
    - locator: bfxr.net: explosion(noise+low square) 뒤에 pitch-down 슬라이드를 mixer로 이어 한 파일 export. 코믹하게 tail 길게.
    - why: 폭발과 하강을 한 파일로 결합해 KO 스팅어 완성. 링아웃과 다른 '폭발형' 톤.
  - **[Kenney.nl (Impact Sounds pack) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/impact-sounds (강한 explosion/KO 원샷) + jsfxr 하강 톤 조합
    - why: 완제 폭발 임팩트를 KO 베이스로. 생성 하강 톤과 레이어.

#### `g5-turn` — 궤적 회전 [must]
- 트리거: 게임5 좌/우 90도 회전 입력
- 음색: 짧은 틱-슉 방향전환 블립, 딱 떨어지는 그리드감
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Blip/Select' 프리셋 → 아주 짧은 tick(Sustain=0.02, Decay=0.04), Start Frequency 중고음, Slide 살짝 +로 '틱-슉' 방향전환. 좌/우에 pitch 다르게 2버전.
    - why: 딱 떨어지는 그리드감의 짧은 방향전환 블립. 좌/우 pitch 구분도 쉬움.
  - **[Kenney.nl (Digital Audio / UI Audio) · download-link]** (CC0, 무크레딧)
    - locator: https://kenney.nl/assets/digital-audio (짧은 tick/click 톤 선택)
    - why: 완제 짧은 tick으로 회전 피드백 즉시 매핑.
  - **[Freesound.org · search-query]** (CC0 선택 시 무크레딧)
    - locator: Freesound: "8bit turn tick" OR "retro grid blip" + License=CC0 필터, duration<0.5s
    - why: 회전 블립 원소스 대안.

#### `g5-trail-loop` — 궤적 주행 루프 [nice]
- 트리거: 게임5 벽 생성하며 주행 중 지속
- 음색: 일정한 엔진 험/전자 드론 루프, 빌드 없이 균일
- 후보:
  - **[Bfxr · generator-recipe]** (오픈소스, 상업 자유)
    - locator: bfxr.net: 낮은 square/saw 지속 톤에 약한 vibrato, 필터로 전자 드론 험 만들어 이음매 없이 루프되게 시작/끝 볼륨 매칭 export. 볼륨 낮게(-12dB).
    - why: 빌드 없이 균일한 엔진 험/전자 드론 루프. 필터·vibrato로 사이버 주행 질감.
  - **[BeepBox · generator-recipe]** (MIT / 사용자 소유, 상업 사용 가능)
    - locator: beepbox.co: 단일 저음 노트를 1~2마디 지속(또는 미세 아르페지오 반복)으로 두고 loop 포인트 이음매 없게, wav/mp3 export. 큰 변화 없이 도는 드론.
    - why: '빌드 없이 일정 에너지로 도는' 요구에 정확히 부합하는 루프 톤 제작.
  - **[OpenGameArt.org (OGA) · search-query]** (CC0 필터 시 무크레딧 (항목별 라이선스 개별 확인 필수))
    - locator: opengameart.org: "engine loop" OR "electronic drone loop 8bit" → License 필터 CC0만
    - why: 완제 루프 드론 확보 대안. seamless loop 표기 항목 선택.

#### `g5-crash` — 벽 충돌사 [must]
- 트리거: 게임5 벽·궤적에 충돌 탈락
- 음색: 지직 튀는 전자 폭발 + 짧은 다운, 사이버 크래시
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT tool / 상업 자유)
    - locator: jsfxr: 'Explosion' 프리셋 → Noise 강조, high-pass로 '지직' 튀는 전자 질감, 끝에 짧은 하강. Env Decay=0.2. 'Mutate'로 디지털 크래시 튜닝.
    - why: 지직 튀는 전자 폭발 + 짧은 다운. 노이즈 강조가 사이버 크래시감.
  - **[Bfxr · generator-recipe]** (오픈소스, 상업 자유)
    - locator: bfxr.net: noise burst + bit-crush/사각파 글리치 레이어, high-pass, 짧은 pitch-down. 'digital crash' 목표.
    - why: 글리치/비트크러시로 Tron식 사이버 크래시를 정교하게. 폭발과 지직을 레이어.
  - **[Freesound.org · search-query]** (CC0 선택 시 무크레딧)
    - locator: Freesound: "8bit explosion glitch" OR "digital crash retro" + License=CC0 필터, duration<1.5s
    - why: 전자 크래시 완제 원소스 대안.

### 게임 6–10 액션 (18)

#### `g6-jump` — 점프 [must]
- 트리거: 게임6 공룡 점프
- 음색: 통통 튀는 보잉 점프 블립, 상승 피치
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴(chr15m); 생성 .wav 상업 사용 자유, 크레딧 불필요)
    - locator: jsfxr: 'Jump' 프리셋 클릭 → Wave=Square, Attack=0, Sustain≈0.05, Decay≈0.15, Start Frequency≈0.35, 'Slide'를 +0.25~+0.35(양수)로 올려 통통 튀는 상승 피치, 'Repeat Speed' 0. Export WAV.
    - why: 레트로 보잉 점프는 상승 슬라이드가 핵심 — Jump 프리셋에 양의 슬라이드만 주면 바로 커비류 통통 점프 블립.
  - **[Kenney.nl (Digital Audio / Interface Sounds pack) · download-link]** (CC0 (퍼블릭 도메인, 무크레딧))
    - locator: https://kenney.nl/assets/interface-sounds
    - why: 즉시 쓸 완제 UI/블립 세트에 짧은 상승 블립 다수 — CC0라 리스크 0, jump 대체음 baseline.
  - **[Freesound.org · search-query]** (항목별 CC0(필터 적용 시 무크레딧))
    - locator: Freesound: "8bit jump" filter license:"Creative Commons 0"
    - why: 커뮤니티 8bit 점프 원샷 다수, CC0 필터로 크레딧 없이 확보 가능.

#### `g6-duck` — 숙이기 [must]
- 트리거: 게임6 숙이기(슬라이드) 입력
- 음색: 짧게 낮아지는 슉 다운 톤
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴; 생성 .wav 상업 사용 자유)
    - locator: jsfxr: 'Blip/Select' 프리셋 → Wave=Square, Sustain≈0.03, Decay≈0.1, Start Frequency≈0.45, 'Slide'를 −0.3(음수)로 내려 짧게 낮아지는 슉-다운 톤. 아주 짧게 export.
    - why: 숙이기=하강 톤이라 Blip에 음의 슬라이드만 주면 짧은 슉-다운이 완성 — 점프(g6-jump)와 대칭 톤.
  - **[Bfxr · generator-recipe]** (오픈소스(increpare); 로열티프리 상업 사용)
    - locator: bfxr: 'Blip Select' 시드 생성 후 Slide(피치 하강) 음수, Duration 짧게, Low-pass 약간 걸어 부드러운 다운.
    - why: 필터가 있어 하강 슉 소리를 더 부드럽게 다듬을 수 있음.
  - **[Pixabay (Sound Effects) · search-query]** (Pixabay Content License(상업 OK, 무크레딧))
    - locator: Pixabay: "8bit down" 또는 "retro swoosh down"
    - why: 라이선스 단순·안전한 하강 스우시류 확보용 보강 소스.

#### `g6-obstacle-spawn` — 장애물 생성 [nice]
- 트리거: 게임6 상대가 선인장·새 장애물 소환
- 음색: 쏙 나타나는 팝 + 새는 짧은 날갯짓 플러터
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 팝=‘Pickup/Coin’ 프리셋을 아주 짧게(Decay≈0.08, 고주파). 새 날갯짓=‘Hit/Hurt’ 대신 Wave=Noise + Repeat Speed 높여 짧은 플러터 반복. 두 개를 각각 export.
    - why: ‘쏙 나타나는 팝’은 짧은 Pickup, ‘새 플러터’는 Noise+Repeat로 별도 생성해 조합하면 캐릭터 두 종류를 정확히 커버.
  - **[Kenney.nl (Interface Sounds / UI Audio pack) · download-link]** (CC0(무크레딧))
    - locator: https://kenney.nl/assets/ui-audio
    - why: 짧은 pop/appear 블립이 팩에 포함 — 장애물 등장 팝 baseline으로 즉시 사용.
  - **[Freesound.org · search-query]** (항목별 CC0(필터 시 무크레딧))
    - locator: Freesound: "8bit pop" + 별도로 "bird wing flap chiptune" (license:CC0 필터)
    - why: 선인장 팝과 새 날갯짓 두 원소스를 검색으로 각각 확보 — nice 우선순위라 가볍게 채우기 좋음.

#### `g6-crash` — 장애물 충돌 [must]
- 트리거: 게임6 장애물에 부딪혀 탈락
- 음색: 퍽! 코믹 충돌 + 하강 다운 톤
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Explosion' 프리셋 → Wave=Noise, Decay≈0.25, 그리고 'Slide' 음수로 하강 톤 얹기(퍽! 뒤 다운). 저역 강조 위해 Start Frequency 낮춤.
    - why: ‘퍽! + 하강 다운’ = Explosion 노이즈에 음의 슬라이드를 더하면 코믹 충돌+낙담 톤이 한 번에.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리 상업 사용)
    - locator: bfxr: 'Explosion' 시드 + Mixer로 Square 레이어 추가해 피치 하강(코믹 ‘꽝→삐용’), Bit Crush 살짝.
    - why: 레이어링으로 ‘코믹 충돌’ 특유의 노이즈+음정 하강을 정교하게 조합.
  - **[Kenney.nl (Impact Sounds pack) / Freesound · search-query]** (Kenney CC0 / Freesound 항목별 CC0)
    - locator: https://kenney.nl/assets/impact-sounds ; 보강: Freesound "8bit crash hit" license:CC0
    - why: 완제 임팩트 팩으로 퍽 임팩트 baseline 확보, Freesound로 8bit 톤 변형 보강.

#### `g7-flap` — 플래피 점프 [must]
- 트리거: 게임7 점프로 높이 조절할 때마다
- 음색: 가벼운 플랩 블립, 매 탭마다 상승 어택
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Jump' 프리셋을 매우 가볍게 → Sustain≈0.02, Decay≈0.06, Start Frequency 중간, 'Slide' 살짝 +. 탭마다 반복 재생용으로 짧고 어택 명확하게. (미세 변주 2~3개 export 권장)
    - why: 매 탭 상승 어택의 가벼운 플랩 = 짧은 Jump 블립. 변주 여러 개면 연타 시 단조로움 방지.
  - **[jfxr · generator-recipe]** (오픈소스 웹 툴; 생성음 자유)
    - locator: jfxr: 슬라이더로 Duration 0.05s, Frequency 상승 약간, Square, 미세 톤차 3종 생성.
    - why: 탭마다 울리는 반복 SFX라 미세 톤차 변주가 중요 — 슬라이더 세밀 조정에 특화.
  - **[Freesound.org · search-query]** (항목별 CC0(필터 시 무크레딧))
    - locator: Freesound: "flappy flap" 또는 "8bit flap" license:CC0
    - why: 플래피버드류 플랩 원샷 다수, CC0로 확보 가능.

#### `g7-shoot` — 수평 사격 [must]
- 트리거: 게임7 수평 발사
- 음색: 팡! 짧은 총격 블립, 경쾌한 8bit 샷
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Laser/Shoot' 프리셋 → Wave=Square/Saw, Decay≈0.1, 'Slide' 음수(피치 하강 팡), 경쾌하게 짧게 export.
    - why: 팡! 8bit 샷의 정석 프리셋 — Laser 하나로 경쾌한 수평 발사음 즉시 완성.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리 상업 사용)
    - locator: bfxr: 'Laser/Shoot' 랜덤 후 Slide/Delta Slide로 톤 다듬고 Duration 짧게.
    - why: 발사음 톤을 밝고 경쾌하게 세부 조정, 변주 확보.
  - **[Kenney.nl (Sci-Fi Sounds / Digital Audio pack) · download-link]** (Kenney CC0 / Freesound 항목별 CC0)
    - locator: https://kenney.nl/assets/sci-fi-sounds ; 보강 Freesound "8bit laser shot" license:CC0
    - why: 완제 레이저/샷 세트로 baseline 확보, 무크레딧.

#### `g7-hit` — 피격 [must]
- 트리거: 게임7 상대 탄에 피격(승패 결정)
- 음색: 따끔 히트 + 짧은 다운, 결정타 강조
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Hit/Hurt' 프리셋 → Wave=Square+Noise 느낌, Decay≈0.12, 'Slide' 음수로 짧은 다운 얹어 결정타 강조.
    - why: 승패 결정타라 Hit/Hurt에 하강을 더해 ‘따끔+짧은 다운’ 강조 — 프리셋 그대로 적중.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리)
    - locator: bfxr: 'Hit/Hurt' 시드 + Bit Crush 약간, Sustain Punch 올려 임팩트감.
    - why: Punch 파라미터로 결정타의 타격감을 강화.
  - **[Freesound.org · search-query]** (항목별 CC0(필터 시 무크레딧))
    - locator: Freesound: "8bit hit" 또는 "retro hurt" license:CC0
    - why: 8bit 히트 원샷 다수, CC0 확보 가능.

#### `g7-magma-death` — 마그마 낙사 [must]
- 트리거: 게임7 마그마로 추락 사망
- 음색: 치익- 타는 듯한 낙하 + 소멸음, 뜨거운 코믹 사망
- 후보:
  - **[jsfxr (sfxr.me) · generator-recipe]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Explosion' 프리셋을 베이스로 Wave=Noise, Decay 길게(≈0.4), 'Slide' 강한 음수로 추락 하강 + Low-pass로 ‘치익-’ 소멸감. 소멸음은 Repeat Speed 살짝.
    - why: 치익 타는 낙하+소멸 = 긴 노이즈 감쇠 + 강한 하강 슬라이드 조합으로 코믹 사망 톤 구현.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리)
    - locator: bfxr: Noise 기반 시드에 Delta Slide(가속 하강), Low-pass Cutoff Sweep 하강으로 ‘치익 타들어가며 추락’ 레이어.
    - why: 필터 스윕이 있어 ‘뜨겁게 타는 소멸’ 뉘앙스를 정교하게 — 단일 프리셋으론 안 나오는 뉘앙스.
  - **[Freesound.org · search-query]** (Freesound 항목별 CC0 / Pixabay Content License)
    - locator: Freesound: "sizzle burn" + "8bit death fall" (각각) license:CC0; 보강 Pixabay "sizzle"
    - why: 실사 지글 지글(sizzle)을 8bit 낙하음과 레이어하면 ‘뜨거운 코믹 사망’ 질감 강화.

#### `g8-cannon-fire` — 대포 발사 [must]
- 트리거: 게임8 좌우 대포 발사
- 음색: 퉁! 묵직한 발사 임팩트, 통통 튀는 저역
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Explosion' 프리셋 → Start Frequency 낮게, Wave=Noise+저역, Decay≈0.2, 'Slide' 살짝 음수. 통통 튀는 저역 위해 Low-pass 약간 열고 punch.
    - why: 퉁! 묵직한 저역 발사 = Explosion을 저주파로 튜닝. 통통 튀는 저역 임팩트 확보.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리)
    - locator: bfxr: 'Explosion' 시드 + Mixer로 Sine/Triangle 저역 레이어 추가, Sustain Punch↑로 ‘퉁’ 바운스.
    - why: 레이어 있는 발사음(노이즈+저역 바운스)은 bfxr 믹서가 최적.
  - **[Kenney.nl (Impact Sounds pack) / Freesound · search-query]** (Kenney CC0 / Freesound 항목별 CC0)
    - locator: https://kenney.nl/assets/impact-sounds ; 보강 Freesound "cannon 8bit" license:CC0
    - why: 묵직한 임팩트 baseline 확보, 8bit 변형은 Freesound로.

#### `g8-monster-hit` — 몬스터 격추 [must]
- 트리거: 게임8 몰려오는 몬스터 격파
- 음색: 퐁! 귀여운 폭파 + 반짝 소멸, 처치 쾌감
- 후보:
  - **[jsfxr (sfxr.me) · generator-recipe]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Explosion' 작게(Decay≈0.12) + 'Pickup/Coin' 반짝을 짧게 겹쳐 export → ‘퐁! 반짝 소멸’. 각각 생성 후 게임에서 동시 재생 or 편집기에서 합침.
    - why: 귀여운 폭파+반짝 = 작은 Explosion + Pickup 반짝의 2레이어가 처치 쾌감을 정확히 구현.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리)
    - locator: bfxr: 작은 Explosion 시드 + Arpeggio/Change(반짝 상승) 켜서 ‘퐁→반짝’을 한 사운드로.
    - why: Change/Arpeggio로 소멸 반짝을 한 방에 붙여 단일 원샷 생성.
  - **[Kenney.nl (Digital Audio pack) / Freesound · search-query]** (Kenney CC0 / Freesound 항목별 CC0)
    - locator: https://kenney.nl/assets/digital-audio ; 보강 Freesound "8bit explosion cute" license:CC0
    - why: 귀여운 8bit 폭파 완제음 확보, 무크레딧.

#### `g8-cannon-damaged` — 대포 피격 [must]
- 트리거: 게임8 몬스터가 대포에 도달·피격
- 음색: 쿵 하는 데미지 임팩트 + 경고 톤
- 후보:
  - **[jsfxr (sfxr.me) · generator-recipe]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Hit/Hurt' 프리셋을 저역으로(Start Freq 낮게, Decay≈0.2) ‘쿵’ 데미지 + 별도로 Square 저음 경고 톤(짧은 삐-) 생성해 조합.
    - why: 쿵 데미지 임팩트+경고 톤 = 저역 Hit + 경고 블립의 조합으로 위기감 전달.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리)
    - locator: bfxr: 저역 Hit 시드 + Vibrato/Square 경고 톤 레이어, Bit Crush로 대미지 질감.
    - why: 데미지 임팩트와 경고 톤을 레이어로 묶어 한 원샷으로.
  - **[Freesound.org · search-query]** (항목별 CC0(필터 시 무크레딧))
    - locator: Freesound: "8bit damage" 또는 "retro alarm warning" license:CC0
    - why: 대미지/경고 8bit 원소스를 검색으로 확보.

#### `g8-monster-approach` — 몬스터 접근 [nice]
- 트리거: 게임8 몬스터 무리가 몰려오는 중 반복
- 음색: 조여오는 낮은 반복 웨이브 루프, 균일 긴장감
- 후보:
  - **[BeepBox · generator-recipe]** (MIT(오픈소스); 제작 곡 사용자 소유, 상업 사용 가능)
    - locator: beepbox.co: 저음 베이스 채널로 2~4마디 낮은 반복 모티프(반음 왕복/펄스) 작성 → 기승전결 없이 균일 루프로 무한 반복, wav export. 접근 강도에 따라 재생 피치/템포만 조절.
    - why: ‘조여오는 균일 긴장 루프’는 원샷이 아니라 loop BGM — BeepBox로 빌드/드롭 없는 반복 텐션 루프를 직접 작곡(사용자 음악 방향과 일치).
  - **[jfxr / Bfxr · generator-recipe]** (오픈소스; 로열티프리)
    - locator: bfxr: 낮은 Square 펄스 + 느린 Vibrato, 짧은 톤을 게임에서 일정 간격 루프 재생(다가올수록 간격 단축).
    - why: 단일 저역 펄스를 코드로 반복 재생하면 웨이브 접근감 — nice 우선순위라 저비용 구현.
  - **[Freesound.org · search-query]** (항목별 CC0(필터 시 무크레딧))
    - locator: Freesound: "tension drone loop" 또는 "8bit menace loop" license:CC0
    - why: 완제 텐션 루프를 배경 반복용으로 확보.

#### `g9-cursor-move` — 커서 순회 틱 [must]
- 트리거: 게임9 커서가 격자 칸을 이동할 때마다
- 음색: 짧고 규칙적인 틱, 메트로놈처럼 또렷
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Blip/Select' 프리셋을 극도로 짧게 → Sustain≈0.01, Decay≈0.03, Square, 슬라이드 0. 메트로놈처럼 또렷한 단발 틱. export.
    - why: 규칙적 틱=아주 짧은 Blip. 감쇠 최소화하면 메트로놈처럼 또렷 — 커서 이동마다 반복해도 피로 없음.
  - **[jfxr · generator-recipe]** (오픈소스 웹 툴; 생성음 자유)
    - locator: jfxr: Duration 0.02s, 단일 주파수 클릭톤, Square. 미세 톤차 2종.
    - why: 미세 톤차가 필요한 반복 틱에 슬라이더 세밀 조정 특화.
  - **[Kenney.nl (Interface / UI Audio pack) · download-link]** (CC0(무크레딧))
    - locator: https://kenney.nl/assets/ui-audio
    - why: UI tick/blip 완제음이 팩에 있어 커서 이동 틱 baseline으로 즉시 사용.

#### `g9-place-stone` — 착수 [must]
- 트리거: 게임9 자기 키로 돌 놓기
- 음색: 탁! 돌 놓는 경쾌한 우드/블립 착수음
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Pickup/Coin' 또는 'Blip' 프리셋을 짧게 + 살짝의 클릭감(Attack 0, Decay≈0.08, Start Freq 중간, 슬라이드 살짝 음수)으로 ‘탁!’ 착수 블립.
    - why: 돌 놓는 경쾌한 착수음 = 짧은 Pickup/Blip에 살짝의 하강 클릭 — 우드 블립 느낌 즉석 제작.
  - **[Kenney.nl (Interface Sounds pack) · download-link]** (CC0(무크레딧))
    - locator: https://kenney.nl/assets/interface-sounds
    - why: click/select 완제음으로 ‘탁’ 착수 baseline.
  - **[Freesound.org · search-query]** (항목별 CC0(필터 시 무크레딧))
    - locator: Freesound: "wood click" 또는 "go stone place" license:CC0
    - why: 실제 바둑/오목 돌 놓는 우드 클릭 원소스로 질감 강화.

#### `g9-three-win` — 3목 완성 [must]
- 트리거: 게임9 3목 라인 완성 승리
- 음색: 연결되는 3음 상승 + 반짝 팡파르, 라인 완성감
- 후보:
  - **[jsfxr (sfxr.me) · jsfxr-preset]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Powerup' 프리셋 → 상승 아르페지오/슬라이드 켜서 3음 상승 반짝. Repeat/Arpeggio 값으로 3연음 느낌 만들고 밝게 export.
    - why: ‘연결되는 3음 상승+반짝’은 Powerup 프리셋의 상승 아르페지오가 정확히 맞음 — 라인 완성 팡파르 즉석.
  - **[Bosca Ceoil (Blue) / BeepBox · generator-recipe]** (무료/오픈소스; 제작 곡 사용자 소유, 상업 사용 가능)
    - locator: boscaceoil.net 또는 beepbox.co: 메이저키 3음 상승(도-미-솔) + 상단 반짝 1음의 0.5~1초 승리 징글 작곡, wav export.
    - why: 짧은 승리 징글은 작곡 툴이 톤 컨트롤 우수 — 커비류 밝은 팡파르로 다듬기 좋음.
  - **[Kenney.nl (Music Jingles pack) / Freesound · search-query]** (Kenney CC0 / Freesound 항목별 CC0)
    - locator: https://kenney.nl/assets/music-jingles ; 보강 Freesound "8bit win fanfare" license:CC0
    - why: 완제 승리 징글 확보, 무크레딧 baseline.

#### `g10-pull` — 줄 당기기 [must]
- 트리거: 게임10 두 키 교대 연타로 밧줄 당길 때마다
- 음색: 영차- 하는 짧은 텐션 그런트/블립, 교대감 있게
- 후보:
  - **[jsfxr (sfxr.me) · generator-recipe]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 'Blip' 기반 짧은 텐션 톤 2종(A=약간 높은 피치, B=약간 낮은 피치)을 만들어 두 키 교대마다 번갈아 재생 → 영차-영차 교대감. Decay≈0.06.
    - why: 교대 연타는 A/B 두 톤을 번갈아 울려야 ‘영차’ 리듬감 — 단일음이면 단조로움. 2변주 생성이 핵심.
  - **[Bfxr · generator-recipe]** (오픈소스; 로열티프리)
    - locator: bfxr: 짧은 Square 톤 + 미세 Pitch Jump/Vibrato로 ‘끙’ 텐션감, 2~3변주 export.
    - why: 당김 그런트의 텐션 뉘앙스와 변주를 세밀하게.
  - **[Freesound.org · search-query]** (항목별 CC0(필터 시 무크레딧))
    - locator: Freesound: "8bit tick" 또는 "effort grunt short" license:CC0
    - why: 당김 틱/짧은 그런트 원소스를 교대 재생용으로 확보.

#### `g10-rope-tension` — 밧줄 팽팽함 [nice]
- 트리거: 게임10 밧줄이 한쪽으로 쏠려 긴장 고조 중
- 음색: 삐걱대는 로프 텐션 루프, 우세에 따라 피치 변화
- 후보:
  - **[Freesound.org · search-query]** (항목별 CC0(필터 시 무크레딧))
    - locator: Freesound: "rope creak" 또는 "rope tension strain loop" license:CC0
    - why: 삐걱대는 로프 텐션은 실사 크릭 루프가 가장 사실적 — 우세에 따라 재생 피치만 shift.
  - **[jfxr / Bfxr · generator-recipe]** (오픈소스; 생성음 자유)
    - locator: bfxr/jfxr: 낮은 노이즈+느린 Vibrato로 ‘삐걱’ 톤 만들고 게임에서 우세도에 따라 playbackRate로 피치 상승. loop 재생.
    - why: 8bit 톤 일관성을 위한 생성기 대안 — 코드로 피치 변조하면 ‘쏠릴수록 팽팽’ 표현.
  - **[BeepBox / Pixabay · search-query]** (BeepBox MIT(사용자 소유) / Pixabay Content License(무크레딧))
    - locator: beepbox.co로 저역 긴장 루프 작곡 ; 또는 Pixabay: "rope creak" / "tension loop"
    - why: nice 우선순위라 저비용으로 텐션 배경 루프를 확보·보강.

#### `g10-win-line` — 완승선 도달 [must]
- 트리거: 게임10 완승선까지 끌어와 승리
- 음색: 쭉 끌려오는 스윕 + 승리 팡파르, 넘어뜨림 쾌감
- 후보:
  - **[jsfxr (sfxr.me) · generator-recipe]** (MIT 툴; 생성 .wav 자유)
    - locator: jsfxr: 스윕='Powerup' 프리셋의 상승 슬라이드로 ‘쭉 끌려오는’ 스윕 생성 + 이어서 밝은 승리 스팅어. 두 요소 조합.
    - why: 쭉 끌려오는 스윕 = Powerup 상승 슬라이드, 뒤에 팡파르 붙이면 넘어뜨림 쾌감.
  - **[Bosca Ceoil (Blue) / BeepBox · generator-recipe]** (무료/오픈소스; 제작 곡 사용자 소유)
    - locator: boscaceoil.net 또는 beepbox.co: 상승 스윕 후 메이저키 승리 팡파르 1~1.5초 작곡, wav export.
    - why: 결과 승리 스팅어는 작곡 툴로 커비류 밝은 팡파르를 톤 맞춰 제작.
  - **[Kenney.nl (Music Jingles pack) / Freesound · search-query]** (Kenney CC0 / Freesound 항목별 CC0)
    - locator: https://kenney.nl/assets/music-jingles ; 보강 Freesound "8bit victory sweep" license:CC0
    - why: 완제 승리 징글/스윕 baseline, 무크레딧.

---
_생성 URL은 공식 도메인 랜딩/카테고리 페이지. 개별 애셋 라이선스는 해당 페이지에서 직접 확인. 검증 안 된 딥링크는 지어내지 않았음._
