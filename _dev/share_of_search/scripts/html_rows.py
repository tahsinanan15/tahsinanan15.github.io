"""Flatten an SEC HTML filing into text lines: one line per table row (cells joined by ' | '), plus paragraph text."""
import sys, re
from html.parser import HTMLParser

class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.lines=[]; s.cell=[]; s.row=None
    def handle_starttag(s,t,a):
        if t=='tr': s.row=[]
        elif t in ('td','th'): s.cell=[]
    def handle_endtag(s,t):
        if t in ('td','th') and s.row is not None:
            c=re.sub(r'\s+',' ',''.join(s.cell)).strip()
            if c and c not in ('$',')','%'): s.row.append(c)
            elif c==')' and s.row: s.row[-1]+=')'
            s.cell=[]
        elif t=='tr' and s.row is not None:
            if s.row: s.lines.append(' | '.join(s.row))
            s.row=None
        elif t in ('p','div') and s.row is None:
            c=re.sub(r'\s+',' ',''.join(s.cell)).strip()
            if c: s.lines.append(c)
            s.cell=[]
    def handle_data(s,d): s.cell.append(d)

for f in sys.argv[1:]:
    p=P(); p.feed(open(f,encoding='utf-8',errors='replace').read())
    open(f.rsplit('.',1)[0]+'.txt','w').write('\n'.join(p.lines))
