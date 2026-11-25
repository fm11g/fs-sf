'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

const CH_KO: Record<string, string> = { youtube: '유튜브', instagram: '인스타', seo: '검색', blog: '정보글', naver: '네이버', factory: '공장 랜딩', direct: '직접', referral: '외부', ads: '광고', kakao: '카카오', facebook: '페이스북' };

/** 콘텐츠 상세 > 업로드: 홈페이지 고유 코드 · 추적 링크 · 정보글 · 이 숏폼의 신청(DB) 수 */
export default function SiteBox({ c, onDone }: { c: any; onDone: () => void }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const code = c.track_code || c.copy?.track_code;
  const ls = c.lead_stats as { total: number; by_channel: Record<string, number>; last_at?: string } | null;
  const run = async (force: boolean) => {
    setBusy(force ? 'force' : 'sync'); setMsg('');
    try {
      const r = await api('/api/site', { action: 'sync', contentId: c.id, force }, 'POST');
      setMsg(r.warnings?.length ? `경고: ${r.warnings.join(' / ')}` : `완료${r.post?.url ? ` · ${r.post.url}` : ''}`);
      onDone();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(''); }
  };
  if (!code) return null;
  return (
    <div className="card">
      <h2>🏠 홈페이지 연동 <span className="mute">고유 코드 #{code}</span></h2>
      <p style={{ margin: '4px 0' }}>
        <b style={{ fontSize: 22 }}>DB {ls ? ls.total : '–'}건</b>{' '}
        <span className="mute">
          {ls ? Object.entries(ls.by_channel || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${CH_KO[k] || k} ${n}`).join(' · ') || '아직 신청 없음' : '아직 받아오지 않음 (매일 자동 · 설정에서 지금 받아오기)'}
          {c.leads_synced_at ? ` · ${new Date(c.leads_synced_at).toLocaleString('ko-KR')} 기준` : ''}
        </span>
      </p>
      {c.copy?.youtube?.link && <p className="mute" style={{ margin: '2px 0', wordBreak: 'break-all' }}>유튜브 링크: {c.copy.youtube.link}</p>}
      {c.copy?.instagram?.link && <p className="mute" style={{ margin: '2px 0', wordBreak: 'break-all' }}>인스타 링크: {c.copy.instagram.link}</p>}
      <p style={{ margin: '6px 0' }}>
        정보글: {c.site_post?.url ? <a href={c.site_post.url} target="_blank" rel="noreferrer">{c.site_post.url}</a> : <span className="mute">아직 발행 안 됨 (업로드되면 자동)</span>}
        {c.instagram_url && <> · <a href={c.instagram_url} target="_blank" rel="noreferrer">인스타 게시물</a></>}
      </p>
      {c.published_at && (
        <div className="row" style={{ gap: 8 }}>
          <button disabled={!!busy} onClick={() => run(false)}>{busy === 'sync' ? '보내는 중…' : '홈페이지에 등록'}</button>
          <button disabled={!!busy} onClick={() => confirm('홈페이지 정보글을 공장 산출물로 다시 덮어쓸까요? (관리자에서 고친 내용은 사라집니다)') && run(true)}>{busy === 'force' ? '다시 쓰는 중…' : '정보글 다시 쓰기'}</button>
          <span className="mute">{msg}</span>
        </div>
      )}
    </div>
  );
}
