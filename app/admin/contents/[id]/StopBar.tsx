'use client';
import { useEffect, useState } from 'react';

const mmss = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;

/**
 * AI 작업 진행 표시줄 — 경과 시간 · 자동 정지까지 남은 시간(시간 막대) · [■ 중지].
 * 제한 시간이 지나면 서버가 스스로 멈추고, 화면도 '자동 정지 대기'로 바뀜.
 */
export default function StopBar({ label, startedAt, limitSec, canStop, onStop, extra }: {
  label: string; startedAt: string | number; limitSec: number; canStop: boolean; onStop: () => Promise<void> | void; extra?: React.ReactNode;
}) {
  const [, tick] = useState(0);
  const [stopping, setStopping] = useState(false);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const t0 = typeof startedAt === 'number' ? startedAt : Date.parse(startedAt);
  const el = (Date.now() - t0) / 1000;
  const left = limitSec - el;
  const ratio = Math.min(1, el / limitSec);
  const late = left <= 0;
  const hot = ratio > 0.75;

  return (
    <div className={`stopbar ${hot ? 'hot' : ''} ${late ? 'late' : ''}`}>
      <span className="spin" />
      <div className="sb-main">
        <div className="sb-row">
          <b>{label} 작업 중</b>
          <span>경과 <b>{mmss(el)}</b></span>
          <span className="mute">{late ? '제한 시간 지남 — 곧 자동 정지됩니다' : <>자동 정지까지 {mmss(left)} <small>(제한 {mmss(limitSec)})</small></>}</span>
          {extra}
        </div>
        <div className="sb-track"><i style={{ width: `${ratio * 100}%` }} /></div>
      </div>
      {canStop && (
        <button className="danger" disabled={stopping} onClick={async () => {
          if (!confirm(`${label} 작업을 중지할까요?\n진행 중인 결과는 저장되지 않습니다.`)) return;
          setStopping(true);
          try { await onStop(); } finally { setStopping(false); }
        }}>{stopping ? '중지하는 중…' : '■ 중지'}</button>
      )}
      <style>{`
        .stopbar{display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid #c9d7f5;background:#f4f7ff;border-radius:10px;margin:10px 0}
        .stopbar.hot{border-color:#f0c36d;background:#fff9ec}
        .stopbar.late{border-color:#f2a3a3;background:#fff3f3}
        .stopbar .spin{width:16px;height:16px;border:2px solid #c7d6f7;border-top-color:#2b6cdf;border-radius:50%;animation:sbspin .8s linear infinite;flex:none}
        @keyframes sbspin{to{transform:rotate(360deg)}}
        .stopbar .sb-main{flex:1;min-width:0}
        .stopbar .sb-row{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;font-size:14px}
        .stopbar .sb-track{height:4px;background:#e2e8f0;border-radius:2px;margin-top:6px;overflow:hidden}
        .stopbar .sb-track i{display:block;height:100%;background:#2b6cdf;transition:width 1s linear}
        .stopbar.hot .sb-track i{background:#e0a106}.stopbar.late .sb-track i{background:#d6282e}
        .stopbar button.danger{background:#d6282e;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;flex:none}
        .stopbar button.danger:disabled{opacity:.6}
      `}</style>
    </div>
  );
}
