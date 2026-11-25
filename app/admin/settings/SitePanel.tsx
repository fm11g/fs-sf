'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_WEIGHTS, COMPONENT_KO } from '@/lib/perf';

/** 설정 > 오늘의 정책자금 홈페이지 연동 · 성과 점수 가중치 (DB 최우선) */
export default function SitePanel({ v, setV, onSave }: { v: any; setV: (x: any) => void; onSave: () => void }) {
  const [st, setSt] = useState<any>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { fetch('/api/site').then((r) => r.json()).then(setSt).catch(() => {}); }, []);
  const w: Record<string, number> = v.perf_weights && v.perf_weights.leads != null ? { ...DEFAULT_WEIGHTS, ...v.perf_weights } : { ...DEFAULT_WEIGHTS };
  const sum = Object.values(w).reduce((a, b) => a + Number(b || 0), 0) || 1;
  const top = Object.entries(w).sort((a, b) => b[1] - a[1])[0]?.[0];
  const test = async (action: 'test' | 'leads') => {
    setMsg('확인 중…');
    const r = await fetch('/api/site', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok && j.ok ? `연결됨 · 숏폼 코드 ${j.codes}개 신청 집계 · 홈페이지 전체 신청 ${j.total ?? '-'}건 (숏폼 외 ${j.untracked ?? '-'}건)${action === 'leads' ? ` · ${j.updated}개 콘텐츠 갱신` : ''}` : `실패: ${j.error || j.warning || r.status}`);
  };
  const site = String(v.tpf_site_url || '').replace(/\/+$/, '');
  return (
    <div className="card">
      <h2>🏠 오늘의 정책자금 홈페이지 연동 <span className="mute">추적 링크 · 정보글 자동 발행 · 숏폼별 DB 수 → 성과 점수</span></h2>
      <div className="slot"><b>홈페이지 주소</b><input value={v.tpf_site_url || ''} placeholder="https://todayfund.co.kr" onChange={(e) => setV({ ...v, tpf_site_url: e.target.value.trim() })} /><span className="mute">입력하면 카피 링크가 <code>go.html?c=코드</code> 추적 링크로 바뀝니다</span></div>
      <div className="slot"><b>홈페이지 관리자 주소</b><input value={v.tpf_admin_url || ''} placeholder="https://today-fund-admin.vercel.app" onChange={(e) => setV({ ...v, tpf_admin_url: e.target.value.trim() })} /><span className="mute">연동 키는 [연결·키 &gt; 오늘의 정책자금 사이트]의 TPF_ADMIN_KEY</span></div>
      <div className="slot"><b>업로드되면 정보글 발행</b><input type="checkbox" checked={v.tpf_post_on_publish !== false} onChange={(e) => setV({ ...v, tpf_post_on_publish: e.target.checked })} style={{ justifySelf: 'start' }} /><span className="mute">정보글 단계 산출물 → 홈페이지 「정책자금 정보」 (목차 · FAQ · 영상 · 검색 메타)</span></div>
      <div className="slot"><b>공장 랜딩 신청 전달</b><input type="checkbox" checked={v.tpf_forward_leads !== false} onChange={(e) => setV({ ...v, tpf_forward_leads: e.target.checked })} style={{ justifySelf: 'start' }} /><span className="mute">공장 /l/ 랜딩 신청도 홈페이지 관리자 상담 목록으로</span></div>
      <p className="mute">
        상태: 링크 {st?.links ? '✅' : '—'} · API {st?.api ? '✅' : '—'} {st?.key ? `(키 ${st.key})` : ''}
        {site && <> · 인스타 프로필 링크(항상 최신 숏폼): <code>{site}/go.html?c=today&amp;ch=igp</code></>}
      </p>
      <div className="row" style={{ gap: 8, margin: '6px 0 14px' }}>
        <button onClick={() => test('test')}>연결 확인</button>
        <button onClick={() => test('leads')}>DB 수 지금 받아오기</button>
        <span className="mute">{msg}</span>
      </div>

      <h2 style={{ marginTop: 10 }}>📊 성과 점수 가중치 <span className="mute">같은 플랫폼 영상끼리 백분위 → 가중 평균 → ★1~5 · 합계 {Math.round(sum * 100) / 100}</span></h2>
      {Object.keys(DEFAULT_WEIGHTS).map((k) => (
        <div className="slot" key={k}>
          <b>{COMPONENT_KO[k]}{k === 'leads' ? ' (홈페이지 신청 수)' : ''}</b>
          <input type="number" step="0.01" min={0} max={1} value={w[k]} onChange={(e) => setV({ ...v, perf_weights: { ...w, [k]: Number(e.target.value) } })} />
          <span className="mute">{Math.round((w[k] / sum) * 100)}%{k === 'leads' && top !== 'leads' ? ' ⚠ DB 가 가장 큰 비중이 아닙니다' : ''}</span>
        </div>
      ))}
      <p className="mute">기본: DB 40% · 조회 12% · 참여 10% · 공유 10% · 댓글 10% · 구독 10% · 시청유지 5% · 랜딩전환 3%. DB 는 비교 영상 중 신청이 1건 이상 있을 때만 반영됩니다.</p>
      <div className="row" style={{ gap: 8 }}>
        <button className="pri" onClick={onSave}>저장</button>
        <button onClick={() => setV({ ...v, perf_weights: { ...DEFAULT_WEIGHTS } })}>기본값으로</button>
      </div>
    </div>
  );
}
