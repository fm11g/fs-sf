'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { KIND_LABEL, PLATFORM_LABEL, fmtTok, fmtUsd } from '@/lib/prices';
import { taskDef, claudeLabel, effortLabel } from '@/lib/models';
import { stepDef } from '@/lib/steps';

export const taskLabel = (k?: string | null) => {
  if (!k) return '-';
  const extra: Record<string, string> = { tts: 'AI 목소리', render: '영상 렌더', publish: '업로드', notify: '알림 메일' };
  return taskDef(k)?.label || extra[k] || (stepDef(k as any)?.label ?? k);
};
export const modelLabel = (platform: string, model?: string | null) => (platform === 'anthropic' ? claudeLabel(model) : model || '-');
export const usageAmount = (r: any) => {
  const tok = Number(r.input_tokens || 0) + Number(r.output_tokens || 0) + Number(r.cache_read_tokens || 0) + Number(r.cache_write_tokens || 0);
  const parts: string[] = [];
  if (tok) parts.push(`입력 ${fmtTok(Number(r.input_tokens || 0) + Number(r.cache_read_tokens || 0) + Number(r.cache_write_tokens || 0))} · 출력 ${fmtTok(Number(r.output_tokens || 0))}`);
  if (Number(r.searches)) parts.push(`검색 ${r.searches}회`);
  if (Number(r.units)) parts.push(`${Number(r.units) >= 100 ? Math.round(Number(r.units)).toLocaleString() : Number(r.units).toFixed(Number(r.units) < 10 ? 2 : 1)}${r.unit || ''}`);
  return parts.join(' · ') || '-';
};

/**
 * 산출물별 API 사용 내역: 어떤 플랫폼·모델·생각 깊이로 얼마나(토큰·검색·글자·분) 썼고 비용이 얼마인지.
 * query 예: "content_id=…&step=script" · "ref_table=sop_proposals&ref_id=12"
 */
export default function UsagePanel({ query, title = 'API 사용', compact = false, refreshKey }: { query: string; title?: string; compact?: boolean; refreshKey?: any }) {
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api(`/api/usage?${query}&rows=200`).then(setD).catch(() => setD({ error: true })); }, [query, refreshKey]);
  if (!d || d.error) return null;
  const t = d.total;
  if (!t.calls) return compact ? null : <div className="usage-panel mute">{title}: 아직 기록 없음</div>;
  const pm = d.by_platform_model as any[];
  return (
    <div className={`usage-panel ${compact ? 'compact' : ''}`}>
      <div className="row" style={{ gap: 6 }}>
        <b>{title}</b>
        {pm.map((x) => {
          const [platform, model] = x.key.split('|');
          return (
            <span key={x.key} className={`uchip p-${platform}`} title={`${PLATFORM_LABEL[platform] || platform} / ${model} · 호출 ${x.calls}회${x.failed ? ` (실패 ${x.failed})` : ''}`}>
              {PLATFORM_LABEL[platform]?.split(' ')[0] || platform} · {modelLabel(platform, model)}
              <small> {usageAmount({ input_tokens: x.input, output_tokens: x.output, searches: x.searches, units: x.unit && x.unit !== '혼합' ? x.units : 0, unit: x.unit })}{d.show_cost ? ` · ${fmtUsd(x.cost)}` : ''}</small>
            </span>
          );
        })}
        <span className="mute">
          {d.show_cost && <>합계 <b style={{ color: 'var(--ink)' }}>{fmtUsd(t.cost)}</b>{t.unpriced ? <span title="단가가 입력되지 않은 항목은 0으로 계산됨"> · 단가 미입력 {t.unpriced}건</span> : ''} · </>}
          호출 {t.calls}회{t.failed ? ` (실패 ${t.failed})` : ''}
        </span>
        <a href="#" onClick={(e) => { e.preventDefault(); setOpen(!open); }}>{open ? '접기' : '자세히'}</a>
      </div>
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table className="utable">
            <thead><tr><th>시각</th><th>작업</th><th>종류</th><th>플랫폼</th><th>모델 · 생각</th><th>사용량</th><th>시간</th>{d.show_cost && <th>비용</th>}<th>결과</th></tr></thead>
            <tbody>
              {d.rows.map((r: any) => (
                <tr key={r.id} className={r.ok ? '' : 'fail'}>
                  <td className="mute">{new Date(r.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{taskLabel(r.task || r.step)}</td>
                  <td>{KIND_LABEL[r.kind] || r.kind}</td>
                  <td>{PLATFORM_LABEL[r.platform] || r.platform}</td>
                  <td>{modelLabel(r.platform, r.model)}{r.effort ? <span className="mute"> · {effortLabel(r.effort)}</span> : ''}{r.attempt > 1 ? <span className="mute"> · {r.attempt}번째 시도</span> : ''}</td>
                  <td>{usageAmount(r)}</td>
                  <td className="mute">{r.ms ? `${(r.ms / 1000).toFixed(1)}초` : '-'}</td>
                  {d.show_cost && <td>{r.priced === false ? <span className="mute" title="단가 미입력">단가 없음</span> : fmtUsd(Number(r.cost_usd || 0))}</td>}
                  <td>{r.ok ? '✓' : <span title={r.error || ''} style={{ color: 'var(--bad)' }}>✕ {String(r.error || '').slice(0, 40)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <style>{`
        .usage-panel{font-size:12px;margin-top:8px;padding:8px 10px;background:#f7f9fd;border:1px solid var(--line);border-radius:8px}
        .usage-panel.compact{margin-top:6px;padding:6px 8px}
        .usage-panel .uchip{display:inline-block;padding:2px 8px;border-radius:999px;background:#fff;border:1px solid var(--line);font-weight:700}
        .usage-panel .uchip small{font-weight:400;color:var(--mute)}
        .usage-panel .uchip.p-anthropic{border-color:#e6c9b5;background:#fff7f2}
        .usage-panel .uchip.p-openai{border-color:#cfe5dc;background:#f3fbf7}
        .usage-panel .uchip.p-oss{border-color:#d8d3f0;background:#f7f5ff}
        .usage-panel .utable{margin-top:6px;font-size:12px}
        .usage-panel .utable td,.usage-panel .utable th{padding:4px 6px;white-space:nowrap}
        .usage-panel tr.fail td{background:#fff5f5}
      `}</style>
    </div>
  );
}
