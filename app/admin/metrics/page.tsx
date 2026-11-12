'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function Metrics() {
  const [days, setDays] = useState(30);
  const [m, setM] = useState<any>(null);
  useEffect(() => { setM(null); api(`/api/metrics?days=${days}`).then(setM).catch((e) => alert(e.message)); }, [days]);
  if (!m) return <p>불러오는 중…</p>;
  const t = m.totals;
  const maxSec = Math.max(1, ...m.perStep.map((s: any) => s.avg_work_s + s.avg_wait_min * 60));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>작업 효율</h1>
        <div className="seg">{[7, 30, 90].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d}일</button>)}</div>
      </div>
      <div className="kpis">
        <div className="kpi"><b>{t.published}/{t.created}</b>게시 / 생성</div>
        <div className="kpi"><b>{t.avg_lead_time_h || '-'}h</b>평균 리드타임 (생성→게시)</div>
        <div className="kpi"><b>{t.ai_decided_rate ?? '-'}%</b>AI·자동 결정 비율</div>
        <div className="kpi"><b>{t.in_review}</b>검수 대기 단계</div>
        <div className="kpi"><b>${t.cost_usd}</b>AI 비용(추정)</div>
        <div className="kpi"><b>{t.views}</b>랜딩 조회</div>
        <div className="kpi"><b>{t.leads}</b>신청</div>
        <div className="kpi"><b>{t.cvr ?? '-'}%</b>조회→신청</div>
      </div>
      {(m.bottleneck || m.most_rework) && (
        <div className="card">
          {m.bottleneck && <p style={{ margin: 0 }}>⏱ 가장 오래 걸리는 단계: <b>{m.bottleneck.label}</b> — 대기 시간이 길면 결정 방식을 AI로, 작업 시간이 길면 SOP를 줄여 보세요. <Link href={`/admin/sop?step=${m.bottleneck.step}`}>SOP 열기</Link></p>}
          {m.most_rework && <p style={{ margin: '6px 0 0' }}>🔁 재작업이 가장 많은 단계: <b>{m.most_rework.label}</b> (평균 {m.most_rework.avg_attempts}회) — 반복되는 반려 사유를 SOP `집중 포인트`에 추가하세요. <Link href={`/admin/sop?step=${m.most_rework.step}`}>SOP 열기</Link></p>}
        </div>
      )}
      {m.byProvider && Object.keys(m.byProvider).length > 0 && (
        <div className="card"><b>누가 만들었나</b> <span className="mute">(마지막 실행 기준)</span>{' '}
          {Object.entries(m.byProvider).map(([k, v]: any) => <span key={k} className="tag" style={{ marginLeft: 6 }}>{k} {v}</span>)}
        </div>
      )}
      <div className="card">
        <h2>단계별 <span className="mute">■ 파랑 = AI·워커 작업 시간 ■ 노랑 = 사람 결정 대기 시간</span></h2>
        <table>
          <thead><tr><th>단계</th><th style={{ width: '30%' }}>평균 소요</th><th>작업</th><th>대기</th><th>평균 시도</th><th>1회 통과율</th><th>결정 (사람/AI/자동)</th><th>대기·실패</th><th>토큰 in/out</th><th>비용</th></tr></thead>
          <tbody>
            {m.perStep.map((s: any) => (
              <tr key={s.step}>
                <td><b>{s.no}</b> {s.label}</td>
                <td><div style={{ display: 'flex', gap: 2 }}>
                  <div className="bar" style={{ width: `${(s.avg_work_s / maxSec) * 100}%` }} />
                  <div className="bar wait" style={{ width: `${((s.avg_wait_min * 60) / maxSec) * 100}%` }} />
                </div></td>
                <td>{s.avg_work_s}초</td><td>{s.avg_wait_min}분</td><td>{s.avg_attempts || '-'}</td>
                <td>{s.first_pass_rate == null ? '-' : s.first_pass_rate + '%'}</td>
                <td>{s.by.human} / {s.by.ai} / {s.by.auto}</td>
                <td>{s.waiting} · {s.failed}</td>
                <td className="mute">{Math.round(s.tokens_in / 1000)}k / {Math.round(s.tokens_out / 1000)}k</td>
                <td>${s.cost_usd}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mute">비용은 토큰 × 단가(환경변수 PRICE_IN_PER_MTOK / PRICE_OUT_PER_MTOK, 기본 3 / 15 USD) 추정치이며 웹검색·TTS 비용은 포함하지 않습니다.</p>
      </div>
      <div className="card">
        <h2>콘텐츠별</h2>
        <table>
          <thead><tr><th>주제</th><th>현재</th><th>작업</th><th>대기</th><th>재작업</th><th>리드타임</th><th>조회</th><th>신청</th><th>전환</th></tr></thead>
          <tbody>
            {m.perContent.map((c: any) => (
              <tr key={c.id}><td><Link href={`/admin/contents/${c.id}`}>{c.topic || c.slug}</Link></td><td>{c.published ? '게시' : c.current_step}</td>
                <td>{c.work_min}분</td><td>{c.wait_min}분</td><td>{c.reworks}</td><td>{c.lead_time_h != null ? c.lead_time_h + 'h' : '-'}</td><td>{c.views}</td><td>{c.leads}</td><td>{c.cvr != null ? c.cvr + '%' : '-'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
