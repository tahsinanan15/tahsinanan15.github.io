import json, csv, re, sys
from pathlib import Path
D = Path(__file__).parent
OUT = Path(__file__).parent.parent / 'cases.csv'
# Corrections made before any curve was pulled, each with its reason. Key = product as the agent wrote it.
FIX = json.load(open(Path(__file__).parent / 'fixes.json'))
cols = ['id', 'product', 'brand', 'category', 'announced', 'status', 'drop_reason', 'outcome', 'outcome_note', 'search_term', 'control_term',
        'wiki_article', 'wiki_control', 'announce_url', 'announce_quote', 'outcome_url', 'outcome_quote', 'confidence', 'edit_note']
rows, seen = [], set()
for f in sorted((f for f in D.glob('*.json') if f.name != 'fixes.json')):
    d = json.load(open(f))
    cases = d['cases'] if isinstance(d, dict) else d
    drops = d.get('dropped', []) if isinstance(d, dict) else []
    for c in cases:
        r = {k: c.get(k, '') for k in cols}
        r['announced'] = c.get('announcement_date', '')
        r['confidence'] = (c.get('confidence', '') + (': ' + c['confidence_reason'] if c.get('confidence_reason') else '')).strip()
        r['status'] = 'in'
        r.update(FIX.get(c['product'], {}))
        r['outcome'] = r['outcome'].upper().replace('CHECK BACK 2027', 'CHECK BACK 2027')
        if r['announced'][:4] in ('2024', '2025'): r['outcome'] = 'CHECK BACK 2027'
        base = re.sub(r'[^a-z0-9]+', '_', r['product'].lower()).strip('_')[:28]
        r['id'] = base if base not in seen else base + '_2'; seen.add(r['id'])
        rows.append(r)
    for x in drops:
        name = x.get('product') or x.get('name') or str(x)[:40]
        rows.append({'id': re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')[:28], 'product': name, 'category': f.stem,
                     'status': 'dropped', 'drop_reason': x.get('reason', '') if isinstance(x, dict) else '', 'announced': x.get('announcement_date', '') if isinstance(x, dict) else ''})
with open(OUT, 'w', newline='', encoding='utf-8') as fh:
    w = csv.DictWriter(fh, cols, extrasaction='ignore'); w.writeheader(); w.writerows(rows)
print(len(rows), 'rows;', sum(r['status'] == 'in' for r in rows), 'in')
