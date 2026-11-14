'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { KIND_LABEL, PLATFORM_LABEL, fmtTok, fmtUsd } from '@/lib/prices';
import { useMe } from '../MeContext';
import { modelLabel, taskLabel, usageAmount } from '../UsagePanel';
import { effortLabel } from '@/lib/models';

const kst = (d: Date) => new Date(d.getTime() + 9 * 36e5).toISOString().slice(0, 10);
const PERIODS = [['today', '오늘', 0], ['7', '7일', 6], ['30', '30일', 29], ['month', '이번 달', -1], ['90', '90일', 89]] as const;

export default function Usage() {
  const me = useMe();
  const [period, setPeriod] = useState('30');
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<'sum' | 'log' | 'price'>('sum');
  const range = useMemo(() => {
    const now = new Date();
    const p = PERIODS.find((x) => x[0] === period)!;
    const from = p[2] === -1 ? kst(now).slice(0, 8) + '01' : kst(new Date(now.getTime() - p[2] * 864e5));
    return { from, to: kst(now) };
  }, [period]);
  const qs = useMemo(() => new URLSearchParams({ from: range.from, to: range.to, ...filter }).toString(), [range, filter]);
  useEffect(() => { setD(null); api(`/api/usage?${qs}&rows=500`).then(setD).catch((e) => setD({ error: e.message })); }, [qs]);

  return (
    <div id="tpf-usage">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>API 사용량</h1>
        <div className="row">
          <div className="seg">{PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
          <a href={`/api/usage?${qs}&format=csv`}><button>CSV 내려받기</button></a>
        </div>
      </div>
      <p className="mute">모든 AI 생성·검수·학습·분석과 웹검색·AI 목소리·음성 인식·렌더·업로드·메일을 한 줄씩 기록합니다. 각 산출물(작업대 단계, SOP 제안, 참고 영상, 편성표)에도 같은 내역이 붙어 있습니다. 비용은 단가표 기준 추정치입니다.</p>
      {Object.keys(filter).length > 0 && (
        <div className="row" style={{ marginBottom: 8 }}>
          {Object.entries(filter).map(([k, v]) => <span key={k} className="tag">{k}: {k === 'platform' ? PLATFORM_LABEL[v] || v : k === 'task' ? taskLabel(v) : v} <a href="#" onClick={(e) => { e.preventDefault(); const f = { ...filter }; delete f[k]; setFilter(f); }}>✕</a></span>)}
        </div>
      )}
      <div className="tabs">
        <button className={tab === 'sum' ? 'on' : ''} onClick={() => setTab('sum')}>요약</button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>전체 기록</button>
        <button className={tab === 'price' ? 'on' : ''} onClick={() => setTab('price')}>단가표</button>
      </div>

      {tab === 'price' ? <Prices owner={me?.role === 'owner'} from={range.from} /> : !d ? <p>불러오는 중…</p> : d.error ? <div className="card">⚠ {d.error}</div> : tab === 'sum' ? (
        <>
          <div className="kpis">
            {d.show_cost && <div className="kpi"><b>{fmtUsd(d.total.cost)}</b>추정 비용{d.total.unpriced ? <small> · 단가 없음 {d.total.unpriced}건</small> : null}</div>}
            <div className="kpi"><b>{d.total.calls.toLocaleString()}</b>API 호출{d.total.failed ? <small> · 실패 {d.total.failed}</small> : null}</div>
            <div className="kpi"><b>{fmtTok(d.total.input + d.total.cache)}</b>입력 토큰{d.total.cache ? <small> · 캐시 {fmtTok(d.total.cache)}</small> : null}</div>
            <div className="kpi"><b>{fmtTok(d.total.output)}</b>출력 토큰 <small>(생각 포함)</small></div>
            <div className="kpi"><b>{d.total.searches}</b>웹검색</div>
            {d.show_cost && d.by_content.filter((x: any) => x.key !== '-').length > 0 && <div className="kpi"><b>{fmtUsd(d.by_content.filter((x: any) => x.key !== '-').reduce((n: number, x: any) => n + x.cost, 0) / d.by_content.filter((x: any) => x.key !== '-').length)}</b>숏폼 1편 평균</div>}
          </div>

          {d.by_day.length > 1 && (
            <div className="card">
              <h2>일별 {d.show_cost ? '비용' : '호출'}</h2>
              <Bars rows={d.by_day} value={(x: any) => (d.show_cost ? x.cost : x.calls)} fmt={(v: number) => (d.show_cost ? fmtUsd(v) : `${v}회`)} />
            </div>
          )}

          <div className="grid2">
            <div className="card">
              <h2>플랫폼 · 모델</h2>
              <Table rows={d.by_platform_model} cost={d.show_cost} head="플랫폼 / 모델"
                label={(x: any) => { const [p, m] = x.key.split('|'); return <><a href="#" onClick={(e) => { e.preventDefault(); setFilter({ ...filter, platform: p }); }}>{PLATFORM_LABEL[p] || p}</a> <span className="mute">/</span> <a href="#" onClick={(e) => { e.preventDefault(); setFilter({ ...filter, platform: p, model: m }); }}>{modelLabel(p, m)}</a></>; }} />
            </div>
            <div className="card">
              <h2>작업별</h2>
              <Table rows={d.by_task} cost={d.show_cost} head="작업" label={(x: any) => <a href="#" onClick={(e) => { e.preventDefault(); setFilter({ ...filter, task: x.key }); }}>{taskLabel(x.key)}</a>} />
            </div>
            <div className="card">
              <h2>종류별</h2>
              <Table rows={d.by_kind} cost={d.show_cost} head="종류" label={(x: any) => <a href="#" onClick={(e) => { e.preventDefault(); setFilter({ ...filter, kind: x.key }); }}>{KIND_LABEL[x.key] || x.key}</a>} />
            </div>
            <div className="card">
              <h2>산출물(콘텐츠)별</h2>
              <Table rows={d.by_content} cost={d.show_cost} head="콘텐츠" label={(x: any) => (x.key === '-' ? <span className="mute">{x.title}</span> : <Link href={`/admin/contents/${x.key}`}>{x.title}</Link>)} />
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <p className="mute" style={{ marginTop: 0 }}>최근 {d.rows.length}건 (전체는 CSV) · 플랫폼·모델·작업을 누르면 그 조건으로 걸러 봅니다.</p>
          <table>
            <thead><tr><th>시각</th><th>산출물</th><th>작업</th><th>종류</th><th>플랫폼</th><th>모델 · 생각</th><th>사용량</th><th>시간</th>{d.show_cost && <th>비용</th>}<th>실행</th><th>결과</th></tr></thead>
            <tbody>
              {d.rows.map((r: any) => (
                <tr key={r.id} style={r.ok ? undefined : { background: '#fff5f5' }}>
                  <td className="mute" style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{r.content_id ? <Link href={`/admin/contents/${r.content_id}`}>{d.by_content.find((x: any) => x.key === r.content_id)?.title || r.content_id.slice(0, 8)}</Link> : r.ref_table ? <span className="mute">{({ sop_proposals: 'SOP 제안', ref_videos: '참고 영상', editorial_plans: '편성표', editorial: '편성표', channel_posts: '채널 분석', sops: 'SOP' } as any)[r.ref_table] || r.ref_table} #{String(r.ref_id || '').slice(0, 12)}</span> : '-'}</td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); setFilter({ ...filter, task: r.task || '' }); }}>{taskLabel(r.task || r.step)}</a></td>
                  <td>{KIND_LABEL[r.kind] || r.kind}</td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); setFilter({ ...filter, platform: r.platform }); }}>{PLATFORM_LABEL[r.platform] || r.platform}</a></td>
                  <td>{modelLabel(r.platform, r.model)}{r.effort && <span className="mute"> · {effortLabel(r.effort)}</span>}{r.attempt > 1 && <span className="mute"> · {r.attempt}번째</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{usageAmount(r)}</td>
                  <td className="mute">{r.ms ? `${(r.ms / 1000).toFixed(1)}초` : '-'}</td>
                  {d.show_cost && <td>{r.priced === false ? <span className="mute">단가 없음</span> : fmtUsd(Number(r.cost_usd || 0))}</td>}
                  <td className="mute">{r.by || '-'}</td>
                  <td>{r.ok ? '✓' : <span title={r.error || ''} style={{ color: 'var(--bad)' }}>✕</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <style>{`
        #tpf-usage .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
        #tpf-usage .seg button{border:0;border-radius:0;padding:6px 10px;border-right:1px solid var(--line)}
        #tpf-usage .seg button:last-child{border-right:0}
        #tpf-usage .seg button.on{background:var(--pri);color:#fff}
        #tpf-usage .kpi small{display:inline;font-size:11px}
        #tpf-usage .bars{display:flex;align-items:flex-end;gap:3px;height:140px;padding-top:16px}
        #tpf-usage .bars div{flex:1;background:var(--pri);border-radius:3px 3px 0 0;min-height:2px;position:relative;opacity:.85}
        #tpf-usage .bars div:hover{opacity:1}
        #tpf-usage .bars div span{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);font-size:10px;color:var(--mute);white-space:nowrap;display:none}
        #tpf-usage .bars div:hover span{display:block}
        #tpf-usage .bar{height:6px;background:#eef1f7;border-radius:3px;overflow:hidden;min-width:50px}
        #tpf-usage .bar i{display:block;height:100%;background:var(--pri)}
        #tpf-usage .pr input{width:76px;padding:4px 6px;font-size:12px}
      `}</style>
    </div>
  );
}

function Bars({ rows, value, fmt }: { rows: any[]; value: (x: any) => number; fmt: (v: number) => string }) {
  const max = Math.max(...rows.map(value), 1e-9);
  return (
    <>
      <div className="bars">{rows.map((x) => <div key={x.key} style={{ height: `${(value(x) / max) * 100}%` }} title={`${x.key} · ${fmt(value(x))}`}><span>{x.key.slice(5)} {fmt(value(x))}</span></div>)}</div>
      <div className="row mute" style={{ justifyContent: 'space-between', fontSize: 11 }}><span>{rows[0]?.key}</span><span>{rows[rows.length - 1]?.key}</span></div>
    </>
  );
}

function Table({ rows, label, head, cost }: { rows: any[]; label: (x: any) => React.ReactNode; head: string; cost: boolean }) {
  const max = Math.max(...rows.map((x) => (cost ? x.cost : x.calls)), 1e-9);
  return (
    <table>
      <thead><tr><th>{head}</th><th>호출</th><th>사용량 (토큰 입력/출력 · 단위)</th><th>검색</th>{cost && <th>비용</th>}<th></th></tr></thead>
      <tbody>
        {rows.slice(0, 20).map((x) => (
          <tr key={x.key}>
            <td>{label(x)}</td>
            <td>{x.calls}{x.failed ? <span className="mute"> (실패 {x.failed})</span> : ''}</td>
            <td className="mute">{x.input + x.output + x.cache ? `${fmtTok(x.input + x.cache)} / ${fmtTok(x.output)}` : x.units && x.unit !== '혼합' ? usageAmount({ units: x.units, unit: x.unit }) : '-'}</td>
            <td className="mute">{x.searches || '-'}</td>
            {cost && <td>{fmtUsd(x.cost)}{x.unpriced ? <span className="mute" title="단가 미입력 항목 있음"> *</span> : ''}</td>}
            <td><div className="bar"><i style={{ width: `${((cost ? x.cost : x.calls) / max) * 100}%` }} /></div></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const FIELDS: [string, string][] = [['in', '입력 $/100만'], ['out', '출력 $/100만'], ['cache_read', '캐시 읽기'], ['per_search', '검색 1회 $'], ['per_unit', '단위당 $']];

function Prices({ owner, from }: { owner: boolean; from: string }) {
  const [d, setD] = useState<any>(null);
  const [edit, setEdit] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState('');
  const [newKey, setNewKey] = useState('');
  useEffect(() => { api('/api/usage/prices').then((x) => { setD(x); setEdit(JSON.parse(JSON.stringify(x.saved || {}))); }); }, []);
  if (!d) return <p>불러오는 중…</p>;
  const keys = [...new Set([...Object.keys(d.defaults), ...Object.keys(edit)])];
  const val = (k: string, f: string) => edit[k]?.[f] ?? '';
  const set = (k: string, f: string, v: string) => setEdit({ ...edit, [k]: { ...(edit[k] || {}), [f]: v } });
  const save = async (recalc: boolean) => {
    setMsg('저장 중…');
    try { const r = await api('/api/usage/prices', { prices: edit, recalc, from }); setMsg(recalc ? `저장했고 ${from} 이후 기록 ${r.recalced}건의 비용을 다시 계산했습니다` : '저장했습니다 — 새 기록부터 적용'); } catch (e: any) { setMsg(`⚠ ${e.message}`); }
  };
  return (
    <div className="card">
      <p className="mute" style={{ marginTop: 0 }}>
        빈 칸은 기본값(회색)을 씁니다. Claude 기본값은 공식 요금 기준이고, OpenAI·Fish Audio·GitHub Actions 등은 쓰는 요금제마다 달라 직접 입력해야 비용에 잡힙니다.
        생각(추론) 토큰은 출력 토큰으로 계산됩니다.
      </p>
      <table className="pr">
        <thead><tr><th>항목</th>{FIELDS.map(([f, l]) => <th key={f}>{l}</th>)}<th>메모</th></tr></thead>
        <tbody>
          {keys.map((k) => {
            const def = d.defaults[k] || {};
            const [p, m] = k.split(':');
            return (
              <tr key={k}>
                <td><b>{PLATFORM_LABEL[p] || p}</b> <span className="mute">{m === '*' ? '(기타 모델)' : modelLabel(p, m)}</span></td>
                {FIELDS.map(([f]) => (
                  <td key={f}><input disabled={!owner} placeholder={def[f] != null ? String(def[f]) : ''} value={val(k, f)} onChange={(e) => set(k, f, e.target.value)} /></td>
                ))}
                <td className="mute">{def.unit ? `단위: ${def.unit} · ` : ''}{def.note || ''}{def.long_over ? ` · 프롬프트 ${fmtTok(def.long_over)} 초과 시 $${def.long_in}/$${def.long_out}` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {owner && (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <input placeholder="새 항목 (예: openai:gpt-5.5)" value={newKey} onChange={(e) => setNewKey(e.target.value.trim())} style={{ width: 240 }} />
            <button disabled={!/^[a-z]+:[\w.*-]+$/.test(newKey)} onClick={() => { setEdit({ ...edit, [newKey]: {} }); setNewKey(''); }}>항목 추가</button>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="pri" onClick={() => save(false)}>저장</button>
            <button onClick={() => confirm(`${from} 이후 기록의 비용을 새 단가로 다시 계산할까요?`) && save(true)}>저장 + 지난 기록 다시 계산</button>
            <span className="mute">{msg}</span>
          </div>
        </>
      )}
    </div>
  );
}
