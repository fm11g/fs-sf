'use client';
import { useEffect, useRef, useState } from 'react';

type P = { id: 'fish' | 'elevenlabs' | 'google' | 'openai' | 'oss'; label: string; note: string; ready: boolean };

/** Google 한국어 목소리 예시 (직접 입력도 가능) — 이름에 등급이 들어 있음: Chirp3-HD > Neural2 > WaveNet > Standard */
const GOOGLE_VOICES = [
  'ko-KR-Chirp3-HD-Charon', 'ko-KR-Chirp3-HD-Fenrir', 'ko-KR-Chirp3-HD-Orus', 'ko-KR-Chirp3-HD-Puck',
  'ko-KR-Chirp3-HD-Aoede', 'ko-KR-Chirp3-HD-Kore', 'ko-KR-Chirp3-HD-Leda', 'ko-KR-Chirp3-HD-Zephyr',
  'ko-KR-Neural2-A', 'ko-KR-Neural2-B', 'ko-KR-Neural2-C', 'ko-KR-Wavenet-A', 'ko-KR-Wavenet-B', 'ko-KR-Wavenet-C', 'ko-KR-Wavenet-D',
  'ko-KR-Standard-A', 'ko-KR-Standard-B', 'ko-KR-Standard-C', 'ko-KR-Standard-D',
];
const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'fable', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

/**
 * 설정 > AI 목소리 — 제공자 선택 · 예비 순서 · 제공자별 목소리 · 미리 듣기(저장 전 값으로도)
 */
