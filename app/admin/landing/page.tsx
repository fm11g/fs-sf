'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function LandingTemplates() {
  const [list, setList] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>({ name: '', html: '', asset_base: '', is_active: true });
  const load = async () => {
    const d = await api('/api/landing/template').catch(() => ({ templates: [] }));
    setList(d.templates || []);
  };
  useEffect(() => { load(); }, []);
  const loadSample = async () => setEdit({ ...edit, name: edit.name || '기본 정책자금 랜딩', html: await (await fetch('/landing-sample.html')).text() });
  const save = async () => {
    try { const r = await api('/api/landing/template', edit); setEdit(r); load(); alert(`저장 완료 · 슬롯 ${r.slots.length}개 인식`); }
    catch (e: any) { alert(e.message); }
  };
  return (
    <>
      <h1>랜딩 템플릿</h1>
      <div className="card">
        <p className="mute" style={{ marginTop: 0 }}>
          랜딩 전체 HTML을 붙여넣고, 바꿀 문구 요소에 <code>data-slot="키" data-max="최대글자수" data-label="용도"</code> 를 붙이세요.
          속성값은 <code>data-slot-attr="content"</code>. 콘텐츠마다 AI가 글자수에 맞춰 문구를 채워 <code>/l/슬러그</code> 와 <code>/l/today</code> 로 서비스합니다.
          기존 도메인(govbizfund.co.kr)에서 그대로 쓰려면 그 페이지에 <code>&lt;script src=&quot;{typeof location !== 'undefined' ? location.origin : ''}/sync.js&quot; defer&gt;&lt;/script&gt;</code> 한 줄을 넣으면 같은 슬롯이 자동 교체됩니다.
        </p>
        <div className="row" style={{ marginBottom: 8 }}>
          <input placeholder="템플릿 이름" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <input style={{ flex: 1 }} placeholder="에셋 기준 URL (예: https://govbizfund.co.kr/) — ./js/main.js 같은 상대경로용" value={edit.asset_base || ''} onChange={(e) => setEdit({ ...edit, asset_base: e.target.value })} />
          <label><input type="checkbox" checked={!!edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> 활성</label>
          <button onClick={loadSample}>샘플 불러오기</button>
          <button className="pri" onClick={save}>저장 · 슬롯 파싱</button>
        </div>
        <textarea style={{ minHeight: 420 }} value={edit.html} onChange={(e) => setEdit({ ...edit, html: e.target.value })} placeholder="<!doctype html> …" />
        {edit.slots && (
          <table style={{ marginTop: 12 }}><thead><tr><th>키</th><th>용도</th><th>최대</th><th>현재 문구</th></tr></thead><tbody>
            {edit.slots.map((s: any) => <tr key={s.key}><td>{s.key}</td><td>{s.label}</td><td>{s.max ?? '-'}</td><td className="mute">{s.current}</td></tr>)}
          </tbody></table>
        )}
      </div>
      <div className="card">
        <h2>저장된 템플릿</h2>
        <table><tbody>
          {list.map((t) => (
            <tr key={t.id}><td>{t.name}</td><td>{t.slots.length}개 슬롯</td><td>{t.is_active && <span className="tag ok">활성</span>}</td>
              <td><button onClick={() => setEdit(t)}>편집</button></td></tr>
          ))}
        </tbody></table>
      </div>
    </>
  );
}
