import { parseBuffer } from 'music-metadata';
import { synthChain, type TtsProvider, type TtsSettings } from '../video/tts-core.js';

/**
 * AI 목소리 → 오디오 Buffer + 길이(초)
 * provider 를 주면 그 제공자만(영상 한 편은 같은 목소리로), 없으면 설정 순서대로 시도해 첫 성공 제공자를 씀.
 * 제공자: Fish Audio · Google Cloud TTS · OpenAI · 오픈소스(OpenAI 호환) — worker/video/tts-core.ts
 */
export async function tts(text: string, s: TtsSettings, provider?: TtsProvider) {
  let last: any;
  for (let attempt = 0; attempt < (provider ? 2 : 1); attempt++) { // 정해진 제공자는 일시 오류 대비 1회 재시도
    try {
      const { result: r, tried } = await synthChain(text, s, process.env, provider);
      const meta = await parseBuffer(r.buf, { mimeType: r.mime });
      const duration = meta.format.duration ?? text.replace(/\s/g, '').length / 6;
      return { ...r, duration, tried };
    } catch (e) { last = e; }
  }
  throw last;
}
