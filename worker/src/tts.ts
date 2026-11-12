import { parseBuffer } from 'music-metadata';
import { env } from './env.js';

/** Fish Audio TTS → mp3 Buffer + 길이(초) */
export async function tts(text: string, s: { voice_id?: string; tts_model?: string; tts_speed?: number }) {
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('FISH_AUDIO_API_KEY')}`,
      'Content-Type': 'application/json',
      model: s.tts_model || 's1',
    },
    body: JSON.stringify({
      text,
      reference_id: s.voice_id || undefined,
      format: 'mp3',
      mp3_bitrate: 128,
      normalize: true,
      latency: 'normal',
      prosody: { speed: s.tts_speed || 1, volume: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Fish Audio TTS 실패 ${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await parseBuffer(buf, { mimeType: 'audio/mpeg' });
  const duration = meta.format.duration ?? text.replace(/\s/g, '').length / 6;
  return { buf, duration };
}
