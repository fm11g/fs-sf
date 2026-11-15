'use client';
import { VIDEO_FONTS, fontDef } from '@/lib/fonts';

/** 편집기 공용 입력 컨트롤 */
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="f">{label}{children}{hint && <span className="hint">{hint}</span>}</label>;
}

export function Color({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const v = /^#[0-9a-f]{6}/i.test(value || '') ? value.slice(0, 7) : '#ffffff';
  return (
    <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
      <input type="color" value={v} onChange={(e) => onChange(e.target.value)} style={{ width: 36, height: 30, padding: 2 }} />
      <input key={value} defaultValue={value || ''} onBlur={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && e.target.value !== value && onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} style={{ width: 80, fontFamily: 'monospace', fontSize: 12 }} />
    </span>
  );
}

/** 폰트 선택 (분류별, 각 폰트 이름을 그 폰트로 표시) */
export function FontSelect({ value, fallback, onChange }: { value: string; fallback?: string; onChange: (v: string) => void }) {
  const groups = [...new Set(VIDEO_FONTS.map((f) => f.group))];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: `'${value || fallback}'`, fontSize: 15 }}>
      {fallback && <option value="">기본 ({fallback})</option>}
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {VIDEO_FONTS.filter((f) => f.group === g).map((f) => <option key={f.name} value={f.name} style={{ fontFamily: `'${f.name}'` }}>{f.name} — {f.kind}{f.weights.length === 1 ? ' (굵기 고정)' : ''}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

const W_LABEL: Record<number, string> = { 100: '100 가장 얇게', 200: '200', 300: '300 얇게', 400: '400 보통', 500: '500 중간', 600: '600 약간 굵게', 700: '700 굵게', 800: '800 아주 굵게', 900: '900 가장 굵게' };
/** 굵기: 고른 폰트가 실제로 가진 굵기만 */
export function WeightSelect({ font, value, onChange, allowDefault }: { font?: string; value?: number; onChange: (v: number | undefined) => void; allowDefault?: string }) {
  const ws = fontDef(font)?.weights || [400, 700];
  if (ws.length === 1) return <span className="mute">이 폰트는 굵기 {ws[0]} 하나뿐</span>;
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}>
      {allowDefault && <option value="">기본 ({allowDefault})</option>}
      {ws.map((w) => <option key={w} value={w} style={{ fontWeight: w }}>{W_LABEL[w] || w}</option>)}
    </select>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T | undefined; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

/** 숫자 슬라이더 + 직접 입력 */
export function Num({ value, min, max, step = 1, onChange, unit = '' }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => e.target.value !== '' && onChange(Math.max(min, Math.min(max, Number(e.target.value))))} style={{ width: 64 }} />
      {unit && <span className="mute">{unit}</span>}
    </span>
  );
}
