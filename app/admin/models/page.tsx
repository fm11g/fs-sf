'use client';
import { Fragment, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { CLAUDE_MODELS, EFFORTS, TASKS, TIERS, relCost, type Effort, type ModelSettings, type TaskModel, type Tier } from '@/lib/models';

const GROUPS = ['공정 단계', '검수·학습', '분석·편성'] as const;
const PROVIDERS = [['', '자동 (전환 순서대로)'], ['claude', 'Claude 먼저'], ['openai', 'OpenAI 먼저'], ['oss', '오픈소스 먼저']];

export default function Models() {
  const [saved, setSaved] = useState<ModelSettings>({});
  const [applied, setApplied] = useState<Record<string, any>>({});
  const [prov, setProv] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api('/api/models').then((d) => { setSaved(d.saved || {}); setApplied(d.applied); setProv(d.providers); });
  useEffect(() => { load(); }, []);

  const post = async (body: any, note: string, key = 'x') => {
    setBusy(key); setMsg('');
    try { const d = await api('/api/models', body); setSaved(d.saved); setApplied(d.applied); setMsg(note); } catch (e: any) { setMsg(`⚠ ${e.message}`); }
    setBusy(null);
  };
  const setTask = (k: string, patch: Partial<TaskModel>, note = '저장했습니다 — 다음 실행부터 적용') => {
    const cur = saved.tasks?.[k] || {};
    const a = applied[k] || {};
    // 처음 바꾸는 작업이면 지금 적용 중인 값에서 시작
    post({ task: k, model: { claude: cur.claude || a.claude, effort: cur.effort || a.effort, tier: cur.tier, provider: cur.provider, openai: cur.openai, oss: cur.oss, ...patch } }, note, k);
  };
  const applyTier = (k: string, tier: Tier) => setTask(k, { ...TIERS[tier].preset, tier }, `${TIERS[tier].label} 로 분류 — ${CLAUDE_MODELS.find((m) => m.id === TIERS[tier].preset.claude)?.label} · 생각 ${EFFORTS.find((e) => e.id === TIERS[tier].preset.effort)?.label}`);
  const bulk = (fn: (t: (typeof TASKS)[number]) => TaskModel | null, note: string) => {
    const tasks: Record<string, TaskModel> = {};
    for (const t of TASKS) { const m = fn(t); if (m) tasks[t.key] = { ...(saved.tasks?.[t.key] || {}), ...m }; }
    post({ models: { ...saved, tasks } }, note, 'bulk');
  };

  if (!applied || !Object.keys(applied).length) return <p>불러오는 중…</p>;
  const total = TASKS.slice(0, 8).reduce((n, t) => n + relCost(applied[t.key] || {}), 0);

  return (
    <div id="tpf-models">
      <h1>AI 모델 · 생각 깊이</h1>
      <p className="mute" style={{ marginTop: -10 }}>
        일마다 필요한 생각의 양이 다릅니다. 기획·대사처럼 판단과 창작이 결과를 좌우하는 일은 <b>깊게</b>, 글자수 맞추기·분류처럼 규칙대로 하면 되는 일은 <b>빠르게</b> 돌려서
        품질은 지키고 시간과 비용은 줄입니다. 바꾸면 <b>다음 실행부터</b> 적용되고, 작업대의 각 단계에도 지금 쓰는 모델이 표시됩니다.
      </p>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            {(Object.keys(TIERS) as Tier[]).map((k) => <span key={k} className={`tier ${k}`} title={TIERS[k].desc}>{TIERS[k].label} <small>{TIERS[k].desc}</small></span>)}
          </div>
          <div className="row">
            <button disabled={!!busy} onClick={() => confirm('모든 작업을 추천 분류(기본값)로 되돌릴까요?') && post({ models: { ...saved, tasks: {} } }, '추천 분류로 되돌렸습니다', 'bulk')}>추천 분류로 되돌리기</button>
            <button disabled={!!busy} onClick={() => bulk((t) => (t.tier === 'deep' ? { claude: 'claude-sonnet-5-5', effort: 'medium' } : { ...TIERS.fast.preset }), '비용 절약: 깊은 일은 Sonnet·보통, 나머지는 Haiku·낮음')}>비용 절약</button>
            <button disabled={!!busy} onClick={() => bulk((t) => (t.tier === 'fast' ? { ...TIERS.normal.preset } : { claude: 'claude-opus-5-5', effort: t.tier === 'deep' ? 'xhigh' : 'high' }), '품질 우선: Opus 위주, 깊은 일은 생각 매우 높음')}>품질 우선</button>
          </div>
        </div>
        <p className="mute" style={{ margin: '10px 0 0' }}>
          숏폼 1편(공정 8단계) 상대 비용 ≈ <b>{total.toFixed(0)}</b> <span>(모두 Haiku·낮음 = 8, 정확한 요금이 아니라 비교용)</span>
          {prov && !prov.claude?.ready && <> · <span style={{ color: 'var(--bad)' }}>Claude 키가 없어 지금은 {['openai', 'oss'].filter((p) => prov[p]?.ready).join('·') || '어느 제공자도'} 사용 — [연결·키]에서 입력하세요</span></>}
        </p>
      </div>
      {msg && <div className="card" style={{ padding: 10 }}>{msg}</div>}

      {GROUPS.map((gname) => (
        <div className="card" key={gname}>
          <h2>{gname}</h2>
          <table>
            <thead><tr><th style={{ width: 210 }}>작업</th><th style={{ width: 150 }}>분류</th><th>Claude 모델</th><th>생각 깊이</th><th style={{ width: 70 }}>비용</th><th style={{ width: 90 }}></th></tr></thead>
            <tbody>
              {TASKS.filter((t) => t.group === gname).map((t) => {
                const a = applied[t.key] || {};
                const own = saved.tasks?.[t.key];
                const tier: Tier = (own?.tier || t.tier) as Tier;
                return (
                  <Fragment key={t.key}>
                    <tr className={own ? 'own' : ''}>
                      <td>
                        <b>{t.label}</b>{t.web && <span className="mute"> · 웹검색</span>}{t.vision && <span className="mute"> · 이미지</span>}
                        <div className="mute" style={{ marginTop: 2 }}>{t.why}</div>
                      </td>
                      <td>
                        <select className={`tier ${tier}`} value={tier} disabled={busy === t.key} onChange={(e) => applyTier(t.key, e.target.value as Tier)}>
                          {(Object.keys(TIERS) as Tier[]).map((k) => <option key={k} value={k}>{TIERS[k].label}</option>)}
                        </select>
                        {own?.tier && own.tier !== t.tier && <div className="mute">추천: {TIERS[t.tier].label}</div>}
                      </td>
                      <td>
                        <select value={a.claude} disabled={busy === t.key} onChange={(e) => setTask(t.key, { claude: e.target.value })} style={{ width: '100%', minWidth: 160 }}>
                          {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id} title={m.note}>{m.label}</option>)}
                          {!CLAUDE_MODELS.some((m) => m.id === a.claude) && <option value={a.claude}>{a.claude}</option>}
                        </select>
                        <div className="mute" style={{ marginTop: 2 }}>{CLAUDE_MODELS.find((m) => m.id === a.claude)?.note}</div>
                      </td>
                      <td>
                        <div className="seg">
                          {EFFORTS.map((e) => (
                            <button key={e.id} title={e.note} className={a.effort === e.id ? 'on' : ''} disabled={busy === t.key} onClick={() => setTask(t.key, { effort: e.id as Effort })}>{e.label}</button>
                          ))}
                        </div>
                      </td>
                      <td><div className="bar" title="상대 비용·시간"><i style={{ width: `${Math.min(100, (relCost(a) / 60) * 100)}%` }} /></div><span className="mute">{relCost(a).toFixed(1)}</span></td>
                      <td className="row" style={{ gap: 4 }}>
                        <button onClick={() => setOpen(open === t.key ? null : t.key)}>{open === t.key ? '닫기' : '고급'}</button>
                        {own && <button title="추천 분류로" onClick={() => post({ reset: t.key }, `${t.label}: 추천 분류로 되돌림`, t.key)}>↺</button>}
                      </td>
                    </tr>
                    {open === t.key && (
                      <tr><td colSpan={6} className="adv">
                        <div className="row">
                          <label>먼저 쓸 제공자 <select value={own?.provider || ''} onChange={(e) => setTask(t.key, { provider: e.target.value || undefined })}>{PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                          <label>OpenAI 모델 <input placeholder={prov?.openai?.model || 'gpt-5.5'} defaultValue={own?.openai || ''} onBlur={(e) => e.target.value !== (own?.openai || '') && setTask(t.key, { openai: e.target.value || undefined })} /></label>
                          <label>오픈소스 모델 <input placeholder={prov?.oss?.model || '(연결·키 기본값)'} defaultValue={own?.oss || ''} onBlur={(e) => e.target.value !== (own?.oss || '') && setTask(t.key, { oss: e.target.value || undefined })} /></label>
                        </div>
                        <p className="mute" style={{ margin: '6px 0 0' }}>
                          Claude 가 실패하면 OpenAI → 오픈소스 순으로 넘어갑니다. 생각 깊이는 OpenAI 에도 적용(매우 높음·최대 → 높음)되고 오픈소스 모델에는 적용되지 않습니다.
                          {(a.effort === 'xhigh' || a.effort === 'max') && t.group === '공정 단계' && ' ⚠ 매우 높음·최대는 오래 걸려 서버 제한 시간(300초)을 넘길 수 있습니다. 후보 여러 개(best_of)와 함께 쓰면 비용이 크게 늘어납니다.'}
                        </p>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      <style>{`
        #tpf-models td{vertical-align:middle}
        #tpf-models tr.own td:first-child{box-shadow:inset 3px 0 var(--pri)}
        #tpf-models .tier{display:inline-flex;gap:6px;align-items:center;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid var(--line)}
        #tpf-models .tier small{font-weight:400;color:var(--mute)}
        #tpf-models .tier.deep{background:#f3ecff;color:#5b2bb5}
        #tpf-models .tier.normal{background:#eef2ff;color:var(--pri)}
        #tpf-models .tier.fast{background:#e8f8ef;color:var(--ok)}
        #tpf-models select.tier{border-radius:8px;padding:6px 8px}
        #tpf-models .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;white-space:nowrap}
        #tpf-models .seg button{border:0;border-radius:0;padding:6px 9px;font-size:12px;border-right:1px solid var(--line)}
        #tpf-models .seg button:last-child{border-right:0}
        #tpf-models .seg button.on{background:var(--pri);color:#fff}
        #tpf-models .bar{height:6px;background:#eef1f7;border-radius:3px;overflow:hidden;width:60px}
        #tpf-models .bar i{display:block;height:100%;background:linear-gradient(90deg,#14845b,#e0a100,#c0392b)}
        #tpf-models td.adv{background:#fafbfe}
        #tpf-models td.adv label{display:grid;gap:4px;font-size:12px;color:var(--mute)}
      `}</style>
    </div>
  );
}
