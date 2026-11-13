'use client';
import { BLOCKS, PRESETS, type Perms } from '@/lib/perms';

/** 권한 블록 고르기: 블록마다 없음 / 보기 / 작업 */
export default function PermEditor({ value, onChange }: { value: Perms; onChange: (p: Perms) => void }) {
  const set = (k: string, v: 'none' | 'view' | 'work') => {
    const n = { ...value };
    if (v === 'none') delete n[k]; else n[k] = v;
    onChange(n);
  };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="row">
        <span className="mute">묶음:</span>
        {PRESETS.map((p) => <button key={p.name} onClick={() => onChange({ ...p.perms })}>{p.name}</button>)}
        <button onClick={() => onChange({})}>모두 해제</button>
      </div>
      {(['화면', '공정 단계'] as const).map((g) => (
        <div key={g}>
          <h3 style={{ margin: '6px 0' }}>{g}</h3>
          <div className="perm-grid">
            {BLOCKS.filter((b) => b.group === g).map((b) => {
              const cur = value[b.key] || 'none';
              return (
                <div key={b.key} className={`perm ${cur}`}>
                  <b>{b.label}</b>
                  <small>{b.desc}</small>
                  <div className="seg">
                    {(b.workOnly ? ['none', 'work'] : ['none', 'view', 'work']).map((v) => (
                      <button key={v} className={cur === v ? 'on' : ''} onClick={() => set(b.key, v as any)}>{{ none: '없음', view: '보기', work: '작업' }[v]}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="mute">· 공정 단계 블록을 하나라도 주면 현황판 보기는 자동으로 켜집니다(그 단계만 보임) · 설정·연결·키·직원 관리·삭제·데이터 내보내기는 대표 전용</p>
    </div>
  );
}
