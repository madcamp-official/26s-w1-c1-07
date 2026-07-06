#!/usr/bin/env python3
"""refine 워크플로 결과 + 재사용 원본 → v2data.js (이미지 전용 갤러리)."""
import json, re, os, sys, glob

SP = "/tmp/claude-501/-Users-siheom-yong-programming-madpump/bc3653a1-a113-482d-a8be-5f2b4f681ce2/scratchpad"
TASK_OUT = "/private/tmp/claude-501/-Users-siheom-yong-programming-madpump/bc3653a1-a113-482d-a8be-5f2b4f681ce2/tasks/wjq0z51ay.output"
REFINE_TD = "/Users/siheom-yong/.claude/projects/-Users-siheom-yong-programming-madpump/bc3653a1-a113-482d-a8be-5f2b4f681ce2/subagents/workflows/wf_825f41e5-27a"

GAME_NAMES = {4:'공룡 달리기',5:'몬스터 포격전',6:'펌프',7:'스피드 오목',8:'마그마 총격 듀얼',9:'줄다리기',10:'라이트 사이클'}

def sanitize(s):
    if not s: return s
    s=s.strip()
    s=re.sub(r'^\s*<!\[CDATA\[','',s); s=re.sub(r'\]\]>\s*$','',s)
    s=s.replace('<![CDATA[','').replace(']]>','')
    s=re.sub(r'^\s*<svg\b[^>]*>','',s); s=re.sub(r'</svg>\s*$','',s)
    return s.strip()

def load_refine():
    """key -> finalSvg. 우선 task output(JSON), 실패 시 journal+transcript 매핑."""
    m={}
    # (a) task output file
    if os.path.exists(TASK_OUT):
        txt=open(TASK_OUT,encoding='utf-8').read().strip()
        try:
            j=json.loads(txt)
            for r in j.get('results',[]):
                if r.get('key'): m[r['key']]=sanitize(r.get('finalSvg',''))
            if m: return m
        except Exception as e:
            print("task output parse failed:", e)
    # (b) journal + transcript fallback
    jr={}
    jp=os.path.join(REFINE_TD,'journal.jsonl')
    if os.path.exists(jp):
        for line in open(jp):
            try: d=json.loads(line)
            except: continue
            if d.get('type')=='result' and 'result' in d and d.get('agentId'):
                jr[d['agentId']]=d['result']
    for aid,res in jr.items():
        fp=os.path.join(REFINE_TD,f'agent-{aid}.jsonl')
        prompt=''
        if os.path.exists(fp):
            for line in open(fp):
                try: dd=json.loads(line)
                except: continue
                if dd.get('type')=='user':
                    c=dd.get('message',{}).get('content','')
                    prompt=c if isinstance(c,str) else ' '.join(p.get('text','') for p in c if isinstance(p,dict))
                    break
        key=guess_key(prompt)
        if key and isinstance(res,dict): m[key]=sanitize(res.get('finalSvg',''))
    return m

def guess_key(p):
    g=re.search(r'게임\s*(\d+)', p); game=int(g.group(1)) if g else None
    if game==9:
        mm=re.search(r'픽토그램 버전 (\d+):', p)
        if mm: return f'g9-{int(mm.group(1)):02d}'
    if game==5:
        mm=re.search(r'다른 버전 (\d+)', p)
        if mm: return f'g5-3.{mm.group(1)}'
    if game==6:
        mm=re.search(r'버전 9\.(\d)', p)
        if mm: return f'g6-9.{mm.group(1)}'
    if game==8:
        mm=re.search(r'씬의 \*\*버전 (\d+)', p) or re.search(r'버전 (\d+)', p)
        if mm: return f'g8-v{mm.group(1)}'
    if game==10:
        mm=re.search(r'씬의 \*\*버전 (\d+)', p) or re.search(r'버전 (\d+)', p)
        if mm: return f'g10-v{mm.group(1)}'
    return None

B=json.load(open(os.path.join(SP,'bases.json')))
R=load_refine()
print("refine keys:", sorted(R.keys()))

def C(label, svg): return {'label':label, 'svg':svg or ''}

sections=[
 {'game':4,'name':GAME_NAMES[4],'cards':[C('공룡 러너', sanitize(B['artifact_G4']))]},
 {'game':5,'name':GAME_NAMES[5],'cards':[C('03', sanitize(B['G5_03'])), C('3.1', R.get('g5-3.1')), C('3.2', R.get('g5-3.2'))]},
 {'game':6,'name':GAME_NAMES[6],'cards':[C('09', sanitize(B['G6_09'])), C('9.1', R.get('g6-9.1')), C('9.2', R.get('g6-9.2'))]},
 {'game':7,'name':GAME_NAMES[7],'cards':[C('오목', sanitize(B['artifact_G7']))]},
 {'game':8,'name':GAME_NAMES[8],'cards':[C('V1', R.get('g8-v1')), C('V2', R.get('g8-v2')), C('V3', R.get('g8-v3'))]},
 {'game':9,'name':GAME_NAMES[9],'cards':[C(f'{i:02d}', R.get(f'g9-{i:02d}')) for i in range(1,11)]},
 {'game':10,'name':GAME_NAMES[10],'cards':[C('V1', R.get('g10-v1')), C('V2', R.get('g10-v2')), C('V3', R.get('g10-v3'))]},
]

missing=[]
for s in sections:
    for c in s['cards']:
        if not (c['svg'] or '').strip(): missing.append(f"G{s['game']}-{c['label']}")
with open(os.path.join(SP,'v2data.js'),'w',encoding='utf-8') as f:
    f.write('window.__V2='); json.dump({'sections':sections}, f, ensure_ascii=False); f.write(';\n')
print("sections:", [(s['game'], len(s['cards'])) for s in sections])
print("MISSING svg:", missing if missing else 'none')
print("wrote v2data.js")
