#!/usr/bin/env python3
"""워크플로 journal + agent transcript → 갤러리용 data.js 재구성."""
import json, re, sys, os, glob

TD = "/Users/siheom-yong/.claude/projects/-Users-siheom-yong-programming-madpump/bc3653a1-a113-482d-a8be-5f2b4f681ce2/subagents/workflows/wf_c09a2b64-52b"
OUT = "/tmp/claude-501/-Users-siheom-yong-programming-madpump/bc3653a1-a113-482d-a8be-5f2b4f681ce2/scratchpad/data.js"
GAME_NAMES = {4:'공룡 달리기',5:'몬스터 포격전',6:'펌프',7:'스피드 오목',8:'마그마 총격 듀얼',9:'줄다리기',10:'라이트 사이클'}

RE_DESIGN = re.compile(r'게임\s*(\d+)\s*"[^"]+"의\s*컨셉\s*#(\d+)/10')
RE_IDEATE = re.compile(r'게임\s*(\d+)\s*"[^"]+"\s*의\s*아케이드')

def sanitize_svg(s):
    """CDATA/‹svg› 래퍼 제거 — <svg viewBox> 안에 그대로 들어갈 내부 마크업만 남긴다."""
    if not s: return s
    s = s.strip()
    # CDATA
    s = re.sub(r'^\s*<!\[CDATA\[', '', s)
    s = re.sub(r'\]\]>\s*$', '', s)
    s = s.replace('<![CDATA[', '').replace(']]>', '')
    # 실수로 감싼 <svg ...> ... </svg>
    s = re.sub(r'^\s*<svg\b[^>]*>', '', s)
    s = re.sub(r'</svg>\s*$', '', s)
    return s.strip()

def first_user_prompt(agent_id):
    fp = os.path.join(TD, f"agent-{agent_id}.jsonl")
    if not os.path.exists(fp): return None
    for line in open(fp):
        try: d = json.loads(line)
        except: continue
        if d.get('type') == 'user':
            msg = d.get('message', {})
            c = msg.get('content')
            if isinstance(c, str): return c
            if isinstance(c, list):
                return " ".join(p.get('text','') for p in c if isinstance(p,dict))
    return None

# journal: agentId -> latest result
results_by_agent = {}
jp = os.path.join(TD, "journal.jsonl")
for line in open(jp):
    try: d = json.loads(line)
    except: continue
    if d.get('type') == 'result' and 'result' in d:
        aid = d.get('agentId')
        if aid: results_by_agent[aid] = d['result']

ideate = {}   # game -> concepts[]
designs = {}  # game -> {conceptId -> design}
unmatched = 0
for aid, res in results_by_agent.items():
    prompt = first_user_prompt(aid) or ""
    md = RE_DESIGN.search(prompt)
    mi = RE_IDEATE.search(prompt)
    if md:
        g, cid = int(md.group(1)), int(md.group(2))
        designs.setdefault(g, {})[cid] = res
    elif mi:
        g = int(mi.group(1))
        if isinstance(res, dict) and 'concepts' in res:
            ideate[g] = res['concepts']
    else:
        unmatched += 1

out_results = []
summary = []
for g in [4,5,6,7,8,9,10]:
    concepts = ideate.get(g, [])
    dmap = designs.get(g, {})
    dl = []
    for cid in sorted(dmap.keys()):
        d = dict(dmap[cid])
        d['conceptId'] = cid
        d['brief'] = concepts[cid-1] if 0 < cid <= len(concepts) else {}
        d['finalSvg'] = sanitize_svg(d.get('finalSvg',''))
        d['firstDraftSvg'] = sanitize_svg(d.get('firstDraftSvg',''))
        dl.append(d)
    out_results.append({'game':g, 'name':GAME_NAMES[g], 'concepts':concepts, 'designs':dl})
    finals = [d for d in dl if (d.get('finalSvg') or '').strip()]
    sims = [d['qaLog'][-1]['similarityScore'] for d in dl if d.get('qaLog')]
    avg = round(sum(sims)/len(sims),1) if sims else '-'
    summary.append(f"G{g} {GAME_NAMES[g]}: {len(dl)}종 (svg有 {len(finals)}) 최종유사도평균 {avg}")

data = {'results': out_results, 'total': sum(len(r['designs']) for r in out_results)}
with open(OUT, 'w') as f:
    f.write("window.__DATA=")
    json.dump(data, f, ensure_ascii=False)
    f.write(";\n")

print("=== BUILD SUMMARY ===")
print(f"agents with result: {len(results_by_agent)} | unmatched: {unmatched}")
for s in summary: print(s)
print(f"total designs: {data['total']} | wrote {OUT}")
