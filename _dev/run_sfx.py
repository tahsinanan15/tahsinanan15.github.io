#!/usr/bin/env python3
"""KITTY_RUN.EXE's sound effects, one set per OS, composed and bounced in SoundCraft, with purpl as the reverb send.

  CLAP_PATH=/path/to/purpl  python3 _dev/run_sfx.py [--loader /path/to/ld-linux-x86-64.so.2] [--os aero,ray]

For each OS: a SoundCraft session with a Subtractive Synth voiced for that OS, a Drum Synth for thumps and hats, the OS's
own effects on the synth, and both sent to a bus with purpl on it (at purpl's own settings: the send level sets how much).
Seven short phrases in the OS's scale (lane, jump, duck, power, zoom, stumble, caught) are written as MIDI and each is
bounced on its own. They are then levelled (each kind to the same loudness in every OS), trimmed, laid end to end with
a little silence, and written as assets/run/sfx-<os>.mp3 with assets/run/sfx.json saying where each one starts and how
long it is. purpl needs glibc 2.38; --loader runs soundcraft-cli through a newer glibc's loader (the playbook's recipe).
The site plays them through its own sound bus, which sends a little into purpl's room as every site sound does.
"""
import json, os, shutil, subprocess, sys, tempfile, wave
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'run')
SR, TPS = 48000, 1920           # samples a second; MIDI ticks a second (SoundCraft's 960 a beat, at 120 bpm)
SLOT, KINDS = 1.6, ['lane', 'jump', 'duck', 'power', 'zoom', 'stumble', 'caught']
LONG = {'lane': .45, 'jump': .6, 'duck': .6, 'power': 1.0, 'zoom': .9, 'stumble': .7, 'caught': 1.6}   # seconds each kind may last, tail and all
LOUD = {'lane': -26, 'jump': -22, 'duck': -24, 'power': -19, 'zoom': -20, 'stumble': -21, 'caught': -19}   # RMS dBFS each kind is set to
KICK, SNARE, HAT, OPEN, TOM, CRASH = 36, 38, 42, 46, 45, 49

