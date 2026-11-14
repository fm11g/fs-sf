'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { can } from '@/lib/perms';
import { useMe } from '../MeContext';

const EMPTY = { industry: '', years: '', who: '', amount: '', count: '1회', rate: '', badge1: '', badge2: '', title: '', body: '', img: '', fund_type: '운전자금', tags: '', verified: false, active: true, note: '' };
const FUND = ['운전자금', '시설자금', '창업자금', '긴급경영안정자금', '기타'];

/**
 * 실제 사례(후기) — 랜딩 후기 카드는 AI 가 쓰지 않고 여기 등록된 사례 원문으로만 채움.
 * 콘텐츠마다 AI 가 오늘 영상 타깃과 가까운 사례를 "고르기만" 함.
 */
export default function Cases() {
  const me = useMe();
  const work = can(me, 'landing_tpl', 'work');
  const [list, setList] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [base, setBase] = useState<string | null>(null);
  const load = () => api('/api/cases').then((d) => { setList(d.cases); setBase(d.asset_base); }).catch((e) => setMsg(`⚠ ${e.message}`));
  const src = (p: string) => { try { return base && !/^https?:/.test(p) ? new URL(p, base).href : p; } catch { return p; } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setMsg('');
    try {
      const body = { ...edit, years: edit.years === '' ? null : Number(edit.years), tags: typeof edit.tags === 'string' ? edit.tags : (edit.tags || []).join(',') };
      await api('/api/cases', body);
      setEdit(null); setMsg('저장했습니다'); load();
    } catch (e: any) { setMsg(`⚠ ${e.message}`); }
  };
  const toggle = async (c: any, k: 'verified' | 'active') => { await api('/api/cases', { id: c.id, [k]: !c[k] }); load(); };
  const del = async (c: any) => { if (!confirm(`#${c.id} "${c.title}" 사례를 지울까요?`)) return; await api(`/api/cases?id=${c.id}`, undefined, 'DELETE'); load(); };
  const imp = async () => {
    try { const r = await api('/api/cases/import', {}); setMsg(`템플릿 후기 ${r.found}개 중 ${r.added}개를 가져왔습니다 (이미 있는 것은 건너뜀). 확인 후 [확인 완료]를 체크하세요.`); load(); } catch (e: any) { setMsg(`⚠ ${e.message}`); }
  };

  const shown = list.filter((c) => !q || JSON.stringify(c).includes(q));
  const verified = list.filter((c) => c.verified && c.active).length;

  return (
    <div id="tpf-cases">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>실제 사례 <span className="mute">{list.length}건 · 사용 중 {list.filter((c) => c.active).length} · 확인 완료 {verified}</span></h1>
        {work && (
          <div className="row">
            <button onClick={imp}>지금 랜딩의 후기 가져오기</button>
            <button className="pri" onClick={() => setEdit({ ...EMPTY })}>+ 사례 추가</button>
          </div>
        )}
      </div>
      <p className="mute">
        랜딩의 후기 카드(<code>case1_…</code> 슬롯)는 AI 가 쓰지 않습니다. 콘텐츠마다 AI 가 아래 목록에서 오늘 영상 타깃(업종·연차·자금 용도)과 가까운 사례를 <b>고르기만</b> 하고,
        카드에는 여기 적힌 원문이 그대로 들어갑니다. <b>확인 완료</b> 사례가 하나라도 있으면 확인 완료 사례만 씁니다.
      </p>
      {msg && <div className="card" style={{ padding: 10 }}>{msg}</div>}
      {verified === 0 && list.length > 0 && <div className="card" style={{ borderColor: '#f0d36b', padding: 10 }}>⚠ 확인 완료된 사례가 없어 모든 사용 중 사례에서 고릅니다. 실제 고객 동의와 근거(승인 서류 등)를 확인한 사례에 [확인 완료]를 체크하세요.</div>}

      <input placeholder="검색 (업종·제목·태그)" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280, marginBottom: 10 }} />
      <div className="grid">
        {shown.map((c) => (
          <div key={c.id} className={`card case ${c.active ? '' : 'off'}`}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                {c.img && <img src={src(c.img)} alt="" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />}
                <div>
                  <div className="mute">#{c.id} · {c.who}</div>
                  <b>{c.title}</b>
                  <div className="mute" style={{ marginTop: 2 }}>{c.amount} · {c.count || '-'} · 금리 {c.rate || '-'} · {[c.badge1, c.badge2].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                <span className={`tag ${c.verified ? 'approved' : ''}`}>{c.verified ? '확인 완료' : '확인 전'}</span>
                {!c.active && <span className="tag">사용 안 함</span>}
              </div>
            </div>
            <p className="body">{c.body}</p>
            {c.tags?.length > 0 && <div className="mute">태그: {c.tags.join(', ')}</div>}
            {c.issues?.filter((x: string) => !x.startsWith('실제 고객')).map((x: string) => <div key={x} className="warnline">⚠ {x}</div>)}
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <span className="mute">랜딩에 쓰인 횟수 {c.used_count || 0}{c.note ? ` · ${c.note}` : ''}</span>
              {work && (
                <div className="row" style={{ gap: 4 }}>
                  <button onClick={() => toggle(c, 'verified')}>{c.verified ? '확인 취소' : '확인 완료'}</button>
                  <button onClick={() => toggle(c, 'active')}>{c.active ? '사용 안 함' : '다시 사용'}</button>
                  <button onClick={() => setEdit({ ...c, years: c.years ?? '', tags: (c.tags || []).join(', ') })}>수정</button>
                  <button onClick={() => del(c)}>삭제</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {!list.length && <div className="card mute">아직 사례가 없습니다. [지금 랜딩의 후기 가져오기]로 활성 템플릿의 후기 카드를 한 번에 옮기거나 [+ 사례 추가]로 등록하세요.</div>}
      </div>

      {edit && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="card">
            <h2>{edit.id ? `사례 #${edit.id} 수정` : '사례 추가'}</h2>
            <div className="form">
              <label>업종<input value={edit.industry} onChange={(e) => setEdit({ ...edit, industry: e.target.value })} placeholder="예: 금속가공 제조업" /></label>
              <label>사업 연차<input type="number" value={edit.years} onChange={(e) => setEdit({ ...edit, years: e.target.value })} /></label>
              <label className="wide">카드 상단 표기<input value={edit.who} onChange={(e) => setEdit({ ...edit, who: e.target.value })} placeholder="금속가공 제조업 / 사업 6년차 / 이** 님" />
                <a href="#" className="mute" onClick={(e) => { e.preventDefault(); setEdit({ ...edit, who: `${edit.industry} / 사업 ${edit.years || '?'}년차 / ${edit.who.split('/')[2]?.trim() || '○** 님'}` }); }}>업종·연차로 만들기</a>
              </label>
              <label>승인금액<input value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} placeholder="₩50,000,000" /></label>
              <label>총 정책자금 횟수<input value={edit.count || ''} onChange={(e) => setEdit({ ...edit, count: e.target.value })} placeholder="1회" /></label>
              <label>금리<input value={edit.rate || ''} onChange={(e) => setEdit({ ...edit, rate: e.target.value })} placeholder="2.6%" /></label>
              <label>자금 종류<select value={edit.fund_type || '운전자금'} onChange={(e) => setEdit({ ...edit, fund_type: e.target.value })}>{FUND.map((f) => <option key={f}>{f}</option>)}</select></label>
              <label>용도 태그1<input value={edit.badge1 || ''} onChange={(e) => setEdit({ ...edit, badge1: e.target.value })} placeholder="운전자금 · 재고 확보" /></label>
              <label>용도 태그2 (선택)<input value={edit.badge2 || ''} onChange={(e) => setEdit({ ...edit, badge2: e.target.value })} /></label>
              <label className="wide">제목<input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
              <label className="wide">본문 (고객이 실제로 한 말 기준)<textarea rows={4} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></label>
              <label className="wide">사진 경로<input value={edit.img || ''} onChange={(e) => setEdit({ ...edit, img: e.target.value })} placeholder="./img/b3.jpg 또는 https://…" /></label>
              <label className="wide">선택 기준 태그 (쉼표 · AI 가 고를 때 참고)<input value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} placeholder="제조업, 설비, 매출 증가, 저신용" /></label>
              <label className="wide">내부 메모 (근거 서류 위치·동의 일자 — 화면에 안 나옴)<input value={edit.note || ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
              <label className="chk"><input type="checkbox" checked={!!edit.verified} onChange={(e) => setEdit({ ...edit, verified: e.target.checked })} /> 실제 고객 동의·근거 확인 완료</label>
              <label className="chk"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> 랜딩에 사용</label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="pri" onClick={save}>저장</button>
              <button onClick={() => setEdit(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        #tpf-cases .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px}
        #tpf-cases .case{margin:0}
        #tpf-cases .case.off{opacity:.5}
        #tpf-cases .case img{width:56px;height:56px;object-fit:cover;border-radius:10px;flex:none;background:#eef1f7}
        #tpf-cases .case .body{font-size:13px;line-height:1.6;color:#334;margin:8px 0 4px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        #tpf-cases .modal{position:fixed;inset:0;background:rgba(10,20,40,.45);display:grid;place-items:center;z-index:100;padding:20px}
        #tpf-cases .modal .card{width:min(760px,100%);max-height:90vh;overflow:auto;margin:0}
        #tpf-cases .form{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        #tpf-cases .form label{display:grid;gap:4px;font-size:12px;color:var(--mute)}
        #tpf-cases .form .wide{grid-column:1/-1}
        #tpf-cases .form label.chk{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink)}
        #tpf-cases .form input:not([type=checkbox]),#tpf-cases .form textarea,#tpf-cases .form select{width:100%;font-family:inherit}
      `}</style>
    </div>
  );
}
