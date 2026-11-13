'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { STATE_KO, STEP_DEFS } from '@/lib/steps';

const ago = (t?: string) => {
  if (!t) return '';
  const m = Math.round((Date.now() - +new Date(t)) / 60000);
  return m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};

export default function Board() {
  const [items, setItems] = useState<any[]>([]);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [slot, setSlot] = useState<any>(null);
  const load = () => api('/api/board').then((d) => setItems(d.items)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  useEffect(() => { api('/api/editorial').then((r) => { const t = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); setSlot((r.plan?.slots || []).find((x: any) => x.date === t) || null); }).catch(() => {}); }, []);

  const create = async () => {
    setBusy(true);
    try { const { id } = await api('/api/contents', { topic }); location.href = `/admin/contents/${id}`; }
    catch (e: any) { alert(e.message); setBusy(false); }
  };
  const factory = async () => {
    if (!confirm('워커가 조사부터 자동으로 진행합니다. "사람이 결정"인 단계에서 멈추고 검수를 기다립니다.')) return;
    setBusy(true);
    try { await api('/api/factory', { topic }); alert('워커가 시작했습니다. 1~2분 뒤 현황판에 나타납니다.'); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const cur = (c: any) => c.current_step || 'research';
  const stateOf = (c: any) => c.steps?.[cur(c)]?.state || 'pending';
  const waiting = items.filter((c) => stateOf(c) === 'review');
  const count = (st: string) => items.filter((c) => cur(c) !== 'done' && stateOf(c) === st).length;
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <>
      <h1>현황판</h1>
      <div className="kpis">
        <div className={`kpi ${waiting.length ? 'hot' : ''}`}><b>{waiting.length}</b>내 결정 대기</div>
        <div className="kpi"><b>{count('running')}</b>작업 중</div>
        <div className="kpi"><b>{count('stale') + count('rejected')}</b>재작업 필요</div>
        <div className="kpi"><b>{count('failed')}</b>실패</div>
        <div className="kpi"><b>{items.filter((c) => c.published_at?.slice(0, 10) === todayStr).length}</b>오늘 게시</div>
      </div>

      {slot && (
        <div className="slotbanner">📅 오늘 편성 — <b>{[slot.topic_category, slot.angle, slot.hook_type, slot.format, slot.target].join(' · ')}</b>{slot.experiment ? ' [실험]' : ''}{slot.title_idea ? ` · ${slot.title_idea}` : ''}{slot.content_id ? ' · 배정됨' : ' · 새 숏폼을 만들면 이 슬롯이 배정됩니다'} <Link href="/admin/editorial">편성표</Link></div>
      )}
      <div className="card">
        <div className="row">
          <input style={{ flex: 1, minWidth: 260 }} placeholder="주제 힌트 (비우면 오늘 편성 슬롯과 시의성으로 AI가 고릅니다)" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <button className="pri" disabled={busy} onClick={create}>새 숏폼 (작업대 열기)</button>
          <button className="acc" disabled={busy} onClick={factory}>⚡ 워커로 자동 생산</button>
        </div>
      </div>

      {waiting.length > 0 && (
        <div className="card" style={{ borderColor: '#f0b400' }}>
          <h2>지금 결정이 필요한 것</h2>
          <table><tbody>
            {waiting.map((c) => {
              const d = STEP_DEFS.find((x) => x.key === cur(c))!;
              return (
                <tr key={c.id}>
                  <td><span className="tag review">{d.no} {d.label}</span></td>
                  <td><Link href={`/admin/contents/${c.id}`}>{c.topic || c.slug}</Link></td>
                  <td className="mute">{ago(c.steps[d.key]?.finished_at)}부터 대기</td>
                </tr>
              );
            })}
          </tbody></table>
        </div>
      )}

      <div className="kanban">
        {[...STEP_DEFS, { key: 'done', no: '✓', label: '완료' } as any].map((d) => {
          const list = items.filter((c) => cur(c) === d.key);
          return (
            <div className="col" key={d.key}>
              <h3><span>{d.no} {d.label}</span><span>{list.length}</span></h3>
              {list.slice(0, d.key === 'done' ? 8 : 50).map((c) => {
                const st = d.key === 'done' ? 'approved' : stateOf(c);
                return (
                  <Link key={c.id} href={`/admin/contents/${c.id}`} className={`kcard ${st}`}>
                    <b>{c.topic || '(주제 조사 전)'}</b>
                    <span className={`tag ${st}`}>{d.key === 'done' ? '게시 완료' : STATE_KO[st]}</span> <span className="mute">{ago(c.updated_at)}</span>
                    <div className="dots">{STEP_DEFS.map((s) => <span key={s.key} className={`dot ${c.steps?.[s.key]?.state || 'pending'}`} title={`${s.label}: ${STATE_KO[c.steps?.[s.key]?.state || 'pending']}`} />)}</div>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="mute">카드 위치 = 아직 승인되지 않은 첫 단계. 점 10개 = 단계별 상태(회색 대기 · 파랑 작업 중 · 노랑 검수 대기 · 초록 승인 · 보라 재작업 필요 · 빨강 반려/실패)</p>
    </>
  );
}
