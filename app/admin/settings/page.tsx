'use client';
import { useEffect, useState } from 'react';
import { sbBrowser } from '@/lib/supabase/client';

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
  const load = async () => {
    const { data } = await sb.from('settings').select('value').eq('id', 1).single();
    setV(data?.value || {});
    const { data: b } = await sb.from('bgm_tracks').select('*').order('created_at', { ascending: false });
    setBgms(b || []);
    fetch('/api/providers').then((r) => r.json()).then(setProv).catch(() => {});
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
