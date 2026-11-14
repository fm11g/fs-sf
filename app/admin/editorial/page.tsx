'use client';
import { useEffect, useState } from 'react';
import UsagePanel from '../UsagePanel';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DIMENSIONS, DIM_KEYS, EDITORIAL_RULES } from '@/lib/editorial-taxonomy';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export default function Editorial() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [knobs, setKnobs] = useState<any>(null);
  const load = () => api('/api/editorial').then((r) => { setD(r); setKnobs(r.knobs); }).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);
  const act = async (name: string, body: any) => {
    setBusy(name);
    try { await api('/api/editorial', body); await load(); } catch (e: any) { alert(e.message); }
    setBusy(null);
  };
  if (!d) return <p>불러오는 중…</p>;
  const slots = d.plan?.slots || [];
  const content = (id: string) => d.contents.find((c: any) => c.id === id);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>편성표</h1>
        <button className="acc" disabled={!!busy} onClick={() => confirm('오늘부터 7일을 다시 편성합니다. 배정·고정된 슬롯은 그대로 둡니다.') && act('build', { action: 'build' })}>{busy === 'build' ? '편성 중… (20~40초)' : '다시 편성'}</button>
      </div>
      <p className="mute">채널 최종 점수가 높았던 형태를 살리되, 반복하지 않도록 새로움을 섞어 7일 순서를 정합니다. 매일 새 콘텐츠가 오늘 슬롯을 받아 조사·기획에 반영됩니다. 슬롯을 고치거나 고정할 수 있습니다.</p>

      {d.plan?.id && <UsagePanel query={`ref_table=editorial_plans&ref_id=${d.plan.id}`} title="이 편성표 만들 때 API 사용" compact />}
      {d.plan?.series_note && <div className="card"><b>이번 주 흐름</b><p style={{ margin: '6px 0 0' }}>{d.plan.series_note}</p></div>}
      {d.plan?.warnings?.length > 0 && <div className="card" style={{ borderColor: '#f0d36b' }}>{d.plan.warnings.map((w: string, i: number) => <p key={i} className="mute" style={{ margin: '3px 0' }}>⚠ {w}</p>)}</div>}

      <div className="lineup">
        {slots.map((x: any, i: number) => {
          const c = x.content_id ? content(x.content_id) : null;
          const isToday = x.date === today();
          const past = x.date < today();
          return (
            <div key={x.date} className={`slotcard ${isToday ? 'today' : ''} ${past ? 'past' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{x.order}. {x.date.slice(5)} ({WD[new Date(x.date + 'T00:00:00Z').getUTCDay()]}){isToday ? ' · 오늘' : ''}</b>
                <span>
                  {x.experiment && <span className="tag stale">실험</span>} {x.locked && <span className="tag">고정</span>}
                  <span className="mute"> 예상 ★{x.expected} · 새로움 {Math.round((x.novelty ?? 0) * 100)}%</span>
                </span>
              </div>
              <div className="dims">
                {DIM_KEYS.map((k) => (
                  <label key={k}><span className="mute">{DIMENSIONS[k].label}</span>
                    <select value={x[k] || ''} disabled={!!x.content_id || !!busy} onChange={(e) => act('edit', { action: 'update_slot', index: i, patch: { [k]: e.target.value } })}>
                      {(DIMENSIONS[k].values as readonly string[]).map((v) => <option key={v}>{v}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {x.title_idea && <p style={{ margin: '8px 0 2px' }}><b>{x.title_idea}</b></p>}
              {x.hook_example && <p className="mute" style={{ margin: '2px 0' }}>훅: {x.hook_example}</p>}
              <p className="mute" style={{ margin: '2px 0' }}>{x.reason}</p>
              {x.flow_note && <p className="mute" style={{ margin: '2px 0' }}>↪ {x.flow_note}</p>}
              <div className="row" style={{ marginTop: 6 }}>
                {c ? <Link href={`/admin/contents/${c.id}`} className="tag approved">배정: {c.topic || '조사 중'}</Link> : <span className="mute">아직 배정 안 됨</span>}
                <span style={{ flex: 1 }} />
                <button disabled={!!busy || !!x.content_id || i === 0} onClick={() => act('mv', { action: 'move', index: i, dir: -1 })}>↑</button>
                <button disabled={!!busy || !!x.content_id || i === slots.length - 1} onClick={() => act('mv', { action: 'move', index: i, dir: 1 })}>↓</button>
                <button disabled={!!busy || !!x.content_id} onClick={() => act('lock', { action: 'update_slot', index: i, patch: { locked: !x.locked } })}>{x.locked ? '고정 해제' : '고정'}</button>
              </div>
            </div>
          );
        })}
        {!slots.length && <div className="card">편성표가 없습니다. "다시 편성"을 누르거나 새 숏폼을 만들면 자동으로 생깁니다.</div>}
      </div>

      <div className="grid2">
        <div className="card">
          <h2>최근 흐름 <span className="mute">(최신순 — 겹침 확인)</span></h2>
          <table><tbody>
            {d.sequence.map((r: any, i: number) => (
              <tr key={i}><td className="mute">{String(r.at).slice(5, 10)}</td><td>{r.title}</td><td className="mute">{[r.attrs?.topic_category, r.attrs?.angle, r.attrs?.hook_type, r.attrs?.format].filter(Boolean).join(' · ')}</td><td>{r.score != null ? `★${r.score}` : <span className="mute">{r.source === 'factory' ? '미게시' : '-'}</span>}</td></tr>
            ))}
          </tbody></table>
        </div>
        <div className="card">
          <h2>편성 기준</h2>
          {knobs && (
            <>
              <div className="slot"><b>새로움 강도</b><input type="range" min={0} max={1} step={0.1} value={knobs.novelty_strength} onChange={(e) => setKnobs({ ...knobs, novelty_strength: Number(e.target.value) })} /><span>{knobs.novelty_strength} <span className="mute">{knobs.novelty_strength <= 0.3 ? '성과 우선' : knobs.novelty_strength >= 0.7 ? '새로움 우선' : '균형'}</span></span></div>
              <div className="slot"><b>실험 비율</b><input type="range" min={0} max={0.5} step={0.05} value={knobs.explore_rate} onChange={(e) => setKnobs({ ...knobs, explore_rate: Number(e.target.value) })} /><span>{Math.round(knobs.explore_rate * 7)}편/주</span></div>
              <div className="slot"><b>쿨다운</b><input type="number" min={1} max={14} value={knobs.cooldown_days} onChange={(e) => setKnobs({ ...knobs, cooldown_days: Number(e.target.value) })} /><span className="mute">일 — 같은 각도 재사용 간격</span></div>
              <div className="slot"><b>편성 사용</b><input type="checkbox" checked={knobs.editorial_enabled} onChange={(e) => setKnobs({ ...knobs, editorial_enabled: e.target.checked })} style={{ justifySelf: 'start' }} /><span className="mute">끄면 슬롯 없이 조사</span></div>
              <button className="pri" onClick={() => act('knobs', { action: 'knobs', knobs })}>저장</button>
            </>
          )}
          <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>반복 규칙</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{EDITORIAL_RULES.map((r) => <li key={r} className="mute">{r}</li>)}</ul>
          <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>후보 상위 (성과 × 새로움)</h3>
          {DIM_KEYS.slice(0, 3).map((k) => <p key={k} className="mute" style={{ margin: '3px 0' }}>{DIMENSIONS[k].label}: {(d.table[k] || []).slice(0, 4).map((c: any) => `${c.value} ${c.util}`).join(' · ')}</p>)}
        </div>
      </div>
    </>
  );
}
