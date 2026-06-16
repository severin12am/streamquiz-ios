/**
 * Sound effects — procedural tones matching web lib/sounds.ts (no bundled assets).
 * Uses expo-av with generated WAV data URIs.
 */
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SoundId =
  | 'click'
  | 'join'
  | 'start'
  | 'go'
  | 'nextRound'
  | 'answerOther'
  | 'answerSelf'
  | 'tick'
  | 'correct'
  | 'wrong'
  | 'reveal'
  | 'winner'
  | 'tie'
  | 'point'
  | 'vote';

type WaveType = 'sine' | 'square' | 'triangle' | 'sawtooth';

interface ToneSpec {
  freq: number;
  start: number;
  duration: number;
  type?: WaveType;
  volume?: number;
}

const MUTE_KEY = 'whosmarter-sounds-muted';
const SAMPLE_RATE = 44100;

let soundsMuted = false;
let initialized = false;
const uriCache = new Map<SoundId, string>();

function waveSample(type: WaveType, phase: number): number {
  switch (type) {
    case 'square':
      return Math.sin(phase) >= 0 ? 1 : -1;
    case 'triangle': {
      const x = (phase / (2 * Math.PI)) % 1;
      return 1 - 4 * Math.abs(Math.round(x - 0.25) - (x - 0.25));
    }
    case 'sawtooth': {
      const x = (phase / (2 * Math.PI)) % 1;
      return 2 * (x - 0.5);
    }
    default:
      return Math.sin(phase);
  }
}

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function encodeWav(samples: Float32Array): string {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function synthesize(tones: ToneSpec[]): string {
  const endSec =
    tones.reduce((max, t) => Math.max(max, t.start + t.duration), 0) + 0.08;
  const numSamples = Math.ceil(endSec * SAMPLE_RATE);
  const buffer = new Float32Array(numSamples);

  for (const tone of tones) {
    const type = tone.type ?? 'sine';
    const vol = tone.volume ?? 0.12;
    const startSample = Math.floor(tone.start * SAMPLE_RATE);
    const endSample = Math.min(
      numSamples,
      Math.floor((tone.start + tone.duration) * SAMPLE_RATE),
    );
    for (let i = startSample; i < endSample; i++) {
      const t = (i - startSample) / SAMPLE_RATE;
      const env = Math.exp((-6 * t) / Math.max(tone.duration, 0.001));
      const phase = 2 * Math.PI * tone.freq * (tone.start + t);
      buffer[i] = (buffer[i] ?? 0) + waveSample(type, phase) * vol * env;
    }
  }

  return `data:audio/wav;base64,${encodeWav(buffer)}`;
}

function toneSpecsFor(id: SoundId): ToneSpec[] {
  const v = 0.11;
  switch (id) {
    case 'click':
      return [{ freq: 720, start: 0, duration: 0.04, type: 'square', volume: v * 0.45 }];
    case 'join':
      return [
        { freq: 523, start: 0, duration: 0.09, volume: v },
        { freq: 659, start: 0.07, duration: 0.11, volume: v },
      ];
    case 'start':
      return [
        { freq: 392, start: 0, duration: 0.1, volume: v },
        { freq: 523, start: 0.09, duration: 0.1, volume: v },
        { freq: 659, start: 0.18, duration: 0.12, volume: v },
        { freq: 784, start: 0.3, duration: 0.18, volume: v * 1.1 },
      ];
    case 'go':
      return [
        { freq: 880, start: 0, duration: 0.07, type: 'square', volume: v * 0.55 },
        { freq: 1174, start: 0.05, duration: 0.14, volume: v },
      ];
    case 'nextRound':
      return [
        { freq: 440, start: 0, duration: 0.08, volume: v * 0.7 },
        { freq: 554, start: 0.09, duration: 0.1, volume: v * 0.8 },
      ];
    case 'answerOther':
      return [{ freq: 494, start: 0, duration: 0.05, type: 'triangle', volume: v * 0.75 }];
    case 'answerSelf':
      return [
        { freq: 600, start: 0, duration: 0.05, volume: v },
        { freq: 800, start: 0.05, duration: 0.07, volume: v * 0.85 },
      ];
    case 'tick':
      return [{ freq: 1046, start: 0, duration: 0.035, type: 'square', volume: v * 0.35 }];
    case 'correct':
      return [
        { freq: 523, start: 0, duration: 0.09, volume: v },
        { freq: 659, start: 0.09, duration: 0.09, volume: v },
        { freq: 784, start: 0.18, duration: 0.18, volume: v * 1.1 },
      ];
    case 'wrong':
      return [
        { freq: 349, start: 0, duration: 0.12, type: 'sawtooth', volume: v * 0.45 },
        { freq: 262, start: 0.1, duration: 0.16, type: 'sawtooth', volume: v * 0.35 },
      ];
    case 'reveal':
      return [
        { freq: 220, start: 0, duration: 0.07, volume: v * 0.75 },
        { freq: 330, start: 0.09, duration: 0.18, volume: v },
      ];
    case 'winner':
      return [
        { freq: 523, start: 0, duration: 0.18, volume: v },
        { freq: 659, start: 0.11, duration: 0.18, volume: v },
        { freq: 784, start: 0.22, duration: 0.18, volume: v },
        { freq: 1046, start: 0.33, duration: 0.18, volume: v },
        { freq: 1046, start: 0.48, duration: 0.35, volume: v * 1.2 },
      ];
    case 'tie':
      return [
        { freq: 440, start: 0, duration: 0.14, volume: v },
        { freq: 440, start: 0.18, duration: 0.14, volume: v * 0.75 },
      ];
    case 'point':
      return [{ freq: 880, start: 0, duration: 0.07, volume: v * 0.55 }];
    case 'vote':
      return [
        { freq: 587, start: 0, duration: 0.06, volume: v * 0.65 },
        { freq: 740, start: 0.06, duration: 0.08, volume: v * 0.55 },
      ];
  }
}

function uriFor(id: SoundId): string {
  let uri = uriCache.get(id);
  if (!uri) {
    uri = synthesize(toneSpecsFor(id));
    uriCache.set(id, uri);
  }
  return uri;
}

export async function initSounds(): Promise<void> {
  if (initialized) return;
  initialized = true;
  soundsMuted = (await AsyncStorage.getItem(MUTE_KEY)) === '1';
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    allowsRecordingIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

export function isSoundsMuted(): boolean {
  return soundsMuted;
}

export async function setSoundsMuted(muted: boolean): Promise<void> {
  soundsMuted = muted;
  await AsyncStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

export function playSound(id: SoundId): void {
  if (soundsMuted) return;
  void (async () => {
    try {
      if (!initialized) await initSounds();
      const { sound } = await Audio.Sound.createAsync({ uri: uriFor(id) });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          void sound.unloadAsync();
        }
      });
      await sound.playAsync();
    } catch {
      // SFX must never break gameplay
    }
  })();
}
