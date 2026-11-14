'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { caseValues, casePositions, isCaseKey } from '@/lib/cases';
import { FONT_OPTIONS, type Content, type Design } from '@/lib/types';

const charsNoSpace = (s: string) => s.replace(/\s/g, '').length;
const len = (s: string) => [...(s || '').replace(/\n/g, '')].length;

/** 산출물을 사람이 읽기 좋은 형태로 (조사·기획·이벤트·정보글 공용) */
export function Readable({ value, depth = 0 }: { value: any; depth?: number }) {
  if (value == null || value === '') return <span className="mute">—</span>;
  if (typeof value === 'string') return /^https?:\/\//.test(value) ? <a href={value} target="_blank">{value}</a> : <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>;
  if (typeof value !== 'object') return <span>{String(value)}</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="mute">—</span>;
    return <ol className="kv-list">{value.map((v, i) => <li key={i}><Readable value={v} depth={depth + 1} /></li>)}</ol>;
  }
  return (
    <div className={depth ? 'kv nested' : 'kv'}>
      {Object.entries(value).map(([k, v]) => (<div className="kv-row" key={k}><div className="kv-k">{k}</div><div className="kv-v"><Readable value={v} depth={depth + 1} /></div></div>))}
    </div>
  );
}

export function JsonEditor({ value, onSave, extra }: { value: any; onSave: (v: any) => void; extra?: React.ReactNode }) {
  const [txt, setTxt] = useState(JSON.stringify(value ?? null, null, 2));
  useEffect(() => setTxt(JSON.stringify(value ?? null, null, 2)), [value]);
  return (
    <div className="card">
      {extra}
      <textarea style={{ minHeight: 480 }} value={txt} onChange={(e) => setTxt(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="pri" onClick={() => { try { onSave(JSON.parse(txt)); } catch { alert('JSON 형식 오류'); } }}>저장</button>
      </div>
    </div>
  );
}

export function Sources({ r }: { r: any }) {
  if (!r?.facts) return null;
  return (
    <ul style={{ marginTop: 0 }}>
      {r.facts.map((f: any, i: number) => (
        <li key={i}>{f.claim} — <a href={f.source_url} target="_blank">{f.source_title || '출처'}</a> <span className="mute">{f.date}</span></li>
      ))}
    </ul>
  );
}

export function ScriptEditor({ c, onSave }: { c: Content; onSave: (v: any) => void }) {
  const [scenes, setScenes] = useState(c.script?.scenes || []);
  useEffect(() => setScenes(c.script?.scenes || []), [c.script]);
  const total = scenes.reduce((n, s) => n + charsNoSpace(s.narration), 0);
  const upd = (i: number, k: 'narration' | 'captions', v: string) =>
    setScenes(scenes.map((s, j) => (j === i ? { ...s, [k]: k === 'captions' ? v.split('\n') : v } : s)));
  return (
    <div className="card">
      <p>내레이션 총 <b className={total > 260 || total < 200 ? 'over' : ''}>{total}자</b> (공백 제외 · 권장 210~250자 ≈ 40초)</p>
      {scenes.map((s, i) => (
        <div key={s.id} className="grid2" style={{ marginBottom: 12 }}>
          <label>{s.id} 내레이션 ({charsNoSpace(s.narration)}자)<textarea style={{ minHeight: 90, fontFamily: 'inherit', fontSize: 14 }} value={s.narration} onChange={(e) => upd(i, 'narration', e.target.value)} /></label>
          <label>자막 (한 줄 = 자막 1컷, 14자 이하)<textarea style={{ minHeight: 90, fontFamily: 'inherit', fontSize: 14 }} value={s.captions.join('\n')} onChange={(e) => upd(i, 'captions', e.target.value)} /></label>
        </div>
      ))}
      <button className="pri" onClick={() => onSave({ total_chars: total, scenes })}>저장</button>
    </div>
  );
}

export function DesignEditor({ c, onSave }: { c: Content; onSave: (v: Design) => void }) {
  const [d, setD] = useState<Design | null>(c.design);
  const [txt, setTxt] = useState(JSON.stringify(c.design?.scenes ?? [], null, 2));
  const [sel, setSel] = useState(0);
  useEffect(() => { setD(c.design); setTxt(JSON.stringify(c.design?.scenes ?? [], null, 2)); }, [c.design]);
  if (!d) return <div className="card">디자인 단계를 먼저 실행하세요.</div>;
  const set = (path: 'theme' | 'fonts' | 'scale', k: string, v: any) => setD({ ...d, [path]: { ...(d as any)[path], [k]: v } });
  let scenes = d.scenes;
  try { scenes = JSON.parse(txt); } catch { /* 입력 중 */ }
  const scene = scenes[sel];
  const cap = c.script?.scenes.find((s) => s.id === scene?.id)?.captions?.[0];

  return (
    <div className="grid2">
      <div className="card">
        <h2>폰트</h2>
        {(['title', 'body'] as const).map((k) => (
          <div className="row" key={k} style={{ marginBottom: 8 }}>
            <span style={{ width: 70 }}>{k === 'title' ? '제목' : '본문/자막'}</span>
            <select value={d.fonts[k]} onChange={(e) => set('fonts', k, e.target.value)}>
              {FONT_OPTIONS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
        ))}
        <h2 style={{ marginTop: 16 }}>크기</h2>
        {(['title', 'body', 'caption'] as const).map((k) => (
          <div className="row" key={k}>
            <span style={{ width: 70 }}>{{ title: '제목', body: '본문', caption: '자막' }[k]}</span>
            <input type="range" min={0.6} max={1.6} step={0.05} value={d.scale[k]} onChange={(e) => set('scale', k, Number(e.target.value))} />
            <span>{Math.round(d.scale[k] * 100)}%</span>
          </div>
        ))}
        <h2 style={{ marginTop: 16 }}>색상</h2>
        <div className="row">
          {(Object.keys(d.theme) as (keyof Design['theme'])[]).map((k) => (
            <label key={k} className="mute">{k}<br /><input type="color" value={d.theme[k]} onChange={(e) => set('theme', k, e.target.value)} /></label>
          ))}
        </div>
        <h2 style={{ marginTop: 16 }}>장면 그래픽 (layout / motion / headline …)</h2>
        <textarea style={{ minHeight: 320 }} value={txt} onChange={(e) => setTxt(e.target.value)} />
        <button className="pri" style={{ marginTop: 8 }} onClick={() => { try { onSave({ ...d, scenes: JSON.parse(txt) }); } catch { alert('JSON 형식 오류'); } }}>저장</button>
      </div>
      <div className="card">
        <h2>미리보기 (정지 화면 근사치 · 실제 모션은 렌더 결과로 확인)</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          {scenes.map((s, i) => <button key={s.id} className={i === sel ? 'pri' : ''} onClick={() => setSel(i)}>{s.id}</button>)}
        </div>
        {scene && <ScenePreview d={d} s={scene} caption={cap} />}
      </div>
    </div>
  );
}

function ScenePreview({ d, s, caption }: { d: Design; s: any; caption?: string }) {
  const W = 300; const k = W / 1080;
  const hl = (t: string) => {
    let out: any[] = [t];
    for (const w of s.emphasis || []) {
      out = out.flatMap((part) => typeof part !== 'string' ? [part] : part.split(w).flatMap((p, i, a) => (i < a.length - 1 ? [p, <span key={w + i} style={{ color: d.theme.accent }}>{w}</span>] : [p])));
    }
    return out;
  };
  return (
    <div style={{ width: W, height: W * 16 / 9, background: `linear-gradient(160deg, ${d.theme.bg}, ${d.theme.bg2})`, borderRadius: 12, position: 'relative', overflow: 'hidden', color: d.theme.text }}>
      <div style={{ position: 'absolute', top: 70 * k, left: 60 * k, fontFamily: d.fonts.body, fontSize: 34 * k, color: d.theme.accent, fontWeight: 700 }}>오늘의 정책자금</div>
      <div style={{ position: 'absolute', inset: `${420 * k}px ${80 * k}px auto`, textAlign: 'center' }}>
        {s.icon && <div style={{ fontSize: 120 * k }}>{s.icon}</div>}
        {s.layout === 'stat' && <div style={{ fontFamily: d.fonts.title, fontSize: 220 * k * d.scale.title, color: d.theme.accent }}>{s.value}<span style={{ fontSize: 90 * k * d.scale.title }}>{s.unit}</span></div>}
        <div style={{ fontFamily: d.fonts.title, fontSize: 120 * k * d.scale.title, lineHeight: 1.15, wordBreak: 'keep-all' }}>{hl(s.headline || '')}</div>
        {s.sub && <div style={{ fontFamily: d.fonts.body, fontSize: 52 * k * d.scale.body, color: d.theme.sub, marginTop: 30 * k }}>{s.sub}</div>}
        {(s.layout === 'list' || s.layout === 'compare') && (
          <div style={{ display: 'grid', gridTemplateColumns: s.layout === 'compare' ? '1fr 1fr' : '1fr', gap: 20 * k, marginTop: 50 * k }}>
            {(s.items || []).map((it: string) => <div key={it} style={{ background: 'rgba(255,255,255,.1)', borderRadius: 24 * k, padding: 30 * k, fontFamily: d.fonts.body, fontWeight: 700, fontSize: 56 * k * d.scale.body }}>{it}</div>)}
          </div>
        )}
      </div>
      {caption && (
        <div style={{ position: 'absolute', bottom: 330 * k, left: 0, right: 0, textAlign: 'center' }}>
          <span style={{ background: 'rgba(0,0,0,.65)', padding: `${14 * k}px ${28 * k}px`, borderRadius: 16 * k, fontFamily: d.fonts.body, fontWeight: 900, fontSize: 64 * k * d.scale.caption }}>{caption}</span>
        </div>
      )}
    </div>
  );
}

export function CopyEditor({ c, onSave }: { c: Content; onSave: (v: any) => void }) {
  const [v, setV] = useState<any>(c.copy);
  useEffect(() => setV(c.copy), [c.copy]);
  if (!v) return <div className="card">카피라이팅 단계를 먼저 실행하세요.</div>;
  const f = (ch: 'youtube' | 'instagram', k: string, label: string, rows = 3, limit?: number) => (
    <label style={{ display: 'block', marginBottom: 10 }}>
      {label} {limit && <span className={len(v[ch][k]) > limit ? 'over' : 'mute'}>({len(v[ch][k])}/{limit})</span>}
      <textarea style={{ minHeight: rows * 22, fontFamily: 'inherit', fontSize: 14 }} value={v[ch][k] || ''} onChange={(e) => setV({ ...v, [ch]: { ...v[ch], [k]: e.target.value } })} />
    </label>
  );
  return (
    <div className="grid2">
      <div className="card"><h2>YouTube Shorts</h2>
        {f('youtube', 'title', '제목', 2, 100)}
        {f('youtube', 'description', '설명', 8, 5000)}
        {f('youtube', 'comment', '댓글 (카피 + 랜딩 링크)', 4)}
        <p className="mute">태그: {(v.youtube.tags || []).join(', ')}</p>
      </div>
      <div className="card"><h2>Instagram Reels</h2>
        {f('instagram', 'caption', '캡션 (링크 포함)', 12, 2200)}
        {f('instagram', 'first_comment', '첫 댓글', 3)}
        <p className="mute">인스타 캡션 링크는 클릭되지 않습니다 → 프로필 링크를 <b>/l/today</b> 로 고정해 두면 항상 최신 랜딩으로 연결됩니다.</p>
      </div>
      <button className="pri" onClick={() => onSave(v)}>저장</button>
    </div>
  );
}

export function LandingEditor({ slug, variant, slots, onSave }: { slug: string; variant: any; slots: any[]; onSave: (v: any) => void }) {
  const [vals, setVals] = useState<Record<string, string>>(variant?.values || {});
  const [cases, setCases] = useState<any[]>([]);
  useEffect(() => setVals(variant?.values || {}), [variant]);
  const pos = casePositions(slots);
  const nums = Object.keys(pos).map(Number).sort((a, b) => a - b);
  useEffect(() => { if (nums.length) api('/api/cases').then((d) => setCases(d.cases || [])).catch(() => {}); }, [nums.length]);
  if (!variant) return <div className="card">랜딩 문구 단계를 먼저 실행하세요. (활성 템플릿 필요)</div>;
  const text = slots.filter((s) => !isCaseKey(s.key));
  // 지금 n번 카드에 들어간 사례 (상단 표기 + 제목으로 찾음)
  const current = (n: number) => cases.find((c) => c.who === vals[`case${n}_who`] && c.title === vals[`case${n}_title`]);
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>랜딩 슬롯 문구 <span className={`tag ${variant.is_live ? 'ok' : ''}`}>{variant.is_live ? '공개 중' : '게시 시 공개'}</span></h2>
        <a href={`/l/${slug}`} target="_blank">미리보기 ↗</a>
      </div>
      {text.map((s) => {
        const n = len(vals[s.key] || '');
        return (
          <div className="slot" key={s.key}>
            <div><b>{s.label}</b><div className="mute">{s.key}</div></div>
            <textarea style={{ minHeight: 44, fontFamily: 'inherit', fontSize: 14 }} value={vals[s.key] || ''} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />
            <span className={s.max && n > s.max ? 'over' : 'mute'}>{n}/{s.max ?? '∞'}</span>
          </div>
        );
      })}
      {nums.length > 0 && (
        <>
          <h2 style={{ marginTop: 18 }}>실제 후기 카드 {nums.length}칸 <span className="mute">— 문구는 [실제 사례] 원문 그대로, 여기서는 카드별로 사례만 바꿈</span></h2>
          {!cases.length && <p className="mute">등록된 사례가 없어 템플릿의 기본 후기가 그대로 나갑니다. [실제 사례] 메뉴에서 등록하세요.</p>}
          {nums.map((n) => {
            const cur = current(n);
            return (
              <div className="slot" key={n}>
                <div><b>{n}번 카드</b><div className="mute">{vals[`case${n}_who`] || '템플릿 기본 후기'}</div></div>
                <select value={cur?.id ?? ''} onChange={(e) => {
                  const c = cases.find((x) => String(x.id) === e.target.value);
                  if (c) setVals({ ...vals, ...caseValues(c, n, pos[n]) });
                }} style={{ width: '100%' }}>
                  <option value="">{cur ? '' : vals[`case${n}_title`] ? `(목록에 없는 문구) ${vals[`case${n}_title`]}` : '템플릿 기본 후기'}</option>
                  {cases.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>#{c.id} {c.industry} · {c.amount} · {c.title}{c.verified ? '' : ' (확인 전)'}</option>)}
                </select>
                <span className="mute">{cur?.verified ? '확인 완료' : cur ? '확인 전' : ''}</span>
              </div>
            );
          })}
        </>
      )}
      <button className="pri" onClick={() => onSave(vals)}>저장</button>
    </div>
  );
}
