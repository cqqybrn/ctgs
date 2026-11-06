"""Render an original 96-second march. No recordings, samples or existing melody.

Requires numpy and ffmpeg. Composition and synthesis released under CC0-1.0.
"""
import json
import pathlib
import subprocess
import tempfile
import wave

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
RATE = 22050
BPM = 120
BEAT = 60 / BPM
SECONDS = 96
rng = np.random.default_rng(20261106)
mix = np.zeros(RATE * SECONDS, dtype=np.float64)


def add(sound, at, gain):
    indices = (np.arange(len(sound)) + int(at * RATE)) % len(mix)
    np.add.at(mix, indices, sound * gain)


def note(midi, beats, brass=True):
    length = beats * BEAT
    t = np.arange(int((length + .09) * RATE)) / RATE
    frequency = 440 * 2 ** ((midi - 69) / 12)
    phase = 2 * np.pi * frequency * (t + .00025 * np.sin(2 * np.pi * 5.3 * t))
    sound = np.zeros_like(t)
    for h in range(1, 11 if brass else 5):
        sound += np.sin(phase * h) / h ** (1.1 if brass else 1.8)
    attack = np.minimum(t / .025, 1)
    release = np.clip((length + .09 - t) / .13, 0, 1)
    return np.tanh(sound * .6) * attack * release


# Seeded original pentatonic motifs, developed across three sections.
scale = np.array([60, 62, 64, 67, 69, 72, 74])
motifs = []
for phrase in range(4):
    pos = 3
    melody = []
    for beat in range(16):
        pos = int(np.clip(pos + rng.choice([-2, -1, 0, 1, 2]), 0, 6))
        melody.append(int(scale[pos]))
    melody[-1] = [67, 64, 62, 60][phrase]
    motifs.append(melody)

for bar in range(48):
    start = bar * 4 * BEAT
    section = bar // 16
    motif = motifs[(bar // 4) % 4]
    notes = motif[(bar % 4) * 4:(bar % 4 + 1) * 4]
    root = [48, 53, 48, 55][bar % 4]
    for beat, pitch in enumerate(notes):
        duration = .78 if beat != 3 else .9
        # Middle section is quieter with a lower reed-like voice.
        add(note(pitch + (12 if section == 2 else 0), duration), start + beat * BEAT, .18)
        if section != 1:
            add(note(pitch - 12, duration, False), start + beat * BEAT, .10)
        add(note(root - 12 if beat % 2 == 0 else root - 5, .66, False), start + beat * BEAT, .22)
        if beat % 2:
            for chord in [root, root + 4, root + 7]:
                add(note(chord, .42), start + beat * BEAT, .055)
        t = np.arange(int(.13 * RATE)) / RATE
        if beat % 2:
            noise = rng.standard_normal(len(t))
            snare = (noise - np.roll(noise, 1)) * np.exp(-t * 36)
            add(snare, start + beat * BEAT, .045)
        else:
            drum = np.sin(2 * np.pi * (72 * t - 45 * t * t)) * np.exp(-t * 28)
            add(drum, start + beat * BEAT, .25)

# A restrained stationary surface-noise bed evokes a period gramophone.
mix += rng.standard_normal(len(mix)) * .0012
mix = np.tanh(mix * 1.1)
mix *= .89 / np.max(np.abs(mix))
output = ROOT / 'assets' / 'bgm' / '\u9769\u547d\u6b4c\u66f2.mp3'
with tempfile.TemporaryDirectory() as directory:
    wav = pathlib.Path(directory) / 'march.wav'
    with wave.open(str(wav), 'wb') as f:
        f.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        f.writeframes((mix * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(wav),
                    '-af', 'highpass=f=180,lowpass=f=3400', '-ar', '44100', '-ac', '2',
                    '-b:a', '160k', str(output)], check=True)

credits_path = ROOT / 'assets' / 'AUDIO_LICENSES.json'
credits = json.loads(credits_path.read_text(encoding='utf-8'))
credits['assets'][output.relative_to(ROOT).as_posix()] = {
    'sources': [{
        'title': 'Original v2 gramophone march (2026-11-06)',
        'author': 'ctgs project procedural composition',
        'license': 'CC0 1.0',
        'license_url': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'source_url': 'https://github.com/cqqybrn/ctgs/blob/v2/tools/generate_v2_march.py',
    }],
    'processing': 'Original seeded melody; additive brass, bass and synthesized drums; no external samples. Circular tail mixing, gramophone bandpass, stereo 44.1kHz 160kbps MP3.',
    'duration_seconds': SECONDS,
}
temp = credits_path.with_suffix('.tmp')
temp.write_text(json.dumps(credits, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
temp.replace(credits_path)
print('Rendered original 96-second march and registered CC0 source.')