# Each OS: its synth, effects on it, how much goes to purpl, and its scale (root MIDI note and steps).
VOICES = {
    'aero': dict(synth=dict(osc1_wave=2, osc2_wave=3, osc2_semitones=12, osc2_detune=4, osc_mix=35, cutoff=9000, resonance=10,
                            filter_env_amount=20, amp_attack=1, amp_decay=260, amp_sustain=0, amp_release=260, level=-8),
                 fx=[('chorus', dict(depth=30, mix=25)), ('plate_reverb', dict(mix=14, decay=1.4))], send=-10,
                 drums=dict(level=-12, hat_decay=60, tom_tune=5), root=84, scale=[0, 2, 4, 7, 9]),          # glass bells, C major pentatonic
    'vapor': dict(synth=dict(osc1_wave=0, osc2_wave=3, osc2_detune=14, osc_mix=50, cutoff=3500, resonance=25, filter_env_amount=35,
                             amp_attack=4, amp_decay=320, amp_sustain=20, amp_release=380, glide=40, level=-10),
                  fx=[('chorus', dict(depth=75, mix=45, rate=0.4)), ('lofi', dict(bits=12, sample_rate=22050, mix=60))], send=-8,
                  drums=dict(level=-12, snare_tune=-4, tom_tune=-3), root=75, scale=[0, 4, 7, 11, 14]),     # tape synth, E flat major 7
    'baroque': dict(synth=dict(osc1_wave=0, osc2_wave=1, osc2_semitones=12, osc2_detune=3, osc_mix=40, cutoff=5000, resonance=15,
                               filter_env_amount=55, filter_decay=140, amp_attack=0.5, amp_decay=180, amp_sustain=0, amp_release=180, level=-9),
                    fx=[('plate_reverb', dict(mix=26, decay=3.0, size=80))], send=-6,
                    drums=dict(level=-12, tom_tune=-5, tom_decay=900), root=74, scale=[0, 2, 3, 5, 7, 8, 11]),   # harpsichord, D harmonic minor
    'ghost': dict(synth=dict(osc1_wave=1, osc2_wave=1, osc2_semitones=-12, osc2_detune=0, osc_mix=30, cutoff=7000, resonance=35,
                             filter_env_amount=40, amp_attack=0.5, amp_decay=120, amp_sustain=10, amp_release=90, level=-12),
                  fx=[('lofi', dict(bits=6, sample_rate=11025, mix=80)), ('mod_delay', dict(time=90, feedback=25, mix=20))], send=-14,
                  drums=dict(level=-12, hat_decay=40, snare_snappy=90), root=69, scale=[0, 3, 5, 7, 10]),    # chip square, A minor pentatonic
    'ray': dict(synth=dict(osc1_wave=2, osc2_wave=3, osc2_semitones=12, osc2_detune=2, osc_mix=25, cutoff=4500, resonance=8,
                           filter_env_amount=30, amp_attack=1, amp_decay=420, amp_sustain=0, amp_release=500, level=-8),
                fx=[('lofi', dict(bits=16, sample_rate=24000, noise=12, mix=50)), ('room_reverb', dict(mix=18, decay=1.4))], send=-10,
                drums=dict(level=-12, tom_tune=2, tom_decay=700), root=69, scale=[0, 1, 4, 5, 7, 8, 11]),   # soft pluck on film, a Bhairav-like scale
    'metro': dict(synth=dict(osc1_wave=3, osc2_wave=1, osc2_detune=6, osc_mix=40, cutoff=3000, resonance=20, filter_env_amount=30,
                             amp_attack=1, amp_decay=220, amp_sustain=30, amp_release=200, level=-10),
                  fx=[('saturator', dict(drive=8, mix=60)), ('room_reverb', dict(mix=14, decay=1.0))], send=-12,
                  drums=dict(level=-11, snare_snappy=80, hat_decay=90), root=64, scale=[0, 2, 4, 7, 9]),     # the avenue, E major pentatonic
}


def phrases(name):
    """{kind: (synth notes, drum notes)}: notes are (seconds, pitch or ('d', scale step), seconds long, velocity)."""
    d = lambda k: ('d', k)
    p = {
        'lane': ([(0, d(2), .06, 70), (.045, d(4), .08, 80)], [(0, HAT, .05, 55)]),
        'jump': ([(0, d(0), .06, 80), (.05, d(2), .06, 85), (.1, d(4), .07, 90), (.15, d(7), .14, 95)], []),
        'duck': ([(0, d(4), .07, 80), (.06, d(2), .07, 75), (.12, d(-3), .16, 70)], [(.02, TOM, .2, 70)]),
        'power': ([(i * .07, d(k), .1, 90) for i, k in enumerate([0, 2, 4, 7, 9])] + [(.36, d(14), .45, 85), (.36, d(11), .45, 70)], [(.36, OPEN, .3, 45)]),
        'zoom': ([(i * .035, d(k - 2), .05, 70 + 3 * i) for i, k in enumerate(range(9))] + [(.32, d(9), .3, 95)], [(.3, OPEN, .3, 55)]),
        'stumble': ([(0, d(-7), .16, 95), (0, d(-6), .16, 85)], [(0, KICK, .2, 100), (.02, SNARE, .1, 55)]),
        'caught': ([(0, d(7), .2, 95), (.18, d(4), .2, 90), (.36, d(2), .25, 85), (.58, d(-3), .9, 90)], [(.58, KICK, .3, 90), (.58, CRASH, .8, 35)]),
    }
    if name == 'metro':   # a cab's horn when it has her, and the two-note chime of the doors for a power-up
        p['caught'] = ([(0, 65, .22, 100), (0, 69, .22, 100), (.32, 65, .45, 100), (.32, 69, .45, 100)], [(.32, KICK, .3, 80)])
        p['power'] = ([(0, 76, .32, 95), (.3, 72, .55, 95)], [])
    if name == 'baroque':   # a turn on the harpsichord
        p['power'] = ([(i * .055, d([4, 5, 4, 5, 4, 3, 4, 7][i]), .07, 90) for i in range(8)] + [(.46, d(7), .4, 95), (.46, d(4), .4, 80)], [])
    if name == 'ghost':   # glitchier: an octave blip, and a run in 12 hard steps
        p['lane'] = ([(0, d(5), .03, 80), (.03, d(0), .03, 80), (.06, d(5), .04, 70)], [(0, HAT, .03, 60)])
        p['zoom'] = ([(i * .022, d(i - 2), .03, 75) for i in range(12)] + [(.28, d(10), .25, 95)], [(.27, SNARE, .1, 50)])
    return p


