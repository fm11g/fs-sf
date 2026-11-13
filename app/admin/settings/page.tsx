'use client';
import { useEffect, useState } from 'react';
import { sbBrowser } from '@/lib/supabase/client';
import { NOTIFY_EVENTS } from '@/lib/notify-events';

const FIELDS: [string, string, 'text' | 'number' | 'bool' | 'list' | 'json'][] = [
  ['brand', '채널명', 'text'],
  ['site_url', '사이트 URL (랜딩·정보글 링크 기준)', 'text'],
  ['target', '타깃', 'text'],
  ['cta_text', '기본 CTA', 'text'],
  ['offers', '제공 가능한 혜택 (이벤트는 이 안에서만 구성)', 'text'],
  ['offer_rules', '이벤트 운영 규칙', 'text'],
  ['lead_webhook', '신청 접수 웹훅 URL (기존 DB 시스템으로 전달, 선택)', 'text'],
  ['mcp_servers', '조사 단계에 연결할 MCP 서버 JSON [{"name","url","token"}]', 'json'],
  ['llm_chain', 'AI 제공자 전환 순서 (쉼표 구분: claude, openai, oss)', 'list'],
  ['voice_id', 'Fish Audio 보이스 ID (reference_id)', 'text'],
  ['tts_model', 'Fish Audio 모델 (예: s1)', 'text'],
  ['tts_speed', '말 속도 (1.0 = 기본)', 'number'],
  ['default_hashtags', '기본 해시태그 (쉼표 구분)', 'list'],
  ['banned_phrases', '금지 표현 (쉼표 구분)', 'list'],
  ['daily_enabled', '매일 아침 자동 생산 (06:10 KST)', 'bool'],
  ['auto_publish', '모든 단계가 승인되면 워커가 바로 업로드', 'bool'],
];

