#!/usr/bin/env python3
"""Cuts the rhythm section out of each song for the play-along game. Run from the repo root after a song changes:
python3 _dev/build_backing.py [song ...]      and then      python3 _dev/build_beats.py

Needs torch, numpy and av. It separates the part of each song a level plays with Hybrid Demucs (Defossez 2021, the weights
torchaudio publishes, about 320 MB on first run) and writes its drums and bass alone to assets/audio/backing/<song>.mp3.
In the game that copy plays under the song, and the song itself only sounds while the player keeps hitting notes.
build_beats.py reads the copies too, to hear what pitch each note is without the drums on top.

The model's code ships inside torchaudio. It is loaded straight from its file, so torchaudio itself never has to import."""
import importlib.util
import sys

import av
import numpy as np
import torch

RATE, SECONDS = 44100, 96      # a level is the first 90 seconds, and its last note rings a little past that
WEIGHTS = 'https://download.pytorch.org/torchaudio/models/hdemucs_high_trained.pt'
SOURCES = ['drums', 'bass', 'other', 'vocals']
SONGS = ['online-office', 'glowing-eyes', 'musette-and-drums', 'u-werent-here', 'ekta-meye', 'cities-in-dust']


def model():
    path = importlib.util.find_spec('torchaudio').submodule_search_locations[0] + '/models/_hdemucs.py'
    spec = importlib.util.spec_from_file_location('hdemucs', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    net = module.hdemucs_high(sources=SOURCES)
    net.load_state_dict(torch.hub.load_state_dict_from_url(WEIGHTS, map_location='cpu'))
    return net.eval()


def load(path):
    resample = av.AudioResampler(format='fltp', layout='stereo', rate=RATE)
    with av.open(path) as c:
        x = np.concatenate([f.to_ndarray() for frame in c.decode(audio=0) for f in resample.resample(frame)], axis=1)
    return x[:, :RATE * SECONDS]


def separate(net, x, chunk=12, lap=1):
    """The model, run over overlapping chunks that crossfade into each other, so memory stays small."""
    mix = torch.from_numpy(x)
    mean, std = mix.mean(), mix.std()
    mix = (mix - mean) / std
    n, size, hop = mix.shape[1], chunk * RATE, (chunk - lap) * RATE
    out, weight, ramp = torch.zeros(len(SOURCES), 2, n), torch.zeros(n), torch.linspace(0, 1, lap * RATE)
    for start in range(0, n, hop):
        piece = mix[:, start:start + size]
        w = torch.ones(piece.shape[1])
        if start:
            w[:len(ramp)] = ramp
        if start + size < n:
            w[-len(ramp):] = ramp.flip(0)
        with torch.no_grad():
            out[:, :, start:start + size] += net(piece[None])[0] * w
        weight[start:start + size] += w
        if start + size >= n:
            break
    return (out / weight * std + mean).numpy()


def save(path, x):
    x = np.clip(x, -1, 1).astype(np.float32)
    x[:, -RATE // 2:] *= np.linspace(1, 0, RATE // 2, dtype=np.float32)
    with av.open(path, 'w', format='mp3') as out:
        stream = out.add_stream('mp3', rate=RATE)
        stream.bit_rate = 112000
        stream.layout = 'stereo'
        for i in range(0, x.shape[1], 1152):
            frame = av.AudioFrame.from_ndarray(np.ascontiguousarray(x[:, i:i + 1152]), format='fltp', layout='stereo')
            frame.sample_rate = RATE
            frame.pts = i
            out.mux(stream.encode(frame))
        out.mux(stream.encode(None))


if __name__ == '__main__':
    torch.set_num_threads(6)
    net = model()
    for name in sys.argv[1:] or SONGS:
        x = load(f'assets/audio/{name}.mp3')
        stems = separate(net, x)
        backing = stems[SOURCES.index('drums')] + stems[SOURCES.index('bass')]
        save(f'assets/audio/backing/{name}.mp3', backing)
        share = float(np.sqrt((backing ** 2).mean() / (x ** 2).mean()))
        left = float(np.sqrt(((x - stems.sum(0)) ** 2).mean() / (x ** 2).mean()))
        print(f'{name}: {x.shape[1] / RATE:.0f} s, drums and bass are {share:.0%} of the level, the four parts miss the song by {left:.1%}', flush=True)
