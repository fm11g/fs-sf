'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { overallPct, RENDER_STAGES, type RenderProgress as RP } from '@/worker/video/stages';

const fmt = (sec: number) => {
  if (!isFinite(sec) || sec < 0) return '-';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m ? `${m}분 ${String(s).padStart(2, '0')}초` : `${s}초`;
};
const hhmmss = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour12: false });
const ICON: Record<string, string> = { wait: '○', running: '◐', done: '✓', failed: '✕', skip: '–' };

/**
 * 렌더 진행 패널 — 진행 바(단계별 구간) · 전체 % · 지금 하는 일 · 단계 목록 · 장면별 목소리/프레임 · 썸네일 · 실시간 로그.
 * 렌더 중이면 2초마다 /api/render?id= 를 읽고, 끝나면 onFinish 로 작업대를 새로고침.
 */
export default function RenderProgress({ contentId, active, onFinish, canStop = false }: { contentId: string; active: boolean; onFinish: () => void; canStop?: boolean }) {
  const [p, setP] = useState<RP | null>(null);
  const [skew, setSkew] = useState(0); // 서버 시각 - 내 시각
  const [, setTick] = useState(0);
  const [showLog, setShowLog] = useState(true);
  const [limits, setLimits] = useState<{ render_timeout_min: number; render_stall_sec: number; render_queue_min: number } | null>(null);
  const [stopping, setStopping] = useState(false);
  const [gh, setGh] = useState<any>(null);
  const prevStatus = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const live = !!p && (p.status === 'queued' || p.status === 'running');

  const load = async () => {
    try {
      const d = await api(`/api/render?id=${contentId}`);
      setSkew(Date.parse(d.now) - Date.now());
      setP(d.progress);
      if (d.limits) setLimits(d.limits);
      setGh(d.github || null);
      const st = d.progress?.status;
      if (prevStatus.current && (prevStatus.current === 'running' || prevStatus.current === 'queued') && (st === 'done' || st === 'failed' || st === 'canceled')) onFinish();
      prevStatus.current = st;
    } catch { /* 일시 오류는 다음 주기에 */ }
  };
  useEffect(() => { load(); }, [contentId]);
  // 렌더 요청 직후(active)에도 바로 따라가도록
  useEffect(() => { if (active) load(); }, [active]);
  useEffect(() => {
    if (!live && !active) return;
    const t = setInterval(load, 2000);
    const c = setInterval(() => setTick((x) => x + 1), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [live, active]);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [p?.log?.length]);

  const stop = async () => {
    if (!confirm('렌더를 중지할까요?\nGitHub 실행을 취소하고, 워커도 스스로 멈춥니다. 만들던 영상은 저장되지 않습니다.')) return;
    setStopping(true);
    try { await api('/api/stop', { contentId, step: 'render' }); } catch (e: any) { alert(e.message); }
    await load(); setStopping(false); onFinish();
  };

  if (!p) return null;
  const now = Date.now() + skew;
  const pct = p.status === 'done' ? 100 : overallPct(p.stages || {});
  const since = (iso?: string) => (iso ? (now - Date.parse(iso)) / 1000 : 0);
  const elapsed = p.finished_at ? (Date.parse(p.finished_at) - Date.parse(p.requested_at)) / 1000 : since(p.requested_at);
  const quiet = since(p.updated_at);
  const cur = RENDER_STAGES.find((s) => s.key === p.stage) || RENDER_STAGES[0];
  const curSt = p.stages?.[p.stage] || {};
  const fr = p.frames;
  const eta = p.eta_sec != null && p.status === 'running' ? Math.max(0, p.eta_sec - quiet) : null;

  let warn = '';
  if (p.status === 'queued' && since(p.requested_at) > 240) warn = 'GitHub Actions 가 4분 넘게 시작하지 않았습니다 — Actions 대기열, 저장소 Actions 사용 설정, [연결·키]의 GitHub 토큰을 확인하세요.';
  else if (p.status === 'running' && quiet > 150) warn = `${fmt(quiet)} 동안 소식이 없습니다 — 설치가 오래 걸리거나 워커가 멈췄을 수 있습니다. GitHub 실행 화면을 확인하세요.`;

  return (
    <div className={`card rp ${p.status}`}>
      <div className="rp-head">
        <div>
          <div className="rp-title">
            {p.status === 'done' ? '렌더 완료' : p.status === 'canceled' ? '렌더 중지됨' : p.status === 'failed' ? (/자동 정지/.test(p.error || '') ? '렌더 자동 정지' : '렌더 실패') : p.status === 'queued' ? '렌더 대기 중' : '렌더 중'}
            <span className={`rp-badge ${p.status}`}>{p.status === 'done' ? '완료' : cur.label}</span>
            {live && canStop && <button className="rp-stop" disabled={stopping} onClick={stop}>{stopping ? '중지하는 중…' : '■ 렌더 중지'}</button>}
          </div>
          <div className="mute">
            요청 {hhmmss(p.requested_at)} · 경과 {fmt(elapsed)}
            {eta != null && <> · 남은 시간 약 <b>{fmt(eta)}</b></>}
            {p.size && <> · {p.size}</>}
            {p.run_url && <> · <a href={p.run_url} target="_blank" rel="noreferrer">GitHub 실행 화면 ↗</a></>}
          </div>
          {live && limits && <div className="mute small">자동 정지: 전체 {limits.render_timeout_min}분 초과 · {limits.render_stall_sec}초 동안 진행 없음 · 대기 {limits.render_queue_min}분 초과{quiet > limits.render_stall_sec * 0.5 && p.status === 'running' ? <b className="warnc"> · {fmt(quiet)}째 진행 없음</b> : null}</div>}
        </div>
        <div className="rp-pct">{Math.floor(pct)}<small>%</small></div>
      </div>

      {/* 단계별 구간 진행 바 — 구간 폭 = 단계 비중 */}
      <div className="rp-bar" role="progressbar" aria-valuenow={Math.floor(pct)} aria-valuemin={0} aria-valuemax={100}>
        {RENDER_STAGES.map((s) => {
          const st = p.stages?.[s.key] || { state: 'wait' };
          const fill = st.state === 'done' || st.state === 'skip' || p.status === 'done' ? 100 : st.state === 'running' || st.state === 'failed' ? st.pct || 0 : 0;
          return (
            <div key={s.key} className={`seg ${p.status === 'done' ? 'done' : (p.status === 'failed' || p.status === 'canceled') && st.state === 'running' ? 'failed' : st.state}`} style={{ flexGrow: s.weight }} title={`${s.label} ${Math.round(fill)}%`}>
              <i style={{ width: `${Math.max(fill, st.state === 'running' ? 3 : 0)}%` }} />
            </div>
          );
        })}
      </div>

      {/* 지금 하는 일 */}
      {p.status !== 'done' && (
        <div className="rp-now">
          <b>{p.status === 'failed' || p.status === 'canceled' ? '멈춘 곳' : '지금'}:</b> {cur.label}{curSt.pct != null && p.status !== 'failed' && p.status !== 'canceled' ? ` ${Math.round(curSt.pct)}%` : ''} — {curSt.detail || cur.desc}
        </div>
      )}
      {p.status === 'failed' && p.error && <div className="check error">{/자동 정지/.test(p.error) ? '⏱' : '✕'} {p.error}</div>}
      {p.status === 'canceled' && <div className="check warn">■ {p.error || '중지됨'} — 다시 하려면 [다시 렌더]를 누르세요.</div>}
      {p.status === 'done' && p.result && <div className="check ok">✓ {p.result.total_sec}초 영상 · {p.result.approved ? '자동 승인됨' : '검수 대기 — 아래 영상 확인 후 승인'}</div>}
      {warn && <div className="check warn">! {warn}</div>}
      {gh && (live || gh.log_tail) && (
        <div className={`rp-gh ${gh.state}`}>
          <b>GitHub</b> {gh.message}
          {gh.run_url && <> · <a href={gh.run_url} target="_blank" rel="noreferrer">실행 화면 ↗</a></>}
          {!!gh.blocking?.length && <div className="small">막고 있는 실행: {gh.blocking.map((b: any) => <a key={b.url} href={b.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{b.status} ↗</a>)}</div>}
          {!!gh.log_tail?.length && (
            <>
              <div className="small" style={{ marginTop: 6 }}><b>실패한 단계 로그 (끝부분)</b> — 이 내용을 그대로 복사해 물어보면 원인을 바로 찾을 수 있습니다</div>
              <pre className="rp-ghlog">{gh.log_tail.join('\n')}</pre>
            </>
          )}
          {!!gh.steps?.length && (
            <ol className="rp-ghsteps">
              {gh.steps.filter((x: any) => !/^(Set up job|Complete job|Post )/.test(x.name)).map((x: any, i: number) => (
                <li key={i} className={x.conclusion || x.status}>{x.conclusion === 'success' ? '✓' : x.conclusion === 'failure' ? '✕' : x.conclusion === 'skipped' ? '–' : x.status === 'in_progress' ? <i className="spin" /> : '○'} {x.name}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="rp-grid">
        {/* 단계 목록 */}
        <ol className="rp-steps">
          {RENDER_STAGES.map((s) => {
            const st = p.stages?.[s.key] || { state: 'wait' as const };
            const state = p.status === 'done' ? 'done' : (p.status === 'failed' || p.status === 'canceled') && st.state === 'running' ? 'failed' : st.state;
            const dur = st.started_at ? ((st.finished_at ? Date.parse(st.finished_at) : state === 'running' ? now : Date.parse(st.started_at)) - Date.parse(st.started_at)) / 1000 : 0;
            return (
              <li key={s.key} className={state}>
                <span className="ic">{state === 'running' ? <i className="spin" /> : ICON[state] || '○'}</span>
                <div>
                  <div className="rp-row">
                    <b>{s.label}</b>
                    <span className="mute">{state === 'running' && st.pct != null ? `${Math.round(st.pct)}% · ` : ''}{dur > 0.5 ? fmt(dur) : ''}</span>
                  </div>
                  <div className="mute small">{st.detail || s.desc}</div>
                  {state === 'running' && <div className="mini"><i style={{ width: `${st.pct || 0}%` }} /></div>}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="rp-side">
          {/* 장면별: 목소리 상태 · 프레임 그리기 진행 */}
          {!!p.scenes?.length && (
            <div>
              <div className="rp-row">
                <b>장면별 작업</b>
                {fr && <span className="mute">프레임 {fr.done}/{fr.total}{fr.encoded ? ` · 압축 ${fr.encoded}` : ''}{fr.fps ? ` · ${fr.fps}fps` : ''}</span>}
              </div>
              <div className="rp-scenes">
                {p.scenes.map((sc, i) => {
                  const f = fr && sc.from != null && sc.to != null ? Math.max(0, Math.min(1, (fr.done - sc.from) / Math.max(1, sc.to - sc.from))) : p.status === 'done' ? 1 : 0;
                  const drawing = fr && sc.from != null && sc.to != null && fr.done >= sc.from && fr.done < sc.to && p.stages?.frames?.state === 'running';
                  return (
                    <div key={sc.id} className={`sc ${drawing ? 'on' : ''}`}>
                      <span className="no">{i + 1}</span>
                      <span className={`v ${sc.voice || 'wait'}`} title={`목소리: ${sc.voice || 'wait'}`}>🎙</span>
                      <div className="tx">
                        <div><b>{sc.layout || sc.id}</b> <span className="mute">{sc.sec ? `${sc.sec}초` : ''}</span></div>
                        <div className="mute small ellip">{sc.headline}</div>
                        <div className="mini"><i style={{ width: `${f * 100}%` }} /></div>
                      </div>
                      {sc.voice_url && <audio src={sc.voice_url} controls preload="none" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!!p.stills?.length && (
            <div>
              <b>만들어진 썸네일</b>
              <div className="rp-stills">{p.stills.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" /></a>)}</div>
            </div>
          )}

          {/* 실시간 작업 로그 */}
          <div>
            <div className="rp-row">
              <b>작업 로그</b>
              <a href="#" className="mute" onClick={(e) => { e.preventDefault(); setShowLog(!showLog); }}>{showLog ? '접기' : '펼치기'}</a>
            </div>
            {showLog && (
              <div className="rp-log" ref={logRef}>
                {(p.log || []).map((l, i) => (
                  <div key={i} className={l.level || 'info'}>
                    <span className="t">{hhmmss(l.t)}</span>
                    <span className="s">{RENDER_STAGES.find((s) => s.key === l.stage)?.label || l.stage || ''}</span>
                    <span>{l.msg}</span>
                  </div>
                ))}
                {live && <div className="cursor">▍</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .rp .rp-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:10px}
        .rp .rp-title{font-size:18px;font-weight:800;display:flex;align-items:center;gap:8px}
        .rp .rp-badge{font-size:12px;font-weight:700;padding:2px 8px;border-radius:99px;background:#e8eefc;color:#2b55c9}
        .rp .rp-stop,#tpf-admin .rp .rp-stop{margin-left:6px;background:#d6282e!important;color:#fff!important;border:0!important;border-radius:8px;padding:5px 12px;font-size:13px;font-weight:700;cursor:pointer}
        .rp .rp-stop:disabled{opacity:.6}
        .rp .warnc{color:#b45309}
        .rp.canceled .rp-pct{color:#64748b}
        .rp .rp-badge.canceled{background:#eef0f3;color:#475569}
        .rp .rp-badge.done{background:#e3f6ea;color:#1c7c43}.rp .rp-badge.failed{background:#fde8e8;color:#c62828}
        .rp .rp-pct{font-size:44px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;color:#1e3a8a}
        .rp.done .rp-pct{color:#1c7c43}.rp.failed .rp-pct{color:#c62828}
        .rp .rp-pct small{font-size:18px;margin-left:2px}
        .rp .rp-bar{display:flex;gap:3px;height:14px;margin:4px 0 10px}
        .rp .rp-bar .seg{background:#e9edf3;border-radius:4px;overflow:hidden;min-width:6px;position:relative}
        .rp .rp-bar .seg i{display:block;height:100%;background:#2b6cdf;transition:width .8s ease}
        .rp .rp-bar .seg.done i{background:#2b6cdf}
        .rp .rp-bar .seg.running i{background:repeating-linear-gradient(45deg,#2b6cdf 0 10px,#5b8ff0 10px 20px);background-size:28px 28px;animation:rpstripe 1s linear infinite}
        .rp .rp-bar .seg.failed i{background:#d6282e}
        .rp.done .rp-bar .seg i{background:#22a35a}
        @keyframes rpstripe{to{background-position:28px 0}}
        .rp .rp-now{font-size:14px;margin-bottom:8px}
        .rp .rp-grid{display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:18px;margin-top:10px}
        .rp .rp-steps{list-style:none;margin:0;padding:0;display:grid;gap:2px;align-content:start}
        .rp .rp-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
        .rp .spin{display:inline-block;width:12px;height:12px;border:2px solid #c7d6f7;border-top-color:#2b6cdf;border-radius:50%;animation:rpspin .8s linear infinite;vertical-align:-1px}
        .rp .rp-steps li{display:grid;grid-template-columns:22px 1fr;gap:8px;padding:7px 8px;border-radius:8px}
        .rp .rp-steps li.running{background:#eef3ff}
        .rp .rp-steps li.failed{background:#fdeeee}
        .rp .rp-steps li .ic{font-weight:900;text-align:center;color:#9aa4b2}
        .rp .rp-steps li.done .ic{color:#1c7c43}.rp .rp-steps li.running .ic{color:#2b6cdf}
        .rp .rp-steps li.failed .ic{color:#c62828}.rp .rp-steps li.wait b{color:#9aa4b2}
        @keyframes rpspin{to{transform:rotate(360deg)}}
        .rp .small{font-size:12px}
        .rp .mini{height:4px;background:#e2e8f0;border-radius:2px;margin-top:5px;overflow:hidden}
        .rp .mini i{display:block;height:100%;background:#2b6cdf;transition:width .8s}
        .rp .rp-side{display:grid;gap:14px;align-content:start;min-width:0}
        .rp .rp-scenes{display:grid;gap:4px;margin-top:6px}
        .rp .sc{display:grid;grid-template-columns:20px 20px 1fr auto;gap:8px;align-items:center;padding:5px 8px;border:1px solid #e5e9f0;border-radius:8px}
        .rp .sc.on{border-color:#2b6cdf;background:#f3f7ff}
        .rp .sc .no{font-weight:800;color:#64748b;text-align:center}
        .rp .sc .v{filter:grayscale(1);opacity:.35}.rp .sc .v.running{opacity:1;filter:none;animation:rpblink 1s infinite}.rp .sc .v.done{opacity:1;filter:none}
        @keyframes rpblink{50%{opacity:.3}}
        .rp .sc .tx{min-width:0}.rp .ellip{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rp .sc audio{height:28px;width:150px}
        .rp .rp-stills{display:flex;gap:6px;margin-top:6px}.rp .rp-stills img{height:120px;border-radius:6px;display:block}
        .rp .rp-gh{border:1px solid #c9d7f5;background:#f4f7ff;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:8px}
        .rp .rp-gh.not_found,.rp .rp-gh.error{border-color:#f2a3a3;background:#fff3f3}
        .rp .rp-gh.waiting{border-color:#f0c36d;background:#fff9ec}
        .rp .rp-ghlog{background:#0b1220;color:#fca5a5;font:11px/1.5 ui-monospace,Menlo,monospace;border-radius:6px;padding:8px;max-height:260px;overflow:auto;white-space:pre-wrap;margin:4px 0 0;user-select:text}
        .rp .rp-ghsteps{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:#475569}
        .rp .rp-ghsteps .success{color:#1c7c43}.rp .rp-ghsteps .failure{color:#c62828;font-weight:700}.rp .rp-ghsteps .in_progress{color:#2b6cdf;font-weight:700}
        .rp .rp-log{background:#0b1220;color:#cbd5e1;font:12px/1.55 ui-monospace,Menlo,monospace;border-radius:8px;padding:10px;max-height:260px;overflow:auto;margin-top:6px}
        .rp .rp-log .t{color:#64748b;margin-right:8px}.rp .rp-log .s{color:#7fa8ff;margin-right:8px;display:inline-block;min-width:76px}
        .rp .rp-log .warn{color:#fcd34d}.rp .rp-log .error{color:#fca5a5}
        .rp .rp-log .cursor{animation:rpblink 1s infinite;color:#7fa8ff}
        @media (max-width:1100px){.rp .rp-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
