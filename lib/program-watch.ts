/**
 * 공고 변경 감지 (서버)
 *  이미 다룬(공개된) 숏폼의 정책자금 공고를 매일 웹검색으로 다시 확인 → 마감 연장 · 조기 마감 · 취소 · 금액/금리/대상/접수기간 정정을 찾으면
 *  program_changes 에 '결정 대기'로 남기고(바뀐 항목 전 → 후 + 실제 변경 공고 링크) 알림을 보냄.
 *  사람이 [반영]하면 조사 산출물의 공고 값과 이벤트 마감을 고치고 홈페이지 오늘의 랜딩 · 진행 중인 정책자금을 다시 보냄. [무시]는 기록만.
 *  근거 링크(https) 없는 '변경'은 결정 대기로 올리지 않음 — 추측으로 홈페이지 일정을 바꾸지 않기 위해.
 */
import { ask } from './llm';
import { getSettings } from './settings';
import { sbAdmin } from './supabase/server';
import { todayKST } from './prompts';
import { isoKst, parseDeadline } from './deadline';
import { notify } from './notify';
import { contentDeadline, publishLanding, tpfConfig } from './tpf-site';

const DAY = 864e5;
const HTTPS = /^https:\/\/[^\s"'<>]+$/;
const FIELD_KO: Record<string, string> = { deadline: '접수 마감', start: '접수 시작', period: '접수 기간', amount: '한도', rate: '금리', eligibility: '지원 대상', how_to_apply: '신청 방법', status: '공고 상태', name: '공고 이름', agency: '운용 기관', other: '기타' };
const CLOSED = /마감|종료|취소|소진/;

export type WatchResult = {
  status: string; changed: boolean; summary: string; confidence: string;
  changes: { field: string; label: string; before: string; after: string }[];
  proposed: Record<string, any>;
  evidence: { title: string; url: string; date: string; quote: string }[];
};

/** 확인할 콘텐츠: 공개됨 + 공고 있음 + 아직 끝나지 않았거나(마감 전 · 마감일 모름) 공개 45일 이내, 결정 대기 변경이 없는 것 */
export async function watchTargets(limit = 6) {
  const db = sbAdmin();
  const since = new Date(Date.now() - 60 * DAY).toISOString();
  const { data } = await db.from('contents').select('id, slug, topic, research, offer, published_at, program_check, site_landing')
    .not('published_at', 'is', null).gte('published_at', since).order('published_at', { ascending: false }).limit(80);
  const { data: pend } = await db.from('program_changes').select('content_id').eq('status', 'pending');
  const blocked = new Set((pend || []).map((r: any) => r.content_id));
  const now = Date.now();
  return (data || [])
    .filter((c: any) => c.research?.program?.name && !blocked.has(c.id))
    .filter((c: any) => {
      const dl = contentDeadline(c);
      if (dl) return Date.parse(dl) > now - DAY;                       // 마감 전(하루 여유)
      return Date.parse(c.published_at) > now - 45 * DAY;              // 마감일 모름 → 45일까지 확인
    })
    .filter((c: any) => !c.program_check?.at || Date.parse(c.program_check.at) < now - 20 * 3600e3) // 하루 한 번
    .sort((a: any, b: any) => String(a.program_check?.at || '').localeCompare(String(b.program_check?.at || '')))
    .slice(0, limit);
}

function cleanResult(j: any, prog: any): WatchResult {
  const ev = (Array.isArray(j?.evidence) ? j.evidence : [])
    .map((e: any) => ({ title: String(e?.title || '').slice(0, 120), url: String(e?.url || '').slice(0, 400), date: String(e?.date || '').slice(0, 40), quote: String(e?.quote || '').slice(0, 120) }))
    .filter((e: any) => HTTPS.test(e.url)).slice(0, 5);
  const changes = (Array.isArray(j?.changes) ? j.changes : []).map((c: any) => {
    const field = FIELD_KO[c?.field] ? String(c.field) : 'other';
    return { field, label: String(c?.label || FIELD_KO[field]).slice(0, 30), before: String(c?.before ?? '').slice(0, 200), after: String(c?.after ?? '').slice(0, 200) };
  }).filter((c: any) => c.after && c.after !== c.before).slice(0, 10);
  const pr = j?.proposed && typeof j.proposed === 'object' ? j.proposed : {};
  const proposed: Record<string, any> = {};
  for (const k of ['deadline_iso', 'start_iso', 'period', 'deadline', 'amount', 'rate', 'how_to_apply', 'status', 'name', 'agency', 'url']) if (pr[k] && String(pr[k]) !== String(prog?.[k] ?? '')) proposed[k] = String(pr[k]).slice(0, 300);
  if (Array.isArray(pr.eligibility) && pr.eligibility.length) proposed.eligibility = pr.eligibility.map((x: any) => String(x).slice(0, 120)).slice(0, 6);
  const status = String(j?.status || '확인불가').slice(0, 10);
  return { status, changed: !!j?.changed && changes.length > 0, summary: String(j?.summary || '').slice(0, 400), confidence: String(j?.confidence || '보통').slice(0, 4), changes, proposed, evidence: ev };
}

/** 콘텐츠 1개 확인 → 변경이면 결정 대기 등록 + 알림 */
export async function checkProgram(contentId: string, by = 'cron') {
  const s = await getSettings();
  const db = sbAdmin();
  const { data: c } = await db.from('contents').select('id, slug, topic, research, offer, published_at, post').eq('id', contentId).single();
  if (!c?.research?.program) throw new Error('조사 산출물에 공고(program)가 없습니다');
  const prog = c.research.program;
  const shownDeadline = contentDeadline(c);
  const sources = [prog.url, ...(c.research.facts || []).map((f: any) => f.source_url)].filter((u: any) => /^https?:\/\//.test(String(u || ''))).slice(0, 6);
  const r = await ask<any>({
    system: '정책자금 공고 검증 담당자. 공고 원문(기관 누리집 · 기업마당 bizinfo.go.kr · 정정/변경 공고)을 웹검색으로 확인해 이미 소개한 공고의 일정 · 내용이 바뀌었는지 판정합니다. 추측하지 않고, 근거 링크가 있는 사실만 변경으로 보고합니다. JSON 만 출력합니다.',
    prompt: `오늘: ${todayKST()} (KST)

우리가 숏폼 · 홈페이지에 소개한 공고 (저장된 값):
${JSON.stringify({ name: prog.name, agency: prog.agency, amount: prog.amount, rate: prog.rate, period: prog.period, deadline: prog.deadline, deadline_iso: prog.deadline_iso, status: prog.status, eligibility: prog.eligibility, how_to_apply: prog.how_to_apply, url: prog.url }, null, 1)}
홈페이지에 표시 중인 마감: ${shownDeadline ? new Date(shownDeadline).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '없음(상시)'}
처음 조사할 때 본 출처: ${sources.join(' , ') || '없음'}

할 일: 이 공고의 최신 상태를 확인하세요. 특히 ① 마감 연장 · 조기 마감 · 예산 소진 · 접수 중단 · 취소 ② 접수 기간 · 시작일 변경 ③ 한도 · 금리 · 대상 · 신청 방법 정정 ④ 2차 · 추가 공고.
- changed 는 저장된 값과 다른 사실을 공식 출처(기관 공고 · 정정 공고 · 기업마당 · 정부 보도자료)로 확인했을 때만 true.
- evidence 에는 변경을 보여 주는 실제 페이지 주소(https)와 그 페이지의 핵심 문구(30자 이내)를 넣습니다. 처음 출처와 같은 주소라도 내용이 바뀌었으면 넣습니다.
- proposed 에는 반영할 때 쓸 새 값만 (바뀌지 않은 항목은 비움). 마감일은 deadline_iso(YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm, 한국 시간).
- 확인이 안 되면 status "확인불가", changed false.

JSON:
{ "status": "접수중 | 접수예정 | 마감 | 조기마감 | 취소 | 확인불가", "changed": false, "summary": "결정자가 읽을 한두 문장", "confidence": "높음 | 보통 | 낮음",
  "changes": [{ "field": "deadline | start | period | amount | rate | eligibility | how_to_apply | status | name | agency | other", "label": "", "before": "저장된 값", "after": "확인된 새 값" }],
  "proposed": { "deadline_iso": "", "start_iso": "", "period": "", "deadline": "", "amount": "", "rate": "", "eligibility": [], "how_to_apply": "", "status": "", "url": "" },
  "evidence": [{ "title": "", "url": "https://…", "date": "", "quote": "" }] }`,
    webSearch: true, maxTokens: 3000, chain: s.llm_chain, task: 'program_watch', meta: { contentId, step: 'research' } as any,
  });
  const res = cleanResult(r.data, prog);
  // 마감 · 취소로 확인됐는데 홈페이지는 아직 진행 중이면 그것도 변경
  if (!res.changed && CLOSED.test(res.status) && res.evidence.length && (!shownDeadline || Date.parse(shownDeadline) > Date.now())) {
    res.changed = true;
    res.changes = [{ field: 'status', label: '공고 상태', before: prog.status || '접수중', after: res.status }];
    res.proposed.status = res.status;
  }
  const check = { at: new Date().toISOString(), status: res.status, changed: res.changed, summary: res.summary, by, evidence: res.evidence.length };
  await db.from('contents').update({ program_check: check }).eq('id', contentId);
  if (!res.changed) return { changed: false, status: res.status, summary: res.summary };
  if (!res.evidence.length) return { changed: false, status: res.status, summary: `변경 가능성은 있으나 근거 링크를 찾지 못해 보류 — ${res.summary}` };

  const { data: row, error } = await db.from('program_changes').insert({
    content_id: contentId, program_status: res.status, summary: res.summary, confidence: res.confidence,
    changes: res.changes, evidence: res.evidence, proposed: res.proposed,
  }).select('id').single();
  if (error) throw new Error(`변경 기록 실패: ${error.message} (018 마이그레이션 실행 여부 확인)`);
  await notify('program_change', { contentId, extra: { ...res, program: prog.name, title: c.post?.title || c.topic } });
  return { changed: true, id: row?.id, status: res.status, summary: res.summary };
}

/** 매일: 진행 중 공고 몇 개씩 확인 (비용 · 시간 제한) */
export async function checkPrograms(o: { limit?: number; by?: string } = {}) {
  const s = await getSettings();
  const limit = o.limit ?? Math.max(0, Math.min(10, Number(s.program_watch_daily ?? 3)));
  if (!limit) return { checked: 0, changed: 0, skipped: '설정에서 꺼짐' };
  const targets = await watchTargets(limit);
  let changed = 0;
  const results: any[] = [];
  for (const c of targets) {
    try { const r = await checkProgram(c.id, o.by || 'cron'); if (r.changed) changed++; results.push({ slug: c.slug, ...r }); }
    catch (e: any) { results.push({ slug: c.slug, error: String(e.message).slice(0, 200) }); }
  }
  return { checked: targets.length, changed, results };
}

/** [반영]: 조사 공고 값 · 이벤트 마감 수정 → 홈페이지 오늘의 랜딩 · 진행 중인 정책자금 다시 보냄 */
export async function applyChange(id: number, by: string, note?: string) {
  const db = sbAdmin();
  const { data: ch } = await db.from('program_changes').select('*').eq('id', id).single();
  if (!ch) throw new Error('변경 기록 없음');
  if (ch.status !== 'pending') throw new Error('이미 결정된 변경입니다');
  const { data: c } = await db.from('contents').select('id, research, offer').eq('id', ch.content_id).single();
  if (!c) throw new Error('콘텐츠 없음');
  const pr = ch.proposed || {};
  const program = { ...(c.research?.program || {}) };
  for (const [k, v] of Object.entries(pr)) if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) (program as any)[k === 'eligibility' ? 'eligibility' : k] = v;
  const history = [...(program.changes || []), ...(ch.evidence || []).slice(0, 2).map((e: any) => ({ what: ch.summary, url: e.url, date: e.date || new Date().toISOString().slice(0, 10) }))].slice(-6);
  program.changes = history;
  const offer = { ...(c.offer || {}) };
  // 마감 · 취소 → 지금 마감(홈페이지 랜딩 즉시 종료) / 새 마감일 → 카운트다운도 새 날짜로
  let deadline: string | null = isoKst(pr.deadline_iso) || (pr.deadline ? parseDeadline(pr.deadline) : null);
  if (CLOSED.test(String(pr.status || ch.program_status || ''))) deadline = new Date().toISOString();
  if (deadline) {
    const kst = new Date(Date.parse(deadline) + 9 * 3600e3).toISOString().slice(0, 16);
    offer.deadline_iso = kst;
    program.deadline_iso = kst;
  }
  await db.from('contents').update({ research: { ...c.research, program }, offer }).eq('id', c.id);
  const s = await getSettings();
  let applied: any = { program: true };
  if (tpfConfig(s).api) {
    try { applied.site = await publishLanding(c.id); } catch (e: any) { applied.site_error = e.message; }
  }
  await db.from('program_changes').update({ status: 'applied', decided_by: by, decided_at: new Date().toISOString(), note: note || null, applied }).eq('id', id);
  return applied;
}

export async function dismissChange(id: number, by: string, note?: string) {
  const { error } = await sbAdmin().from('program_changes').update({ status: 'dismissed', decided_by: by, decided_at: new Date().toISOString(), note: note || null }).eq('id', id).eq('status', 'pending');
  if (error) throw new Error(error.message);
  return { ok: true };
}
