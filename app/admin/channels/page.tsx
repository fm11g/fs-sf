'use client';
import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DIMENSIONS, DIM_KEYS } from '@/lib/editorial-taxonomy';
import { COMPONENT_KO } from '@/lib/perf';

const fmt = (n: any) => (n == null ? '-' : Number(n) >= 10000 ? `${Math.round(Number(n) / 1000) / 10}만` : Number(n).toLocaleString('ko-KR'));
const MAT: Record<string, string> = { early: '잠정(48h 미만)', settling: '집계 중', final: '확정' };

export default function Channels() {
  const [d, setD] = useState<any>(null);
  const [links, setLinks] = useState({ youtube_channel: '', instagram_account: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [plat, setPlat] = useState<'all' | 'youtube' | 'instagram'>('all');
  const load = () => api('/api/channels').then((r) => { setD(r); setLinks(r.links); }).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);
  const act = async (name: string, body: any, ok?: (r: any) => string) => {
    setBusy(name);
    try { const r = await api('/api/channels', body); if (ok) alert(ok(r)); await load(); } catch (e: any) { alert(e.message); }
    setBusy(null);
  };
  if (!d) return <p>불러오는 중…</p>;
  const posts = d.posts.filter((p: any) => plat === 'all' || p.platform === plat);

  return (
    <>
      <h1>채널 성과</h1>
      <div className="card">
        <h2>내 채널 <span className="mute">— 매일 조사 시작 전(06:10) 올라간 영상의 조회·좋아요·공유·저장·댓글을 수집해 최종 점수를 매깁니다</span></h2>
        <div className="slot"><b>유튜브 채널 링크</b><input placeholder="https://www.youtube.com/@채널핸들" value={links.youtube_channel} onChange={(e) => setLinks({ ...links, youtube_channel: e.target.value })} /><span /></div>
        <div className="slot"><b>인스타 계정 링크</b><input placeholder="https://www.instagram.com/계정" value={links.instagram_account} onChange={(e) => setLinks({ ...links, instagram_account: e.target.value })} /><span /></div>
        <div className="row">
          <button className="pri" disabled={!!busy} onClick={() => act('save', { action: 'save_links', ...links }, () => '저장했습니다')}>링크 저장</button>
          <button disabled={!!busy} onClick={() => act('sync', { action: 'sync' }, (r) => r.message)}>{busy === 'sync' ? '요청 중…' : '지금 수집 (워커)'}</button>
          <button disabled={!!busy} onClick={() => act('analyze', { action: 'analyze' }, (r) => `영상 ${r.posts} · 분석 ${r.analyzed} · 점수 ${r.scored} · 학습 반영 ${r.learned}${r.warnings?.length ? `\n\n확인할 것:\n${r.warnings.join('\n')}` : ''}`)}>{busy === 'analyze' ? '분석 중…' : '분석·점수 다시 계산'}</button>
          <span className="mute">마지막 수집: {d.last_collected ? new Date(d.last_collected).toLocaleString('ko-KR') : '없음'} · 영상 {d.posts.length}개 · 점수 확정·집계 {d.scored}개 · 채널 평균 ★{d.overall}</span>
        </div>
        <p className="mute">유튜브 공유수·시청 지속률은 [설정 → 유튜브 채널 연결]을 다시 해서 Analytics 권한을 받아야 들어옵니다. 인스타는 IG 토큰에 insights 권한이 필요합니다.</p>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>점수가 높았던 영상</h2>
          {d.top.map((p: any, i: number) => <p key={i} style={{ margin: '6px 0' }}><b>★{p.score}</b> <a href={p.url} target="_blank">{p.title}</a> <span className="mute">{[p.attrs?.angle, p.attrs?.hook_type, p.attrs?.format].filter(Boolean).join(' · ')}{p.why?.length ? ` — ${p.why.join('·')} 상위` : ''}</span></p>)}
          {!d.top.length && <p className="mute">48시간 이상 지난 영상이 쌓이면 표시됩니다</p>}
          <h2 style={{ marginTop: 14 }}>점수가 낮았던 영상</h2>
          {d.bottom.map((p: any, i: number) => <p key={i} style={{ margin: '6px 0' }}><b>★{p.score}</b> <a href={p.url} target="_blank">{p.title}</a> <span className="mute">{[p.attrs?.angle, p.attrs?.hook_type, p.attrs?.format].filter(Boolean).join(' · ')}</span></p>)}
        </div>
        <div className="card">
          <h2>시청자 요청·질문 <span className="mute">(댓글 분석)</span></h2>
          {d.requests.map((r: any, i: number) => <p key={i} style={{ margin: '5px 0' }}>• {r.text} <span className="mute">{r.n}회</span></p>)}
          {!d.requests.length && <p className="mute">아직 없음</p>}
          <p className="mute">요청은 다음 편성과 조사 단계에 반영됩니다. <Link href="/admin/editorial">편성표 보기</Link></p>
        </div>
      </div>

      <div className="card">
        <h2>형태별 성과 <span className="mute">평균 최종 점수 · 영상 수 · 마지막 사용</span></h2>
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {DIM_KEYS.map((k) => (
            <table key={k}><thead><tr><th>{DIMENSIONS[k].label}</th><th>평균</th><th>n</th><th>마지막</th></tr></thead><tbody>
              {[...(d.dims[k] || [])].sort((a: any, b: any) => (b.avg ?? 0) - (a.avg ?? 0)).filter((x: any) => x.n || x.last_used).map((x: any) => (
                <tr key={x.value}><td>{x.value}</td><td><b>{x.avg != null ? `★${x.avg}` : '-'}</b></td><td>{x.n}</td><td className="mute">{x.days_since == null ? '-' : x.days_since === 0 ? '오늘' : `${x.days_since}일 전`}</td></tr>
              ))}
            </tbody></table>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>영상별 최종 점수</h2>
          <div className="seg">{(['all', 'youtube', 'instagram'] as const).map((p) => <button key={p} className={plat === p ? 'on' : ''} onClick={() => setPlat(p)}>{{ all: '전체', youtube: '유튜브', instagram: '인스타' }[p]}</button>)}</div>
        </div>
        <table style={{ marginTop: 8 }}>
          <thead><tr><th></th><th>영상</th><th>게시</th><th>조회</th><th>좋아요</th><th>댓글</th><th>공유</th><th>저장</th><th>시청</th><th>최종 점수</th><th>형태</th></tr></thead>
          <tbody>
            {posts.map((p: any) => (
              <Fragment key={p.id}>
                <tr onClick={() => setOpen(open === p.id ? null : p.id)} style={{ cursor: 'pointer' }}>
                  <td>{p.thumbnail_url ? <img src={p.thumbnail_url} alt="" width={44} style={{ borderRadius: 6 }} /> : (p.platform === 'youtube' ? '▶' : '◎')}</td>
                  <td><a href={p.url} target="_blank" onClick={(e) => e.stopPropagation()}>{p.title || '(제목 없음)'}</a>{p.content_id && <> <Link className="tag" href={`/admin/contents/${p.content_id}`} onClick={(e) => e.stopPropagation()}>공장</Link></>}</td>
                  <td className="mute">{new Date(p.published_at).toLocaleDateString('ko-KR')}</td>
                  <td>{fmt(p.metrics?.views)}</td><td>{fmt(p.metrics?.likes)}</td><td>{fmt(p.metrics?.comments)}</td><td>{fmt(p.metrics?.shares)}</td><td>{fmt(p.metrics?.saves)}</td>
                  <td>{p.metrics?.avg_view_pct != null ? `${Math.round(p.metrics.avg_view_pct)}%` : p.metrics?.avg_watch_sec != null ? `${p.metrics.avg_watch_sec}초` : '-'}</td>
                  <td><b>{p.perf_score != null ? `★${p.perf_score}` : '-'}</b> <span className="mute">{MAT[p.perf?.maturity] || ''}</span></td>
                  <td className="mute">{[p.attrs?.topic_category, p.attrs?.angle, p.attrs?.hook_type, p.attrs?.format].filter(Boolean).join(' · ')}</td>
                </tr>
                {open === p.id && (
                  <tr><td colSpan={11} style={{ background: '#fafbfe' }}>
                    <div className="grid2">
                      <div>
                        <b>점수 구성</b> <span className="mute">(내 채널 영상 대비 백분위)</span>
                        {Object.entries(p.perf?.components || {}).map(([k, c]: any) => (
                          <div key={k} className="row" style={{ gap: 6, fontSize: 13 }}><span style={{ width: 70 }}>{COMPONENT_KO[k]}</span>{c.pct == null ? <span className="mute">데이터 없음</span> : <><span className="scorebar" style={{ width: `${c.pct * 160}px` }} /><span className="mute">{Math.round(c.pct * 100)}%</span></>}</div>
                        ))}
                        <p className="mute" style={{ marginBottom: 0 }}>형태 분류 출처: {p.attrs_source === 'content' ? '공장 산출물' : p.attrs_source === 'manual' ? '직접 수정' : 'AI 분류'}</p>
                      </div>
                      <div>
                        <b>댓글 분석</b> {p.comment_analysis?.quality != null && <span className="mute">품질 {p.comment_analysis.quality}/5 · 신청·문의 의향 {p.comment_analysis.intent ?? 0}건</span>}
                        <p style={{ margin: '4px 0' }}>{p.comment_analysis?.summary || '-'}</p>
                        {p.comment_analysis?.themes?.length > 0 && <p className="mute" style={{ margin: '2px 0' }}>주제: {p.comment_analysis.themes.join(', ')}</p>}
                        {p.comment_analysis?.questions?.length > 0 && <p className="mute" style={{ margin: '2px 0' }}>질문: {p.comment_analysis.questions.join(' / ')}</p>}
                        {p.comment_analysis?.requests?.length > 0 && <p className="mute" style={{ margin: '2px 0' }}>요청: {p.comment_analysis.requests.join(' / ')}</p>}
                        <details><summary className="mute">댓글 원문 {p.comments?.length || 0}개</summary>{(p.comments || []).map((c: any, i: number) => <p key={i} className="mute" style={{ margin: '3px 0' }}>({c.likes}) {c.text}</p>)}</details>
                      </div>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!posts.length && <p className="mute">수집된 영상이 없습니다. 채널 링크를 저장하고 "지금 수집"을 누르세요.</p>}
      </div>
    </>
  );
}