def pitch(v, n):
    if not isinstance(n, tuple): return n
    k, s = n[1], v['scale']
    return v['root'] + s[k % len(s)] + 12 * (k // len(s))


def sc(args, loader, check=True):
    cmd = ([loader, '--library-path', f'{os.path.dirname(loader)}:/lib/x86_64-linux-gnu:/usr/lib/x86_64-linux-gnu'] if loader else []) + ['soundcraft-cli'] + args
    if loader: cmd[cmd.index('soundcraft-cli')] = '/usr/bin/soundcraft-cli'
    r = subprocess.run(cmd, capture_output=True, text=True)
    if check and r.returncode: sys.exit(f'soundcraft-cli failed:\n{r.stderr[-2000:]}')
    return r.stdout


def read(path):
    """SoundCraft's 24-bit WAV (WAVE_FORMAT_EXTENSIBLE, which Python's wave won't open) as floats, one column a channel."""
    b, i, ch, data = open(path, 'rb').read(), 12, 2, None
    while i < len(b) - 8:
        tag, size = b[i:i + 4], int.from_bytes(b[i + 4:i + 8], 'little')
        if tag == b'fmt ': ch = int.from_bytes(b[i + 10:i + 12], 'little')
        if tag == b'data': data = np.frombuffer(b[i + 8:i + 8 + size], np.uint8)
        i += 8 + size + (size & 1)
    x = data.reshape(-1, 3).astype(np.int32)
    v = x[:, 0] | (x[:, 1] << 8) | (x[:, 2] << 16)
    return (np.where(v >= 1 << 23, v - (1 << 24), v) / float(1 << 23)).reshape(-1, ch)


def build(name, loader, tmp):
    v, P = VOICES[name], phrases(name)
    session = os.path.join(tmp, f'{name}.scraft')
    lines = [
        'session.new {"name": "kitty_run_%s"}' % name,
        'track.new {"kind": "instrument", "name": "Voice", "instrument": "subtractive_synth"}',
        'track.new {"kind": "instrument", "name": "Drums", "instrument": "drum_synth"}',
        'mix.new_bus {"name": "Room"}',
        'track.new {"kind": "aux", "name": "purpl", "format": "stereo"}',
        'track.input {"tracks": ["purpl"], "input": "Room"}',
        'mix.insert {"track": "purpl", "plugin": "clap:com.tinyant.purpl"}',
        'mix.instrument {"track": "Voice", "plugin": "subtractive_synth", "params": %s}' % json.dumps(v['synth']),
        'mix.instrument {"track": "Drums", "plugin": "drum_synth", "params": %s}' % json.dumps(v['drums']),
    ]
    for i, (plug, params) in enumerate(v['fx']):
        lines.append('mix.insert {"track": "Voice", "slot": %d, "plugin": "%s", "params": %s}' % (i, plug, json.dumps(params)))
    for t in ('Voice', 'Drums'):
        lines.append('mix.send {"track": "%s", "bus": "Room", "level_db": %d}' % (t, v['send']))
    length = {"seconds": SLOT * len(KINDS)}
    lines += ['midi.new_clip {"track": "Voice", "start": 0, "length": %s}' % json.dumps(length),
              'midi.new_clip {"track": "Drums", "start": 0, "length": %s}' % json.dumps(length)]
    with open(os.path.join(tmp, f'{name}-1.txt'), 'w') as fh: fh.write('\n'.join(lines) + '\n')
    sc(['script', os.path.join(tmp, f'{name}-1.txt'), '--save', session], loader)
    out = sc(['run', '--in', session, '--inspect'], loader)
    state = json.loads(out[out.index('{'):])
    clip = {t['name']: t['clips'][0]['id'] for t in state['tracks'] if t['name'] in ('Voice', 'Drums')}
    notes = []
    for k, kind in enumerate(KINDS):
        synth, drums = P[kind]
        for track, ns in (('Voice', synth), ('Drums', drums)):
            for at, n, dur, vel in ns:
                notes.append('midi.note_add {"clip": %d, "pitch": %d, "start_ticks": %d, "length_ticks": %d, "velocity": %d}'
                             % (clip[track], pitch(v, n), round((k * SLOT + at) * TPS), max(10, round(dur * TPS)), vel))
    for k, kind in enumerate(KINDS):
        notes.append('file.bounce_mix {"path": "%s", "start": {"seconds": %.3f}, "end": {"seconds": %.3f}, "bit_depth": 24, "dither": false}'
                     % (os.path.join(tmp, f'{name}-{kind}.wav'), k * SLOT, (k + 1) * SLOT))
    with open(os.path.join(tmp, f'{name}-2.txt'), 'w') as fh: fh.write('\n'.join(notes) + '\n')
    sc(['script', os.path.join(tmp, f'{name}-2.txt'), '--in', session], loader)
    return {kind: read(os.path.join(tmp, f'{name}-{kind}.wav')) for kind in KINDS}


def level(kind, a):
    """Set one sound to its kind's loudness, then end it where its tail has fallen 40 dB (or at LONG), with a fade."""
    env = np.abs(a).max(axis=1)
    live = np.nonzero(env > env.max() * 10 ** (-40 / 20))[0]
    if not len(live) or env.max() < 1e-4: sys.exit(f'{kind}: silent')
    a = a[:min(len(a), live[-1] + int(.03 * SR), int(LONG[kind] * SR))]
    rms = np.sqrt(np.mean(a ** 2)) or 1e-9
    a = a * min(10 ** (LOUD[kind] / 20) / rms, 10 ** (-1 / 20) / np.abs(a).max())   # loudness, never over -1 dBFS peak
    fade = min(len(a), int(.12 * SR))
    a[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return a


def main():
    loader = sys.argv[sys.argv.index('--loader') + 1] if '--loader' in sys.argv else None
    names = sys.argv[sys.argv.index('--os') + 1].split(',') if '--os' in sys.argv else list(VOICES)
    os.makedirs(OUT, exist_ok=True)
    meta_path = os.path.join(OUT, 'sfx.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    with tempfile.TemporaryDirectory(dir=os.path.expanduser("~")) as tmp:   # a snap ffmpeg sees only the home folder
        for name in names:
            parts, at, sprite = {}, 0.0, []
            for kind, a in build(name, loader, tmp).items():
                a = level(kind, a)
                parts[kind] = [round(at, 3), round(len(a) / SR, 3)]
                sprite += [a, np.zeros((int(.08 * SR), a.shape[1]))]
                at += len(a) / SR + .08
            pcm = (np.clip(np.concatenate(sprite), -1, 1) * 32767).astype('<i2')
            wav = os.path.join(tmp, f'{name}.wav')
            with wave.open(wav, 'wb') as w:
                w.setnchannels(pcm.shape[1]); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
            mp3 = os.path.join(OUT, f'sfx-{name}.mp3')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '2', '-b:a', '96k', wav + '.mp3'], check=True)
            shutil.copyfile(wav + '.mp3', mp3)
            meta[name] = parts
            print(f'  {name:8s} {os.path.getsize(mp3):7d} bytes  ' + '  '.join(f'{k} {v[1]:.2f}s' for k, v in parts.items()))
    with open(meta_path, 'w') as fh: json.dump(meta, fh, separators=(',', ':'))


main()
