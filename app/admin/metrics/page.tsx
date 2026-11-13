'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { AI_STEPS } from '@/lib/steps';

export default function Metrics() {
  const [days, setDays] = useState(30);
  const [m, setM] = useState<any>(null);
  const [lc, setLc] = useState<Record<string, any>>({});
  useEffect(() => { setM(null); api(`/api/metrics?days=${days}`).then(setM).catch((e) => alert(e.message)); }, [days]);
  useEffect(() => { api('/api/learn').then((r) => setLc(r.counts)).catch(() => {}); }, []);
  if (!m) return <p>불러오는 중…</p>;
  /** 성과 좋은 콘텐츠의 모든 AI 단계 산출물을 좋은 예로 → SOP 학습 재료 */
  const markAll = async (c: any) => {
    if (!confirm(`'${c.topic || c.slug}' 의 조사~정보글 산출물을 모두 ★5(성과우수)로 평가할까요?`)) return;
    let n = 0; const propose: string[] = [];
    for (const step of AI_STEPS) {
      try {
        const r = await api('/api/exemplars', { contentId: c.id, step, score: 5, tags: ['성과우수'], source: 'metrics', note: `성과 기준 선택: 조회 ${c.views} · 신청 ${c.leads}${c.cvr != null ? ` · 전환 ${c.cvr}%` : ''}` });
        n++; if (r.should_propose) propose.push(step);
      } catch { /* 산출물 없는 단계 */ }
    }
    for (const step of propose) api('/api/learn', { action: 'propose', step }).catch(() => {});
    alert(`${n}개 단계를 ★5로 평가했습니다${propose.length ? ` · ${propose.length}개 단계 SOP 학습 제안 생성 중` : ''}`);
  };
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
        <h2>결과물 점수 <span className="mute">내가 매긴 1~5점 (전체 기간) — 점수 추이는 SOP·AI 제어의 단계별 "SOP 버전별 평균"</span></h2>
        <table>
          <thead><tr><th>단계</th><th>평가</th><th>평균</th><th>★5</th><th>★4</th><th>★3</th><th>★1~2</th><th>수정 예</th><th>미반영 재료</th><th></th></tr></thead>
          <tbody>
            {AI_STEPS.map((k) => { const c = lc[k]?.counts; const d = m.perStep.find((x: any) => x.step === k); return (
              <tr key={k}><td><b>{d?.no}</b> {d?.label}</td><td>{c?.rated ?? 0}</td><td><b>{c?.avg != null ? `★${c.avg}` : '-'}</b></td><td>{c?.gold ?? 0}</td><td>{c?.silver ?? 0}</td><td>{c?.neutral ?? 0}</td><td>{c?.negative ?? 0}</td><td>{c?.edit ?? 0}</td><td>{c?.unused_signal ?? 0}</td>
                <td><Link href={`/admin/sop?step=${k}`}>학습 보기</Link></td></tr>
            ); })}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>콘텐츠별</h2>
        <table>
          <thead><tr><th>주제</th><th>현재</th><th>작업</th><th>대기</th><th>재작업</th><th>리드타임</th><th>조회</th><th>신청</th><th>전환</th><th></th></tr></thead>
          <tbody>
            {m.perContent.map((c: any) => (
              <tr key={c.id}><td><Link href={`/admin/contents/${c.id}`}>{c.topic || c.slug}</Link></td><td>{c.published ? '게시' : c.current_step}</td>
                <td>{c.work_min}분</td><td>{c.wait_min}분</td><td>{c.reworks}</td><td>{c.lead_time_h != null ? c.lead_time_h + 'h' : '-'}</td><td>{c.views}</td><td>{c.leads}</td><td>{c.cvr != null ? c.cvr + '%' : '-'}</td><td><button title="성과가 좋은 콘텐츠의 산출물을 ★5 학습 재료로" onClick={() => markAll(c)}>★ 학습</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
