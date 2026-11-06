#!/usr/bin/env python3
"""Builds the play-along charts in assets/data/beats from the songs. Run from the repo root after a song changes:
python3 _dev/build_beats.py [song ...]      (--check tests the beat finder on a click track)

Needs numpy and av. A chart is {"bpm": n, "notes": [[seconds, lane, hold seconds, kind, pitch], ...]}. kind 0 is a block to
hit, 1 and 2 are arrows to sweep right or left across that lane and the next. Two notes at the same time are one for each
hand. pitch is the MIDI note the song is sounding there, which the game plays when the note is hit.

It finds the song's beat, then lays a grid of beats and half beats over it. A steady pulse always gets a note. The other
grid points get one only where the song itself hits hard there, so the taps follow its rhythm and never drift off the
beat. Hands alternate, the biggest accents take both hands or a sweep, and the level builds: gentle at first.

Pitch is heard with the drums and bass taken out, where _dev/build_backing.py has cut them: run that first."""
import json
import os
import sys

import av
import numpy as np

SR, N, HOP, LAG = 22050, 1024, 256, 2      # 11.6 ms a frame
FPS = SR / HOP
PACE = 1.1                                 # seconds between notes to aim for
LEVEL = 90                                 # seconds of each song the game plays, as in js/beats.js
LEAD = 3.0                                 # nothing to hit before this, so the first notes can be seen coming
SONGS = ['online-office', 'glowing-eyes', 'musette-and-drums', 'u-werent-here', 'ekta-meye', 'cities-in-dust']
STEPS = [[0, 1, 2, 3], [3, 2, 1, 0], [0, 1, 2, 1], [3, 2, 1, 2], [0, 2, 1, 3], [1, 0, 2, 3], [2, 3, 1, 0], [1, 2, 3, 2]]


def load(path):
    resample = av.AudioResampler(format='flt', layout='mono', rate=SR)
    with av.open(path) as c:
        return np.concatenate([f.to_ndarray()[0] for frame in c.decode(audio=0) for f in resample.resample(frame)])