export default function VoicePanel({ v, setV, onSave }: { v: any; setV: (x: any) => void; onSave: () => void }) {
  const [ps, setPs] = useState<P[]>([]);
  const [text, setText] = useState('연매출 5억 넘는 제조업 대표님, 올해 시설자금 최대 60억까지 지원받을 수 있습니다.');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => { fetch('/api/tts/preview').then((r) => r.json()).then((d) => setPs(d.providers || [])).catch(() => {}); }, []);

  const provider = v.tts_provider || 'fish';
  const fallback: string[] = v.tts_fallback || [];
  const set = (k: string, val: any) => setV({ ...v, [k]: val });

  const preview = async (only?: string) => {
    setBusy(only || 'chain'); setMsg('');
    try {
      const r = await fetch('/api/tts/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, provider: only, settings: v }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `실패 ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      if (audio.current) { audio.current.src = url; audio.current.play().catch(() => {}); }
      setMsg(`▶ ${ps.find((p) => p.id === r.headers.get('x-tts-provider'))?.label || r.headers.get('x-tts-provider')} · ${decodeURIComponent(r.headers.get('x-tts-model') || '')}`);
    } catch (e: any) { setMsg(`⚠ ${e.message}`); }
    setBusy('');
  };

  return (
    <div className="card" id="tpf-voice">
      <h2>🎙 AI 목소리</h2>
      <p className="mute" style={{ marginTop: -6 }}>렌더할 때 쓸 TTS. 기본 제공자가 실패하면 예비 제공자로 넘어갑니다(영상 한 편은 같은 목소리로). 키는 [연결·키] &gt; AI 목소리에서 넣습니다.</p>

      <div className="vp-grid">
        {ps.map((p) => (
          <label key={p.id} className={`vp-card ${provider === p.id ? 'on' : ''}`}>
            <input type="radio" name="tts" checked={provider === p.id} onChange={() => setV({ ...v, tts_provider: p.id, tts_fallback: fallback.filter((x) => x !== p.id) })} />
            <div>
              <b>{p.label}</b> <span className={`tag ${p.ready ? 'approved' : 'rejected'}`}>{p.ready ? '키 있음' : '키 없음'}</span>
              <div className="mute" style={{ fontSize: 12 }}>{p.note}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="slot">
        <b>예비 제공자 (순서대로)</b>
        <div className="chips">
          {ps.filter((p) => p.id !== provider).map((p) => {
            const i = fallback.indexOf(p.id);
            return (
              <label key={p.id}>
                <input type="checkbox" checked={i >= 0} onChange={(e) => set('tts_fallback', e.target.checked ? [...fallback, p.id] : fallback.filter((x) => x !== p.id))} />
                {i >= 0 ? `${i + 1}. ` : ''}{p.label}{!p.ready && ' (키 없음)'}
              </label>
            );
          })}
        </div>
        <span />
      </div>
      <div className="slot"><b>말 속도</b><input type="number" step="0.05" min={0.5} max={2} value={v.tts_speed ?? 1} onChange={(e) => set('tts_speed', Number(e.target.value))} /><span className="mute">1.0 = 기본 (모든 제공자 공통)</span></div>

      {(provider === 'fish' || fallback.includes('fish')) && <>
        <h3>Fish Audio</h3>
        <div className="slot"><b>보이스 ID (reference_id)</b><input value={v.voice_id || ''} onChange={(e) => set('voice_id', e.target.value.trim())} placeholder="fish.audio 목소리 페이지 주소 끝의 ID" /><span /></div>
        <div className="slot"><b>모델</b><input value={v.tts_model || ''} onChange={(e) => set('tts_model', e.target.value.trim())} placeholder="s1" /><span /></div>
      </>}
      {(provider === 'elevenlabs' || fallback.includes('elevenlabs')) && <>
        <h3>ElevenLabs</h3>
        <div className="slot"><b>보이스 ID</b><input value={v.eleven_voice_id || ''} onChange={(e) => set('eleven_voice_id', e.target.value.trim())} placeholder="Voices → 목소리 → ID 복사 (예: JBFqnCBsd6RMkjVDRZzb)" /><span className="mute">내 보이스 라이브러리에 추가한 목소리</span></div>
        <div className="slot"><b>모델</b><input list="e-models" value={v.eleven_model || ''} onChange={(e) => set('eleven_model', e.target.value.trim())} placeholder="eleven_multilingual_v2" /><span className="mute">multilingual_v2 안정적 · v3 표현력 · flash_v2_5 빠르고 저렴</span></div>
        <datalist id="e-models">{['eleven_multilingual_v2', 'eleven_v3', 'eleven_flash_v2_5', 'eleven_turbo_v2_5'].map((x) => <option key={x} value={x} />)}</datalist>
        <div className="slot"><b>안정성 · 유사도 · 스타일</b>
          <div className="row" style={{ gap: 6 }}>
            {([['eleven_stability', 0.5], ['eleven_similarity', 0.75], ['eleven_style', 0]] as const).map(([k, d]) => (
              <input key={k} type="number" step="0.05" min={0} max={1} style={{ width: 80 }} value={v[k] ?? d} onChange={(e) => set(k, Number(e.target.value))} />
            ))}
          </div>
          <span className="mute">0~1 · 안정성↑ 차분·일정 / 스타일↑ 감정 과장 (뉴스 톤은 안정성 0.6~0.7, 스타일 0 권장) · 속도는 0.7~1.2 범위로 적용</span>
        </div>
      </>}
      {(provider === 'google' || fallback.includes('google')) && <>
        <h3>Google Cloud TTS</h3>
        <div className="slot"><b>목소리 이름</b><input list="g-voices" value={v.google_voice || ''} onChange={(e) => set('google_voice', e.target.value.trim())} placeholder="ko-KR-Chirp3-HD-Charon" /><span className="mute">Chirp3-HD $30 · Neural2 $16 · WaveNet/Standard $4 (100만 자당)</span></div>
        <datalist id="g-voices">{GOOGLE_VOICES.map((x) => <option key={x} value={x} />)}</datalist>
        <div className="slot"><b>언어 코드</b><input value={v.google_lang || ''} onChange={(e) => set('google_lang', e.target.value.trim())} placeholder="ko-KR (비우면 목소리 이름에서)" /><span /></div>
      </>}
      {(provider === 'openai' || fallback.includes('openai')) && <>
        <h3>OpenAI</h3>
        <div className="slot"><b>모델</b><input value={v.openai_tts_model || ''} onChange={(e) => set('openai_tts_model', e.target.value.trim())} placeholder="gpt-4o-mini-tts" /><span className="mute">gpt-4o-mini-tts 는 2027-01-06 종료 예정 — 후속 모델명으로 바꿔 넣을 수 있음</span></div>
        <div className="slot"><b>목소리</b><input list="o-voices" value={v.openai_tts_voice || ''} onChange={(e) => set('openai_tts_voice', e.target.value.trim())} placeholder="alloy" /><span /></div>
        <datalist id="o-voices">{OPENAI_VOICES.map((x) => <option key={x} value={x} />)}</datalist>
        <div className="slot"><b>말투 지시</b><input value={v.openai_tts_instructions || ''} onChange={(e) => set('openai_tts_instructions', e.target.value)} placeholder="차분하고 신뢰감 있는 뉴스 앵커 톤, 숫자는 또박또박" /><span className="mute">tts-1 계열은 무시</span></div>
      </>}
      {(provider === 'oss' || fallback.includes('oss')) && <>
        <h3>오픈소스 (OpenAI 호환 서버)</h3>
        <div className="slot"><b>모델</b><input value={v.oss_tts_model || ''} onChange={(e) => set('oss_tts_model', e.target.value.trim())} placeholder="서버가 요구하는 모델명 (예: tts-1, kokoro)" /><span /></div>
        <div className="slot"><b>목소리</b><input value={v.oss_tts_voice || ''} onChange={(e) => set('oss_tts_voice', e.target.value.trim())} placeholder="예: ko-KR-SunHiNeural (서버마다 다름)" /><span className="mute">서버 주소·키는 [연결·키]</span></div>
      </>}

      <h3>미리 듣기</h3>
      <div className="slot"><b>문장</b><input value={text} onChange={(e) => setText(e.target.value)} /><span /></div>
      <div className="row">
        <button disabled={!!busy} onClick={() => preview()}>{busy === 'chain' ? '만드는 중…' : '▶ 지금 설정으로 듣기 (예비 포함)'}</button>
        {ps.map((p) => <button key={p.id} disabled={!!busy || !p.ready} onClick={() => preview(p.id)}>{busy === p.id ? '…' : `▶ ${p.label}`}</button>)}
        <button className="pri" onClick={onSave}>저장</button>
      </div>
      {msg && <p className={msg.startsWith('⚠') ? 'bad' : 'mute'} style={{ margin: '8px 0 0' }}>{msg}</p>}
      <audio ref={audio} controls style={{ width: '100%', marginTop: 8 }} />
      <p className="mute" style={{ marginBottom: 0 }}>미리 듣기는 저장하지 않은 값으로도 됩니다. 마음에 들면 [저장]을 눌러야 렌더에 적용됩니다.</p>
      <style>{`
        #tpf-voice .vp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:8px 0 12px}
        #tpf-voice .vp-card{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:10px;cursor:pointer}
        #tpf-voice .vp-card.on{border-color:var(--pri);background:#eef2ff}
        #tpf-voice h3{font-size:14px;margin:14px 0 4px}
      `}</style>
    </div>
  );
}
