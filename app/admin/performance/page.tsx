'use client';
import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

const fmt = (n: any) => (n == null ? '–' : Number(n) >= 10000 ? `${Math.round(Number(n) / 1000) / 10}만` : Number(n).toLocaleString('ko-KR'));
const CH_KO: Record<string, string> = { youtube: '유튜브', instagram: '인스타', seo: '검색', blog: '정보글', naver: '네이버', factory: '공장 랜딩', direct: '직접', referral: '외부', ads: '광고', kakao: '카카오', facebook: '페이스북', unknown: '기타' };
type SortKey = 'published_at' | 'db' | 'views' | 'shares' | 'subs' | 'score' | 'db_per_1k';
const SORTS: [SortKey, string][] = [['db', 'DB 많은 순'], ['published_at', '최신순'], ['score', '성과 점수'], ['views', '조회'], ['shares', '공유'], ['subs', '구독'], ['db_per_1k', 'DB/1천 조회']];

/** 성과 한눈에 — 콘텐츠마다 DB(홈페이지 신청) · 조회 · 좋아요 · 댓글 · 공유 · 구독 · 점수 · 링크 */
export default function Performance() {
  const [d, setD] = useState<any>(null);
  const [days, setDays] = useState(90);
  const [sort, setSort] = useState<SortKey>('db');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => api(`/api/performance?days=${days}`).then(setD).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const val = (r: any): number => sort === 'published_at' ? Date.parse(r.published_at || 0) : sort === 'db' ? r.db.total ?? -1 : sort === 'score' ? r.score ?? -1 : sort === 'db_per_1k' ? r.db_per_1k ?? -1 : r.total[sort] ?? -1;
    return [...(d?.rows || [])].sort((a, b) => val(b) - val(a) || Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0));
  }, [d, sort]);

  const refresh = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api('/api/site', { action: 'metrics' }, 'POST');
      setMsg(r.ok ? `DB 수 갱신 ${r.leads_updated}건 · 홈페이지 관리자에 지표 ${r.sent}/${r.total}건 전송` : `확인: ${r.warning || '연동 미설정'}`);
      await load();
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };

  if (!d) return <p>{msg || '불러오는 중…'}</p>;
  const t = d.totals;
  return (
    <>
      <h1>성과 한눈에</h1>
      <p className="mute" style={{ marginTop: -12 }}>업로드된 숏폼마다 홈페이지 신청(DB) · 조회 · 공유 · 구독을 한 줄로. 성과 점수는 DB 가 가장 큰 비중(기본 40%)이고, 7일 확정 후 SOP 학습에 들어갑니다.</p>

      <div className="kpis">
        <div className="kpi"><b>{fmt(t.db)}</b>DB (홈페이지 신청)</div>
        <div className="kpi"><b>{fmt(t.views)}</b>조회</div>
        <div className="kpi"><b>{fmt(t.likes)}</b>좋아요</div>
        <div className="kpi"><b>{fmt(t.comments)}</b>댓글</div>
        <div className="kpi"><b>{fmt(t.shares)}</b>공유</div>
        <div className="kpi"><b>{fmt(t.subs)}</b>구독 · 팔로우 증가</div>
        <div className="kpi"><b>{t.with_db}/{t.contents}</b>DB 난 숏폼</div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            {[30, 90, 180, 365].map((n) => <button key={n} className={days === n ? 'pri' : ''} onClick={() => setDays(n)}>{n}일</button>)}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          <div className="row">
            <span className="mute">{msg}</span>
            <button disabled={busy} onClick={refresh}>{busy ? '받아오는 중…' : 'DB 수 받아오기 · 홈페이지에 지표 보내기'}</button>
          </div>
        </div>
        {!d.linked && <p className="warnline">홈페이지 연동 전이라 DB 열이 비어 있습니다 — [설정 › 홈페이지 연동] · [연결·키 › TPF_ADMIN_KEY]</p>}
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="perf-table">
            <thead>
              <tr>
                <th>공개일</th><th>숏폼</th><th className="n">DB</th><th className="n">조회</th><th className="n">좋아요</th><th className="n">댓글</th>
                <th className="n">공유</th><th className="n">구독</th><th className="n">DB/1천</th><th className="n">점수</th><th>링크</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={11} className="mute" style={{ textAlign: 'center', padding: 30 }}>기간 안에 업로드된 숏폼이 없습니다.</td></tr>}
              {rows.map((r: any) => (
                <Fragment key={r.id}>
                  <tr className={open === r.id ? 'on' : ''} onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                    <td className="mute" style={{ whiteSpace: 'nowrap' }}>{r.published_at?.slice(0, 10)}</td>
                    <td><Link href={`/admin/contents/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.title}</Link>{r.code && <div className="mute">#{r.code}</div>}</td>
                    <td className="n"><b className={(r.db.total || 0) > 0 ? 'db-hit' : ''}>{r.db.total ?? '–'}</b></td>
                    <td className="n">{fmt(r.total.views)}</td>
                    <td className="n">{fmt(r.total.likes)}</td>
                    <td className="n">{fmt(r.total.comments)}</td>
                    <td className="n">{fmt(r.total.shares)}</td>
                    <td className="n">{r.total.subs ? `+${fmt(r.total.subs)}` : '–'}</td>
                    <td className="n">{r.db_per_1k ?? '–'}</td>
                    <td className="n">{r.score != null ? `★${r.score}` : '–'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="perf-links">
                        {r.links.youtube && <a href={r.links.youtube} target="_blank" rel="noreferrer">유튜브</a>}
                        {r.links.instagram && <a href={r.links.instagram} target="_blank" rel="noreferrer">인스타</a>}
                        {r.links.post && <a href={r.links.post} target="_blank" rel="noreferrer">정보글</a>}
                      </div>
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr><td colSpan={11} style={{ background: '#fafbfe' }}>
                      <div className="grid2">
                        <div>
                          <b>DB 유입 채널</b>
                          <p style={{ margin: '6px 0' }}>{Object.entries(r.db.by_channel || {}).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]) => `${CH_KO[k] || k} ${v}`).join(' · ') || '아직 없음'}</p>
                          <p className="mute">{r.db.synced_at ? `${new Date(r.db.synced_at).toLocaleString('ko-KR')} 기준` : ''}</p>
                          <b>추적 링크</b>
                          <p className="mute" style={{ wordBreak: 'break-all', margin: '4px 0' }}>유튜브 {r.links.tracked_yt || '–'}<br />인스타 {r.links.tracked_ig || '–'}</p>
                        </div>
                        <div>
                          <table>
                            <thead><tr><th></th><th className="n">DB</th><th className="n">조회</th><th className="n">좋아요</th><th className="n">댓글</th><th className="n">공유</th><th className="n">구독</th><th className="n">점수</th></tr></thead>
                            <tbody>
                              {(['youtube', 'instagram'] as const).map((k) => r[k] && (
                                <tr key={k}>
                                  <td>{k === 'youtube' ? '유튜브' : '인스타'}{r[k].maturity && r[k].maturity !== 'final' ? <span className="mute"> (잠정)</span> : null}</td>
                                  <td className="n">{r[k].leads != null ? Math.round(r[k].leads * 10) / 10 : '–'}</td>
                                  <td className="n">{fmt(r[k].views)}</td><td className="n">{fmt(r[k].likes)}</td><td className="n">{fmt(r[k].comments)}</td>
                                  <td className="n">{fmt(r[k].shares)}</td><td className="n">{r[k].subs != null ? `+${fmt(r[k].subs)}` : '–'}</td>
                                  <td className="n">{r[k].score != null ? `★${r[k].score}` : '–'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {!r.youtube && !r.instagram && <p className="mute">채널 지표가 아직 없습니다 (매일 06:10 수집 · [채널 성과 › 지금 수집])</p>}
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
