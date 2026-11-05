#!/usr/bin/env python3
"""Stamps a content hash on every css and js URL in index.html, so a returning visitor never mixes old and new code.
GitHub Pages caches each file for 10 minutes and there is no build step. The pre-commit hook runs this."""
import hashlib, json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
stamp = lambda p: hashlib.sha1((root / p).read_bytes()).hexdigest()[:8]
html = (root / 'index.html').read_text(encoding='utf8')
html = re.sub(r'href="css/site\.css[^"]*"', f'href="css/site.css?v={stamp("css/site.css")}"', html)
html = re.sub(r'src="js/main\.js[^"]*"', f'src="js/main.js?v={stamp("js/main.js")}"', html)
mods = {f'./js/{f.name}': f'./js/{f.name}?v={stamp(f"js/{f.name}")}' for f in sorted((root / 'js').glob('*.js'))}
html = re.sub(r'<script type="importmap">.*?</script>', lambda _: f'<script type="importmap">{json.dumps({"imports": mods})}</script>', html, flags=re.S)
(root / 'index.html').write_text(html, encoding='utf8')
