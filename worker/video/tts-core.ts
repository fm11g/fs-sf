import crypto from 'node:crypto';

/**
 * AI 목소리 공용 코어 — 렌더 워커와 사이트(목소리 미리 듣기)가 같이 씀.
 * 제공자: fish(Fish Audio) · google(Google Cloud TTS) · openai(OpenAI) · oss(OpenAI 호환 /v1/audio/speech 서버)
 * 키는 env(연결·키 → process.env)에서, 목소리·속도 등은 설정(settings)에서 읽음.
 */
export type TtsProvider = 'fish' | 'elevenlabs' | 'google' | 'openai' | 'oss';
export const TTS_PROVIDERS: { id: TtsProvider; label: string; keys: string[]; note: string }[] = [
  { id: 'fish', label: 'Fish Audio', keys: ['FISH_AUDIO_API_KEY'], note: '보이스 복제·한국어 자연스러움' },
  { id: 'elevenlabs', label: 'ElevenLabs', keys: ['ELEVENLABS_API_KEY'], note: '고품질 다국어 · 보이스 라이브러리·복제' },
  { id: 'google', label: 'Google Cloud TTS', keys: ['GOOGLE_TTS_API_KEY|GOOGLE_SERVICE_ACCOUNT_JSON'], note: 'Chirp 3 HD · Neural2 · WaveNet 한국어 목소리, 매달 무료 구간' },
  { id: 'openai', label: 'OpenAI TTS', keys: ['OPENAI_API_KEY'], note: '말투 지시(instructions) 가능' },
  { id: 'oss', label: '오픈소스 (OpenAI 호환 서버)', keys: ['OSS_TTS_BASE_URL'], note: '직접 운영하는 /v1/audio/speech 서버 — 비용 0' },
];

export type TtsSettings = {
  tts_provider?: TtsProvider; tts_fallback?: TtsProvider[]; tts_speed?: number;
  voice_id?: string; tts_model?: string;                                   // fish
  eleven_voice_id?: string; eleven_model?: string; eleven_stability?: number; eleven_similarity?: number; eleven_style?: number; // elevenlabs
  google_voice?: string; google_lang?: string;                             // google
  openai_tts_model?: string; openai_tts_voice?: string; openai_tts_instructions?: string; // openai
  oss_tts_model?: string; oss_tts_voice?: string;                          // oss
};
export type TtsResult = { buf: Buffer; mime: string; ext: 'mp3' | 'wav'; provider: TtsProvider; model: string; priceKey: string; unitKind: '글자' | '분' };

type Env = Record<string, string | undefined>;
const has = (env: Env, spec: string) => spec.split('|').some((k) => !!env[k]);

/** 이 제공자를 쓸 키가 준비됐는지 */
export function ttsReady(p: TtsProvider, env: Env) {
  const d = TTS_PROVIDERS.find((x) => x.id === p);
  return !!d && d.keys.every((k) => has(env, k));
}
/** 설정 순서: 기본 제공자 → 예비 제공자들 (중복 제거) */
export function ttsChain(s: TtsSettings): TtsProvider[] {
  const out: TtsProvider[] = [];
  for (const p of [s.tts_provider || 'fish', ...(s.tts_fallback || [])]) if (TTS_PROVIDERS.some((x) => x.id === p) && !out.includes(p)) out.push(p);
  return out;
}

/** Google 목소리 이름 → 요금 등급 (단가표 키) */
export function googleTier(voice: string) {
  const v = voice.toLowerCase();
  if (v.includes('chirp3-hd') || v.includes('chirp-hd')) return 'tts-chirp3hd';
  if (v.includes('studio')) return 'tts-studio';
  if (v.includes('neural2') || v.includes('polyglot')) return 'tts-neural2';
  if (v.includes('wavenet')) return 'tts-wavenet';
  return 'tts-standard';
}

