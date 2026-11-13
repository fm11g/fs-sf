'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { CLAUDE_MODELS, EFFORTS, TIERS, claudeLabel, effortLabel, type Tier } from '@/lib/models';

const loadApplied = () => api('/api/models').catch(() => ({ applied: {} }));

/** 작업대 단계 머리: 이 단계에 적용될 모델·생각 깊이 (대표는 그 자리에서 변경) */
export default function ModelChip({ step, owner }: { step: string; owner: boolean }) {
  const [a, setA] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadApplied().then((d: any) => setA(d.applied?.[step] || null)); }, [step]);
  if (!a) return null;
  const tier = (a.tier || 'normal') as Tier;
  const save = async (patch: any) => {
    setBusy(true);
    try {
      // 다른 화면에서 바뀌었을 수 있으니 저장 직전에 최신 값을 다시 읽고 그 위에 바꿈
      const cur = ((await loadApplied()) as any).applied?.[step] || a;
      const d = await api('/api/models', { task: step, model: { claude: cur.claude, effort: cur.effort, tier: cur.tier, provider: cur.provider, openai: cur.openai, oss: cur.oss, ...patch } });
      setA(d.applied[step]);
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  return (
    <span className="modelchip">
      <button className={`mc ${tier}`} onClick={() => owner && setOpen(!open)} title={owner ? '이 단계 모델 바꾸기' : '이 단계에 쓰는 AI 모델'} style={{ cursor: owner ? 'pointer' : 'default' }}>
        {TIERS[tier]?.label.split(' ')[0]} {claudeLabel(a.claude)} · 생각 {effortLabel(a.effort)}{a.source === 'task' ? '' : ' (추천)'}
      </button>
      {open && owner && (
        <span className="mcpanel">
          <select value={a.claude} disabled={busy} onChange={(e) => save({ claude: e.target.value })}>
            {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select value={a.effort} disabled={busy} onChange={(e) => save({ effort: e.target.value })}>
            {EFFORTS.map((e) => <option key={e.id} value={e.id}>생각 {e.label} — {e.note}</option>)}
          </select>
          <Link href="/admin/models">전체 작업 보기 →</Link>
          <span className="mute">다음 실행부터 적용</span>
        </span>
      )}
      <style>{`
        .modelchip{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
        .modelchip .mc{font-size:12px;padding:3px 10px;border-radius:999px;font-weight:700}
        .modelchip .mc.deep{background:#f3ecff;color:#5b2bb5;border-color:#e1d3fb}
        .modelchip .mc.normal{background:#eef2ff;color:#1739a6;border-color:#d7e0ff}
        .modelchip .mc.fast{background:#e8f8ef;color:#14845b;border-color:#c9ecd9}
        .modelchip .mcpanel{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
        .modelchip select{padding:4px 6px;font-size:12px}
      `}</style>
    </span>
  );
}
