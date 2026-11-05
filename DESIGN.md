# Design: Tahsin OS

A 1995 skeleton in a 2007 skin. Putty bevels, file names and status bars from the beige Windows era, with Aero glass, gel and sky on top. Y2K toys stay small: the media player and the games.

## The idea
The desktop looks back. Observation is her one skill, so the Start button is an eye that follows the pointer, boot opens like an eye and shutdown closes it, and OBSERVE.EXE analyses the visit, tests her two headlines and segments her paintings.

## Colour
Aero sky and grass carry the surface. Sheets stay white so the work stays calm.
- Sky: `--sky-900 #06306b`, `--sky-700 #0a5cb8`, `--sky-500 #1f8fe8`, `--sky-300 #7fd0ff`, `--sky-100 #e4f4ff`
- Grass: `--grass-700 #156f20`, `--grass-500 #2f9e36`, `--grass-300 #9be05a`
- Putty: `--putty-1 #f6f1e6` to `--putty-4 #8f8672`
- Ink: `--ink #0f2238`, `--ink-2 #3f5268`. Accent and focus ring: `--pink #c7118c`
- Chart series, in fixed order, CVD-validated: `#0b6fd0 #c96a00 #6a3fc9 #2c8f24 #d6189a`
- Scenes (`data-scene`): day, sunset and night retint the glass and taskbar only. Sheets stay white.

## Type
- Baloo Da 2 for headings: soft and rounded, and a Bengali type family, so the greeting and the headings share a voice.
- Hind Siliguri for body: clean and humanist, in the Frutiger spirit.
- Silkscreen for file names and LCD readouts, at 16px or 8px so the pixels stay crisp.
- Monospace appears only for the real event log.
- Each other OS has one display face for big headings and the Start button: Retro Stereo Wide, CAT Liebing Gotisch, Data Trash, Indira K, Alte Haas Grotesk. Small text stays in that OS's reading face. Sources and licenses are in `assets/fonts/LICENSES.txt`.

## Materials
- Glass: title bars and taskbar. Gradient with a hard gloss line at 50%, backdrop blur, one slow light sweep on the focused window.
- Putty: window frames, toolbars, tabs, status bars, scrollbar tracks.
- Gel: primary buttons in green, secondary in white-blue. Green text is white and stays above 4.5:1.
- Chrome: media player and game bezels only. LCD: dark panel, cyan pixel text. Campaign results use it too.

## Motion
One authored moment: the eyelids. Windows pop open with an exponential ease-out over 420ms. Bubbles rise slowly at about 30fps. Reduced motion removes the travel and keeps everything readable.

## Layout
Base styles are a plain scrolling page, used by phones and no-JS. `.os` (980x560 and up) adds absolute windows. Only her photo and the media player start open, so the desktop is clear and PLAY_ME.EXE is the first thing a new visitor notices. `placeStart()` computes where every window will land.

## Sound
All effects are synthesized in `js/audio.js`. Music starts on the first gesture, because browsers allow nothing earlier. Mute is always visible in the taskbar.

## Icons
Every OS has its own set of 16 drawings. Aero's are hand-authored gel symbols in `index.html`. The other five live in `assets/icons/<os>.svg` as symbols named `<os>-person`, `<os>-chart` and so on, fetched the first time that OS appears, and `swapIcons` in `js/main.js` points every `<use>` at the current set. If a set can't load, the Aero icons stay up. A new set must change the object, not just the color: the resume is a floppy in Vaporwave OS and a scroll in Baroque Keep. No shared tile or frame behind them.

## Six songs, six operating systems
Same files and same words in every OS. Everything else changes: wallpaper (one of her paintings), palette, type, window chrome, cursor, icons, bubbles, start chime, and what the screen does on the beat. A theme lives in three places: `js/themes.js` (name, wallpaper, visualizer colors), a block in `css/site.css` under `[data-theme=<id>]`, and a world in `js/fx.js`.

| Song | OS | Reference | On the beat |
| --- | --- | --- | --- |
| Online Office V4.20 | Frutiger Aero | gel, sky and grass, always Green Hills | wallpaper ripples |
| Glowing Eyes, telepath | Vaporwave OS | pink and cyan, marble, grid | the grid rolls with the bass |
| Musette and Drums, Cocteau Twins | Baroque Keep | gothic castle, Mozart and Beethoven, gold leaf | the room breathes |
| U Weren't Here, Cult Member | Ghost Net | cyberpunk, acid yellow and teal, hard edges | data blocks slip |
| Ekta Meye, Arnob | Ray OS | Satyajit Ray, Bengali letterpress, ink on cream | film weave |
| Cities in Dust, Siouxsie and the Banshees | Concrete Jungle | New York, asphalt and taxi yellow | the street lamps breathe |

Wallpapers all come from one recipe in `_dev/build_walls.py`: the original painting, sharpened, never zoomed past its full width, then that OS's grade. Portrait cityscapes show the whole painting repeated along the street. Each OS has its own wallpaper and none is shared.

Her photo follows the song too: the same picture, toned to each OS's palette, in a frame that matches the OS.

The screen moves gently and only with the music. Windows themselves do not move, the checkbox in the media player turns it all off, and reduced motion removes it. Evoke a world, never copy a franchise's logos, characters or art.

## PLAY_ME.EXE
A 30-second tour for recruiters. It answers three things: who is she, what can she do, why hire her. Until someone has played it, the tape bounces and glows, the bubbles spiral into it, and a handwritten "psst... start here" with an arrow points at it. Clicking pops the bubbles and starts the tape. If they open something else or change the song, it calms down until the next visit. It plays as an old tape: cassette-deck icon, blue screen and tracking bars on power-up, tape hiss and motor from `vhs` in `js/audio.js`, and a shutter skip between steps. It restores the desktop exactly as it found it.