def onsets(x):
    """Per frame: how much new energy arrives across log-spaced bands (spectral flux), and how loud it is."""
    frames = np.lib.stride_tricks.sliding_window_view(x, N)[::HOP]
    edges = np.unique(np.round(np.geomspace(2, N // 2, 37)).astype(int))
    window = np.hanning(N).astype(np.float32)
    mag = np.concatenate([np.abs(np.fft.rfft(frames[i:i + 2000] * window, axis=1)).astype(np.float32) for i in range(0, len(frames), 2000)])
    bands = np.log1p(8 * np.add.reduceat(mag, edges[:-1], axis=1))
    return np.maximum(0, bands[LAG:] - bands[:-LAG]).sum(1), mag[LAG:].sum(1)


def smooth(v, seconds):
    n = max(1, int(seconds * FPS))
    return np.convolve(v, np.ones(n) / n, 'same')


def seconds(frame):
    return ((frame + LAG) * HOP + N / 2) / SR


def pulse(flux):
    """The beat, as frame numbers (after Ellis 2007): the tempo from the onset curve's autocorrelation, then the chain of
    beats that lands on the most onsets while keeping that spacing. It follows a band that drifts a little."""
    env = np.maximum(0, flux - smooth(flux, .4))
    env /= env.std() + 1e-9
    n = len(env)
    ac = np.fft.irfft(np.abs(np.fft.rfft(env, 2 * n)) ** 2)
    lags = np.arange(int(FPS * 60 / 190), int(FPS * 60 / 60))      # 60 to 190 beats a minute
    period = int(lags[np.argmax(ac[lags] * np.exp(-.5 * (np.log2(60 * FPS / lags / 120) / .8) ** 2))])
    score, back = env.copy(), np.full(n, -1)
    for t in range(period, n):
        prev = np.arange(max(0, t - 2 * period), t - period // 2)
        cost = score[prev] - 100 * np.log((t - prev) / period) ** 2
        best = cost.argmax()
        score[t] += cost[best]
        back[t] = prev[best]
    t, out = n - period + int(score[n - period:].argmax()), []
    while t >= 0:
        out.append(t)
        t = back[t]
    return np.array(out[::-1]), 60 * FPS / period


def tune_of(name, x):
    """The song with its rhythm section subtracted, so what is left carries the tune. The copy is lined up to the song first."""
    path, n = f'assets/audio/backing/{name}.mp3', 1 << 19
    if not os.path.exists(path):
        return x, 1.0
    b = load(path)
    lag = int(np.argmax(np.fft.irfft(np.fft.rfft(x[SR * 5:SR * 5 + n]) * np.conj(np.fft.rfft(b[SR * 5:SR * 5 + n])))))
    lag -= n if lag > n // 2 else 0      # the copy starts this many samples into the song
    a, c = max(lag, 0), max(-lag, 0)
    m = min(len(x) - a, len(b) - c)
    tune = x.copy()
    tune[a:a + m] -= b[c:c + m]
    return tune, float(np.sqrt((tune[a:a + m] ** 2).mean() / (x[a:a + m] ** 2).mean()))


def pitches(tune, times):
    """The note sounding at each time: the pitch from G3 to G5 whose harmonics hold the most energy, kept to the song's scale."""
    window, width, notes, major = np.hanning(4096), SR / 4096, np.arange(55, 80), np.array([0, 2, 4, 5, 7, 9, 11])
    bins = np.round(440 * 2 ** ((notes[:, None] - 69) / 12) * np.arange(1, 6) / width).astype(int)
    found, strength = [], []
    for t in times:
        seg = tune[int((t + .02) * SR):][:4096]
        mag = np.abs(np.fft.rfft(np.pad(seg, (0, 4096 - len(seg))) * window))
        mag = np.maximum(mag, np.maximum(np.roll(mag, 1), np.roll(mag, -1)))      # a harmonic may sit a bin to either side
        salience = (mag[bins] * .8 ** np.arange(5)).sum(1)
        found.append(int(notes[salience.argmax()]))
        strength.append(float(salience.max()))
    found = np.array(found)
    share = np.bincount(found % 12, weights=strength, minlength=12)
    key = max(range(12), key=lambda k: share[(major + k) % 12].sum())
    scale = set(((major + key) % 12).tolist())
    inside = float(np.mean([p % 12 in scale for p in found]))
    return [int(p) if p % 12 in scale else int(p) + (1 if (p + 1) % 12 in scale else -1) for p in found], key, inside


def chart(x, tune):
    flux, loud = onsets(x)
    beat, bpm = pulse(flux)
    gap = 60 / bpm
    every = min((1, 2, 4), key=lambda m: abs(np.log(m * gap / PACE)))
    env = flux / (smooth(flux, 3) + 1e-9)
    weight = lambda frames: env[np.clip(np.round(frames).astype(int)[:, None] + np.arange(-3, 4), 0, len(env) - 1)].max(1)
    start = max(range(every), key=lambda p: weight(beat[p::every]).sum())      # the beats the song leans on
    main = set(beat[start::every].tolist())
    # Half beats join the grid when they are far enough apart to play.
    grid = np.sort(np.concatenate([beat, (beat[:-1] + beat[1:]) / 2])) if gap / 2 >= .24 else beat.astype(float)
    unit, times, strength = float(np.median(np.diff(seconds(grid)))), seconds(grid), weight(grid)
    quiet, floor = .06 * np.percentile(loud, 95), np.percentile(strength, 58)

    picked, pulses = [], 0
    for i, t in enumerate(times):
        on_pulse = grid[i] in main
        pulses += on_pulse
        if t < LEAD or t > len(x) / SR - 2 or loud[min(int(grid[i]), len(loud) - 1)] < quiet:
            continue
        if not on_pulse:
            recent = sum(1 for p in picked if t - times[p] < 4) / 4
            run = len(picked) >= 2 and t - times[picked[-2]] < unit * 2.4      # at most three in a row at full speed
            if t < 14 or strength[i] < floor or recent >= (1.2 if t < 32 else 1.75) or run:
                continue
        elif t < 14 and pulses % 2:      # a level eases in at half pace
            continue
        picked.append(i)

    notes, hand, walk, free, accents, big = [], 1, [0, 0], [-9.0] * 4, 0, np.percentile(strength[picked], 80)
    for n, i in enumerate(picked):
        t = float(times[i])
        after = times[picked[n + 1]] - t if n + 1 < len(picked) else 9
        before = t - times[picked[n - 1]] if n else 9
        accent = grid[i] in main and strength[i] >= big and t > 20 and after >= .45 and before >= .45
        if accent:
            accents += 1
        if accent and accents % 3 == 0:      # sweep across one hand's two lanes
            pair = accents // 3 % 2 * 2
            notes.append([round(t, 3), pair, 0, 1 + accents // 6 % 2])
            free[pair] = free[pair + 1] = t
        elif accent:      # both hands at once
            for lane in [(0, 3), (1, 2), (0, 2), (1, 3)][accents % 4]:
                notes.append([round(t, 3), lane, 0, 0])
                free[lane] = t
        else:      # hands alternate, and each walks between its two lanes
            hand = 1 - hand
            walk[hand] += 1
            lane = hand * 2 + (walk[hand] // 2 + hand) % 2
            if t - free[lane] < .62:
                lane ^= 1
            f = int(grid[i])
            held = grid[i] in main and len(notes) % 5 == 4 and after >= .9 and loud[f:f + int((after - .4) * FPS)].min() > .2 * loud[f]
            notes.append([round(t, 3), lane, round(min(after - .45, 2.0), 2) if held else 0, 0])
            free[lane] = t + (notes[-1][2] if held else 0)
    found, key, inside = pitches(tune, [n[0] for n in notes])
    for i, n in enumerate(notes):
        n.append(found[i] + (12 if i and notes[i - 1][0] == n[0] else 0))      # the second of two at once sounds an octave up
    return notes, bpm, float(weight(grid[picked]).mean() / env.mean()), key, inside


def check():
    """A click every half second: the beat finder must call it 120 a minute and land within 25 ms of every click."""
    rng = np.random.default_rng(1)
    x = rng.normal(0, .002, SR * 12).astype(np.float32)
    clicks = np.arange(1, 11, .5)
    for t in clicks:
        i = int(t * SR)
        x[i:i + 1200] += (rng.normal(0, .5, 1200) * np.exp(-np.arange(1200) / 250)).astype(np.float32)
    beat, bpm = pulse(onsets(x)[0])
    found = seconds(beat)
    off = np.array([found[np.abs(found - t).argmin()] - t for t in clicks])
    print(f'tempo {bpm:.1f}, worst miss {np.abs(off).max() * 1000:.1f} ms')
    assert abs(bpm - 120) < 3 and np.abs(off).max() < .025


if __name__ == '__main__':
    if '--check' in sys.argv:
        sys.exit(check())
    for name in sys.argv[1:] or SONGS:
        x = load(f'assets/audio/{name}.mp3')
        tune, left = tune_of(name, x)
        notes, bpm, on_beat, key, inside = chart(x, tune)
        with open(f'assets/data/beats/{name}.json', 'w') as f:
            json.dump({'bpm': round(bpm), 'notes': notes}, f, separators=(',', ':'))
        level = [n for n in notes if n[0] < LEVEL]
        late = [n for n in level if n[0] > 32]
        print(f'{name}: {bpm:.0f} bpm, {len(level)} in the level, {len(late) / (LEVEL - 32):.2f} a second once it builds, '
              f'{sum(1 for n in level if n[3])} sweeps, {sum(1 for a, b in zip(level, level[1:]) if a[0] == b[0])} doubles, '
              f'{sum(1 for n in level if n[2])} holds, onsets on the notes {on_beat:.1f}x the song average. '
              f'Tune is {left:.0%} of the level, scale of {"C C# D D# E F F# G G# A A# B".split()[key]}, {inside:.0%} of pitches already in it')