const sniff = (buf: Buffer): { mime: string; ext: 'mp3' | 'wav' } =>
  buf.subarray(0, 4).toString('ascii') === 'RIFF' ? { mime: 'audio/wav', ext: 'wav' } : { mime: 'audio/mpeg', ext: 'mp3' };

async function failText(res: Response) { return (await res.text().catch(() => '')).slice(0, 240); }

// ── Fish Audio ──
async function fish(text: string, s: TtsSettings, env: Env, signal: AbortSignal): Promise<TtsResult> {
  const model = s.tts_model || 's1';
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${env.FISH_AUDIO_API_KEY}`, 'Content-Type': 'application/json', model },
    body: JSON.stringify({ text, reference_id: s.voice_id || undefined, format: 'mp3', mp3_bitrate: 128, normalize: true, latency: 'normal', prosody: { speed: s.tts_speed || 1, volume: 0 } }),
  });
  if (!res.ok) throw new Error(`Fish Audio ${res.status}: ${await failText(res)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, ...sniff(buf), provider: 'fish', model, priceKey: 'tts', unitKind: '글자' };
}

// ── ElevenLabs ── POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128, 헤더 xi-api-key
async function elevenlabs(text: string, s: TtsSettings, env: Env, signal: AbortSignal): Promise<TtsResult> {
  const voice = s.eleven_voice_id;
  if (!voice) throw new Error('ElevenLabs 보이스 ID 가 비어 있음 → [설정 > AI 목소리]');
  const model = s.eleven_model || 'eleven_multilingual_v2';
  const num = (v: any, d: number) => (v == null || v === '' || isNaN(Number(v)) ? d : Math.max(0, Math.min(1, Number(v))));
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: 'POST', signal,
    headers: { 'xi-api-key': String(env.ELEVENLABS_API_KEY), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text, model_id: model, language_code: model.startsWith('eleven_multilingual_v2') ? undefined : 'ko',
      voice_settings: { stability: num(s.eleven_stability, 0.5), similarity_boost: num(s.eleven_similarity, 0.75), style: num(s.eleven_style, 0), use_speaker_boost: true, speed: Math.max(0.7, Math.min(1.2, s.tts_speed || 1)) },
    }),
  });
  if (!res.ok) {
    const t = await failText(res);
    const hint = res.status === 401 ? ' — API 키 확인' : res.status === 404 ? ' — 보이스 ID 확인 (내 보이스 라이브러리에 추가된 목소리여야 함)' : res.status === 422 ? ' — 모델·설정값 확인' : /quota|credits/i.test(t) ? ' — 크레딧 부족' : '';
    throw new Error(`ElevenLabs ${res.status}: ${t}${hint}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, ...sniff(buf), provider: 'elevenlabs', model: `${model} · ${voice}`, priceKey: 'tts', unitKind: '글자' };
}

// ── Google Cloud TTS ── API 키 또는 서비스 계정(JSON)
let gTok: { token: string; exp: number } | null = null;
async function googleToken(json: string, signal: AbortSignal) {
  if (gTok && gTok.exp > Date.now() + 60_000) return gTok.token;
  const sa = JSON.parse(json);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Google 서비스 계정 인증 실패 ${r.status}: ${j.error_description || j.error || ''}`);
  gTok = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return gTok.token;
}
async function google(text: string, s: TtsSettings, env: Env, signal: AbortSignal): Promise<TtsResult> {
  const voice = s.google_voice || 'ko-KR-Chirp3-HD-Charon';
  const lang = s.google_lang || voice.split('-').slice(0, 2).join('-') || 'ko-KR';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let url = 'https://texttospeech.googleapis.com/v1/text:synthesize';
  if (env.GOOGLE_TTS_API_KEY) url += `?key=${encodeURIComponent(env.GOOGLE_TTS_API_KEY)}`;
  else headers.Authorization = `Bearer ${await googleToken(env.GOOGLE_SERVICE_ACCOUNT_JSON!, signal)}`;
  const res = await fetch(url, {
    method: 'POST', signal, headers,
    body: JSON.stringify({ input: { text }, voice: { languageCode: lang, name: voice }, audioConfig: { audioEncoding: 'MP3', speakingRate: s.tts_speed || 1 } }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.audioContent) {
    const m = j.error?.message || '';
    const hint = res.status === 403 ? ' — Google Cloud 콘솔에서 Cloud Text-to-Speech API 사용 설정·결제 연결 확인' : res.status === 400 && /voice/i.test(m) ? ' — 목소리 이름 확인 (예: ko-KR-Chirp3-HD-Charon)' : '';
    throw new Error(`Google TTS ${res.status}: ${m}${hint}`);
  }
  const buf = Buffer.from(j.audioContent, 'base64');
  return { buf, ...sniff(buf), provider: 'google', model: voice, priceKey: googleTier(voice), unitKind: '글자' };
}

// ── OpenAI · 오픈소스(OpenAI 호환) ──
async function openaiLike(kind: 'openai' | 'oss', text: string, s: TtsSettings, env: Env, signal: AbortSignal): Promise<TtsResult> {
  const base = kind === 'openai' ? 'https://api.openai.com/v1' : String(env.OSS_TTS_BASE_URL || '').replace(/\/+$/, '').replace(/\/audio\/speech$/, '');
  const key = kind === 'openai' ? env.OPENAI_API_KEY : env.OSS_TTS_API_KEY;
  const model = (kind === 'openai' ? s.openai_tts_model || 'gpt-4o-mini-tts' : s.oss_tts_model) || 'tts-1';
  const voice = (kind === 'openai' ? s.openai_tts_voice || 'alloy' : s.oss_tts_voice) || 'alloy';
  const body: any = { model, voice, input: text, response_format: 'mp3', speed: s.tts_speed || 1 };
  if (kind === 'openai' && s.openai_tts_instructions && !/^tts-1/.test(model)) body.instructions = s.openai_tts_instructions;
  const res = await fetch(`${base}/audio/speech`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${kind === 'openai' ? 'OpenAI' : '오픈소스'} TTS ${res.status}: ${await failText(res)}${kind === 'oss' && res.status === 404 ? ' — 서버 주소가 OpenAI 호환(/v1)인지 확인' : ''}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) throw new Error(`${kind} TTS 응답이 비어 있음 (${buf.length}바이트)`);
  return { buf, ...sniff(buf), provider: kind, model: `${model} · ${voice}`, priceKey: 'tts', unitKind: kind === 'openai' ? '분' : '글자' };
}

/** 한 제공자로 합성 (90초 응답 제한) */
export async function synth(provider: TtsProvider, text: string, s: TtsSettings, env: Env, timeoutMs = 90_000): Promise<TtsResult> {
  const signal = AbortSignal.timeout(timeoutMs);
  if (!ttsReady(provider, env)) throw new Error(`${TTS_PROVIDERS.find((x) => x.id === provider)?.label || provider} 키가 비어 있음 → [연결·키]`);
  if (provider === 'fish') return fish(text, s, env, signal);
  if (provider === 'elevenlabs') return elevenlabs(text, s, env, signal);
  if (provider === 'google') return google(text, s, env, signal);
  return openaiLike(provider, text, s, env, signal);
}

/** 순서대로 시도 — 첫 성공 제공자를 돌려줌. 실패 사유는 tried 에 */
export async function synthChain(text: string, s: TtsSettings, env: Env, only?: TtsProvider) {
  const tried: { provider: TtsProvider; error: string }[] = [];
  for (const p of only ? [only] : ttsChain(s)) {
    try { return { result: await synth(p, text, s, env), tried }; }
    catch (e: any) { tried.push({ provider: p, error: String(e.message || e) }); }
  }
  throw new Error(`AI 목소리 실패 — ${tried.map((t) => `${t.provider}: ${t.error}`).join(' / ') || '사용할 제공자 없음'}`);
}
