# Tahsin Anan's portfolio

Static site on GitHub Pages: https://tahsinanan15.github.io/ . Pushing to `main` publishes it. There is no build step.

- `index.html`: all the words and windows
- `css/site.css`: the look
- `js/`: `main.js` (windows, boot, looks), `themes.js` (the six song OSes), `fx.js` (their worlds and beat effects), `audio.js` (player, sounds), `tour.js` (RUNDOWN.EXE), `bubbles.js`, `analytics.js` and `observe.js` (OBSERVE.EXE), `stats.js`, `bubblepop.js`, `paint.js`, `panopticon.js`, `beats.js` (the play-along game in the player) and `beatworlds.js` (the six worlds it is played in)
- `assets/`: art, design work, audio, wallpapers, per-OS icons, cursors, stings and chimes, fonts, the resume PDF


`DESIGN.md` holds the design system. In `_dev/`: `serve.py` is a local preview with caching off, `stamp.py` stamps cache-busting hashes into `index.html` (run it after editing css or js), `build_art.py` rebuilds the web images and the painting analysis, `build_walls.py` rebuilds the wallpapers, and after a song changes `build_backing.py` cuts its drums and bass out into `assets/audio/backing` (needs torch), then `build_beats.py` rebuilds the play-along charts in `assets/data/beats`.
