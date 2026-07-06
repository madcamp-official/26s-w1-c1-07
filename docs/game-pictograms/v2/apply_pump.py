#!/usr/bin/env python3
"""펌프 워크플로 결과로 v2data.js 의 게임6 섹션을 원근없는 10종으로 교체."""
import json, re, os

SP = "/tmp/claude-501/-Users-siheom-yong-programming-madpump/bc3653a1-a113-482d-a8be-5f2b4f681ce2/scratchpad"
TASK_OUT = "/private/tmp/claude-501/-Users-siheom-yong-programming-madpump/bc3653a1-a113-482d-a8be-5f2b4f681ce2/tasks/whfwg0ixy.output"
TD = "/Users/siheom-yong/.claude/projects/-Users-siheom-yong-programming-madpump/bc3653a1-a113-482d-a8be-5f2b4f681ce2/subagents/workflows/wf_ec22188d-76a"

def sanitize(s):
    if not s: return s
    s=s.strip()
    s=re.sub(r'^\s*<!\[CDATA\[','',s); s=re.sub(r'\]\]>\s*$','',s)
    s=s.replace('<![CDATA[','').replace(']]>','')
    s=re.sub(r'^\s*<svg\b[^>]*>','',s); s=re.sub(r'</svg>\s*$','',s)
    return s.strip()

def load():
    m={}
    if os.path.exists(TASK_OUT):
        try:
            j=json.loads(open(TASK_OUT,encoding='utf-8').read())
            for r in j.get('results',[]):
                if r.get('key'): m[r['key']]=sanitize(r.get('finalSvg',''))
            if m: return m
        except Exception as e: print("taskout parse:", e)
    # journal fallback
    jr={}
    jp=os.path.join(TD,'journal.jsonl')
    if os.path.exists(jp):
        for line in open(jp):
            try: d=json.loads(line)
            except: continue
            if d.get('type')=='result' and 'result' in d and d.get('agentId'): jr[d['agentId']]=d['result']
    for aid,res in jr.items():
        fp=os.path.join(TD,f'agent-{aid}.jsonl'); prompt=''
        if os.path.exists(fp):
            for line in open(fp):
                try: dd=json.loads(line)
                except: continue
                if dd.get('type')=='user':
                    c=dd.get('message',{}).get('content',''); prompt=c if isinstance(c,str) else ' '.join(p.get('text','') for p in c if isinstance(p,dict)); break
        mm=re.search(r'평면 버전 (\d+):', prompt)
        if mm and isinstance(res,dict): m[f'g6-{int(mm.group(1)):02d}']=sanitize(res.get('finalSvg',''))
    return m

R=load()
print("pump keys:", sorted(R.keys()))
data=json.loads(open(SP+"/v2data.js",encoding='utf-8').read()[len('window.__V2='):-2])
cards=[{'label':f'{i:02d}','svg':R.get(f'g6-{i:02d}','')} for i in range(1,11)]
for s in data['sections']:
    if s['game']==6:
        s['cards']=cards; s['name']='펌프'
miss=[c['label'] for c in cards if not c['svg'].strip()]
with open(SP+"/v2data.js","w",encoding='utf-8') as f:
    f.write('window.__V2='); json.dump(data,f,ensure_ascii=False); f.write(';\n')
print("G6 cards:", len(cards), "| missing:", miss if miss else 'none')