export default function SettingsPage() {
  const sb = sbBrowser();
  const [v, setV] = useState<any>(null);
  const [bgms, setBgms] = useState<any[]>([]);
  const [bgm, setBgm] = useState({ title: '', mood: 'hopeful' });
  const [prov, setProv] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [exp, setExp] = useState<any>(null);
  const load = async () => {
    const { data } = await sb.from('settings').select('value').eq('id', 1).single();
    setV(data?.value || {});
    const { data: b } = await sb.from('bgm_tracks').select('*').order('created_at', { ascending: false });
    setBgms(b || []);
    fetch('/api/providers').then((r) => r.json()).then(setProv).catch(() => {});
    fetch('/api/export').then((r) => r.json()).then(setExp).catch(() => {});
    sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(15).then(({ data: n }) => setNotes(n || []));
  };
  useEffect(() => { load(); }, []);
  if (!v) return <p>불러오는 중…</p>;

  const save = async () => {
    const { error } = await sb.from('settings').update({ value: v, updated_at: new Date().toISOString() }).eq('id', 1);
    alert(error ? error.message : '저장했습니다');
  };
  const upload = async (file: File) => {
    const path = `bgm/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const { error } = await sb.storage.from('media').upload(path, file, { contentType: file.type });
    if (error) return alert(error.message);
    const url = sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    await sb.from('bgm_tracks').insert({ title: bgm.title || file.name, mood: bgm.mood, url });
    load();
  };

  return (
    <>
      <h1>설정 · BGM · 채널</h1>
      <div className="card">
        {FIELDS.map(([k, label, t]) => (
          <div className="slot" key={k}>
            <b>{label}</b>
            {t === 'bool' ? <input type="checkbox" checked={!!v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} style={{ justifySelf: 'start' }} />
              : t === 'list' ? <input value={(v[k] || []).join(', ')} onChange={(e) => setV({ ...v, [k]: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
              : t === 'json' ? <input defaultValue={JSON.stringify(v[k] || [])} onBlur={(e) => { try { setV({ ...v, [k]: JSON.parse(e.target.value || '[]') }); } catch { alert('JSON 형식 오류'); } }} />
              : <input type={t} value={v[k] ?? ''} step="0.05" onChange={(e) => setV({ ...v, [k]: t === 'number' ? Number(e.target.value) : e.target.value })} />}
            <span />
          </div>
        ))}
        <button className="pri" onClick={save}>저장</button>
      </div>

      <div className="card">
        <h2>📧 이메일 알림</h2>
        <div className="slot">
          <b>받는 이메일</b>
          <input placeholder="you@example.com, team@example.com" defaultValue={(v.notify_emails || []).join(', ')} onBlur={(e) => setV({ ...v, notify_emails: e.target.value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean) })} />
          <span className="mute">쉼표로 여러 명</span>
        </div>
        <div className="chips" style={{ margin: '8px 0' }}>
          {NOTIFY_EVENTS.map(([k, label, desc]) => {
            const on = (v.notify_events || []).includes(k);
            return (
              <label key={k} title={desc}>
                <input type="checkbox" checked={on} onChange={(e) => setV({ ...v, notify_events: e.target.checked ? [...(v.notify_events || []), k] : (v.notify_events || []).filter((x: string) => x !== k) })} />
                {label}
              </label>
            );
          })}
        </div>
        <p className="mute">각 메일에는 일의 흐름(10단계 진행 막대) · 이번에 끝난 일의 정리된 내용 · 규칙 검사·AI 의견 · 다음 할 일과 작업대 링크가 들어갑니다. 발송은 Vercel 환경변수 RESEND_API_KEY 또는 SMTP_HOST(예: Gmail 앱 비밀번호) 설정이 필요합니다.</p>
        <div className="row">
          <button className="pri" onClick={save}>저장</button>
          <button onClick={async () => { const r = await fetch('/api/notify/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then((x) => x.json()); alert(r.error || `발송 완료 (${r.via}) → ${r.to.join(', ')}`); load(); }}>테스트 메일</button>
          <button onClick={async () => { const r = await fetch('/api/notify/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'digest' }) }).then((x) => x.json()); alert(r.error || (r.status === 'sent' ? '하루 요약을 보냈습니다' : `발송 실패: ${r.error || r.reason}`)); load(); }}>하루 요약 지금 받기</button>
          <span className="mute">저장 후 눌러 주세요</span>
        </div>
        {notes.length > 0 && (
          <details style={{ marginTop: 10 }}><summary className="mute">최근 발송 기록</summary>
            <table><tbody>{notes.map((n) => (
              <tr key={n.id}><td className="mute">{new Date(n.created_at).toLocaleString('ko-KR')}</td><td><span className={`tag ${n.status === 'sent' ? 'approved' : 'rejected'}`}>{n.status}</span></td><td>{n.subject}</td><td className="mute">{n.error}</td></tr>
            ))}</tbody></table>
          </details>
        )}
      </div>

      <div className="card">
        <h2>🗂 데이터 저장 · 내보내기 <span className="mute">모든 단계 결과물·중간 데이터·평가·SOP 변경</span></h2>
        <p className="mute" style={{ marginTop: 0 }}>Supabase 는 운영용이고, 같은 데이터를 GitHub(학습 데이터 원본)와 구글 시트(보기·분석용)에 점수·등급·태그로 나눠 저장합니다. 실패한 전송은 남아서 매일 18시와 "지금 보내기"에서 다시 시도합니다.</p>
        <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>GitHub</h3>
        <div className="slot"><b>GitHub 에 저장</b><input type="checkbox" checked={v.export_github !== false} onChange={(e) => setV({ ...v, export_github: e.target.checked })} style={{ justifySelf: 'start' }} /><span /></div>
        <div className="slot"><b>저장소 (owner/repo)</b><input placeholder="비우면 GITHUB_REPO 와 같은 저장소" value={v.github_data_repo || ''} onChange={(e) => setV({ ...v, github_data_repo: e.target.value.trim() })} /><span /></div>
        <div className="slot"><b>브랜치</b><input value={v.github_data_branch || 'data'} onChange={(e) => setV({ ...v, github_data_branch: e.target.value.trim() })} /><span className="mute">코드와 분리</span></div>
        {exp && <p className="mute">상태: {exp.github.ready ? '연결 정보 있음' : '토큰/저장소 없음'} · 완료 {exp.github.done} · 대기 {exp.github.pending} · 실패 {exp.github.failed} {exp.github.url && <> · <a href={exp.github.url} target="_blank">data 폴더 열기 ↗</a></>}</p>}
        <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>구글 시트</h3>
        <div className="slot"><b>시트로 보내기</b><input type="checkbox" checked={!!v.export_sheets} onChange={(e) => setV({ ...v, export_sheets: e.target.checked })} style={{ justifySelf: 'start' }} /><span /></div>
        <div className="slot"><b>방식 A · 시트 ID</b><input placeholder="서비스 계정 방식 (Vercel 에 GOOGLE_SERVICE_ACCOUNT_JSON 필요)" value={v.sheets_id || ''} onChange={(e) => setV({ ...v, sheets_id: e.target.value.trim() })} /><span className="mute">URL 의 /d/ 뒤</span></div>
        <div className="slot"><b>방식 B · Apps Script URL</b><input placeholder="https://script.google.com/macros/s/…/exec" value={v.sheets_webhook || ''} onChange={(e) => setV({ ...v, sheets_webhook: e.target.value.trim() })} /><span /></div>
        <div className="slot"><b>시트 비밀값</b><input type="password" value={v.sheets_secret || ''} onChange={(e) => setV({ ...v, sheets_secret: e.target.value })} /><span className="mute">Code.gs 의 SECRET</span></div>
        {exp && <p className="mute">상태: {exp.sheets.mode === 'service_account' ? '서비스 계정' : exp.sheets.mode === 'apps_script' ? 'Apps Script' : '미설정'} · 완료 {exp.sheets.done} · 대기 {exp.sheets.pending} · 실패 {exp.sheets.failed}. 탭: outputs(모든 실행) · ratings(평가) · sop_changes · performance(매일 성과)</p>}
        {exp?.last_errors?.length > 0 && <details><summary className="mute">최근 실패 {exp.last_errors.length}건</summary><ul>{exp.last_errors.map((x: any, i: number) => <li key={i} className="mute">{x.target}: {x.error}</li>)}</ul></details>}
        <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>점수 기반 최적화</h3>
        <div className="slot"><b>참고 예시 수</b><input type="number" min={0} max={4} value={v.fewshot_k ?? 2} onChange={(e) => setV({ ...v, fewshot_k: Number(e.target.value) })} /><span className="mute">생성 때 넣는 고득점 예시 (0 = 끔)</span></div>
        <div className="slot"><b>참고 최소 점수</b><input type="number" min={3} max={5} value={v.fewshot_min_score ?? 4} onChange={(e) => setV({ ...v, fewshot_min_score: Number(e.target.value) })} /><span className="mute">이 점수 이상만 참고</span></div>
        <p className="mute">단계별 "후보 수"(여러 개 만들어 예측 점수 최고 선택)는 [SOP · AI 제어]에서 정합니다.</p>
        <div className="row">
          <button className="pri" onClick={save}>저장</button>
          {(['test_github', 'test_sheets', 'flush', 'rebuild'] as const).map((a) => (
            <button key={a} onClick={async () => {
              const r = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: a }) }).then((x) => x.json());
              alert(r.error ? `실패: ${r.error}` : a === 'flush' ? `보냄: GitHub ${r.github} · 시트 ${r.sheets}${r.errors?.length ? `\n오류: ${r.errors.join('\n')}` : ''}` : a === 'rebuild' ? `데이터셋 재생성: 파일 ${r.files}개${r.commit?.url ? `\n${r.commit.url}` : ''}` : a === 'test_github' ? `GitHub 연결 정상\n${r.url}` : `시트 연결 정상 (connection_test 탭)`);
              fetch('/api/export').then((x) => x.json()).then(setExp);
            }}>{{ test_github: 'GitHub 테스트', test_sheets: '시트 테스트', flush: '대기분 지금 보내기', rebuild: '데이터셋·학습 노트 재생성' }[a]}</button>
          ))}
          <span className="mute">저장 후 테스트하세요</span>
        </div>
      </div>

      <div className="card">
        <h2>🧠 SOP 학습</h2>
        <div className="slot">
          <b>학습 방식</b>
          <select value={v.learn_mode || 'propose'} onChange={(e) => setV({ ...v, learn_mode: e.target.value })}>
            <option value="propose">제안만 — AI 가 보완안을 만들고 내가 골라 반영 (권장)</option>
            <option value="auto">자동 — 보완 제안 중 근거 2개 이상인 추가·수정은 바로 반영 (삭제·금지 항목·전체 재정리는 항상 제안으로)</option>
            <option value="off">끔 — 좋은 예만 모으고 제안하지 않음</option>
          </select>
          <span />
        </div>
        <div className="slot"><b>제안 기준</b><input type="number" min={1} max={20} value={v.learn_min ?? 3} onChange={(e) => setV({ ...v, learn_min: Number(e.target.value) })} /><span className="mute">단계별 미반영 ★4 이상·수정 예 개수</span></div>
        <div className="slot"><b>수정 예 자동 수집</b><input type="checkbox" checked={v.learn_from_edits !== false} onChange={(e) => setV({ ...v, learn_from_edits: e.target.checked })} style={{ justifySelf: 'start' }} /><span className="mute">AI 산출물을 직접 고친 뒤 승인하면 차이를 학습</span></div>
        <p className="mute">조건을 채우면 👍 직후에, 그리고 매일 18시에 단계별 제안을 만듭니다. 반영 내용은 [SOP · AI 제어]의 변경 이력·학습 이력에 남고 되돌릴 수 있습니다.</p>
        <button className="pri" onClick={save}>저장</button>
      </div>

      {prov && (
        <div className="card">
          <h2>AI 제공자 상태 <span className="mute">실제 전환 순서: {(prov.effective_chain || []).join(' → ') || '없음 (에이전트 직접 작업만 가능)'}</span></h2>
          <table><tbody>
            {(['claude', 'openai', 'oss'] as const).map((k) => (
              <tr key={k}><td><b>{{ claude: 'Claude', openai: 'OpenAI', oss: '오픈소스(OpenAI 호환)' }[k]}</b></td>
                <td><span className={`tag ${prov[k].ready ? 'approved' : 'pending'}`}>{prov[k].ready ? '준비됨' : '미설정'}</span></td>
                <td className="mute">{prov[k].model || '-'} {prov[k].base_url || ''}</td>
                <td className="mute">조사용 웹검색: {prov[k].web_search ? '가능' : '불가'}</td></tr>
            ))}
          </tbody></table>
          <p className="mute">키는 Vercel 환경변수에서 설정합니다 (ANTHROPIC_API_KEY / OPENAI_API_KEY / OSS_BASE_URL·OSS_MODEL). 오픈소스 모델로 조사 단계를 돌리려면 TAVILY_API_KEY 또는 SEARXNG_URL 이 필요합니다. 현재 검색 백엔드: {prov.search_backend}</p>
        </div>
      )}
      <div className="card">
        <h2>BGM 라이브러리</h2>
        <p className="mute">저작권 확인된 음원만 올리세요(YouTube 오디오 보관함 등). 렌더 시 기획 무드에 맞는 곡을 자동 선택하고 내레이션 아래로 볼륨을 낮춥니다.</p>
        <div className="row" style={{ marginBottom: 10 }}>
          <input placeholder="곡 제목" value={bgm.title} onChange={(e) => setBgm({ ...bgm, title: e.target.value })} />
          <select value={bgm.mood} onChange={(e) => setBgm({ ...bgm, mood: e.target.value })}>
            {['urgent', 'calm', 'hopeful', 'serious'].map((m) => <option key={m}>{m}</option>)}
          </select>
          <input type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        <table><tbody>
          {bgms.map((b) => (
            <tr key={b.id}><td>{b.title}</td><td><span className="tag">{b.mood}</span></td><td><audio src={b.url} controls style={{ height: 32 }} /></td>
              <td><button onClick={async () => { await sb.from('bgm_tracks').update({ active: !b.active }).eq('id', b.id); load(); }}>{b.active ? '사용 중' : '꺼짐'}</button></td></tr>
          ))}
        </tbody></table>
      </div>

      <div className="card">
        <h2>채널 연결</h2>
        <p><a className="tag" href="/api/oauth/youtube">유튜브 채널 연결 → 리프레시 토큰 발급</a> <span className="mute">발급된 값을 GitHub Secret <code>YT_REFRESH_TOKEN</code> 에 저장</span></p>
        <p className="mute">MCP 서버(이 공장을 Claude에서 조작): <code>{typeof location !== 'undefined' ? location.origin : ''}/api/mcp</code> · 헤더 <code>Authorization: Bearer $MCP_TOKEN</code></p>
        <p className="mute">인스타그램: Meta 개발자 앱에서 비즈니스/크리에이터 계정의 <code>IG_USER_ID</code> 와 장기 토큰(<code>instagram_content_publish</code> 권한)을 발급해 GitHub Secret 에 저장합니다. 프로필 링크는 <code>{v.site_url}/l/today</code> 로 고정하세요.</p>
      </div>
    </>
  );
}
