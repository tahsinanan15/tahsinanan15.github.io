#!/usr/bin/env python3
"""Builds the play-along charts in assets/data/beats from the songs. Run from the repo root after a song changes:
python3 _dev/build_beats.py [song ...]      (--check tests the beat finder on a click track)

Needs numpy and av. A chart is {"bpm": n, "notes": [[seconds, lane, hold seconds], ...]}. It finds the song's beat, then
puts a note on every beat, or every second or fourth one, whichever comes closest to one note a second, so the taps
follow a pulse you can feel. Lanes move in small repeating steps, and every sixth note is one to hold."""
import json
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


def chart(x):
    flux, loud = onsets(x)
    beat, bpm = pulse(flux)
    every = min((1, 2, 4), key=lambda m: abs(np.log(m * 60 / bpm / PACE)))
    env = flux / (smooth(flux, 3) + 1e-9)
    weight = lambda frames: env[np.clip(frames[:, None] + np.arange(-1, 2), 0, len(env) - 1)].max(1)
    start = max(range(every), key=lambda p: weight(beat[p::every]).sum())      # the beats the song leans on
    picks = beat[start::every]
    times = seconds(picks)
    quiet = .06 * np.percentile(loud, 95)
    notes = []
    for i, (f, t) in enumerate(zip(picks, times)):
        if t < LEAD or t > len(x) / SR - 2 or loud[min(f, len(loud) - 1)] < quiet or (t < 14 and i % 2):      # a level eases in at half pace
            continue
        k, after = len(notes), times[i + 1] - t if i + 1 < len(times) else 9
        held = k % 6 == 5 and after >= .9 and loud[f:f + int((after - .4) * FPS)].min() > .2 * loud[f]
        notes.append([round(float(t), 3), STEPS[k // 4 % len(STEPS)][k % 4], round(min(after - .45, 2.0), 2) if held else 0])
    return notes, bpm, every, float(weight(picks).mean() / env.mean())


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
        notes, bpm, every, on_beat = chart(load(f'assets/audio/{name}.mp3'))
        with open(f'assets/data/beats/{name}.json', 'w') as f:
            json.dump({'bpm': round(bpm), 'notes': notes}, f, separators=(',', ':'))
        level = [n for n in notes if n[0] < LEVEL]
        gaps = np.diff([n[0] for n in level])
        print(f'{name}: {bpm:.0f} bpm, a note every {every} beats ({np.median(gaps):.2f}s, spread {gaps[14:].std() * 1000:.0f} ms), {len(level)} in the level, '
              f'{sum(1 for n in level if n[2])} holds, onsets on the notes {on_beat:.1f}x the song average')
