import { siteUrl } from './secrets';
import { StopError, watchStep } from './stop';
import { limitsOf } from './limits';
import { NEWS_ROLE_LAYOUT, NEWS_ROLES } from './motion-guide';
import { markUsed, referenceBlock } from './references';
import { ask, type Usage } from './llm';
import { USER, buildSystem, reviewPrompt } from './prompts';
import { sbAdmin } from './supabase/server';
import { logUsage } from './usage';
import { charLen, parseSlots, validate } from './landing';
import { caseValues, casePositions, isCaseKey, rankCases, type CaseField, type LandingCase } from './cases';
import { styleFor, type StyleRow } from './styles';
import { applyStyle, cleanLayers } from './video-style';
import { getSop, type Sop } from './sop';
import { getOutput, getSettings } from './settings';
import { notify } from './notify';
import { fewShotBlock, judgeCandidates, learnCounts, recordEditExemplar } from './learn';
import { exportNow, exportRun } from './export';
import { recordSopUse, sopHash } from './sop';
import { editorialBrief, noveltyChecks } from './editorial';
import { siteLinks } from './tpf-site';
import { isoKst, parseDeadline } from './deadline';
export { getOutput, getSettings };
import { STEP_DEFS, STEP_KEYS, downstream, stepDef, type StepKey } from './steps';
import type { Settings, StepRow } from './types';

type Check = { level: 'error' | 'warn' | 'ok'; msg: string };

export function landingLink(s: Settings, slug: string, source: 'youtube' | 'instagram' | 'blog') {
  const medium = source === 'youtube' ? 'shorts' : source === 'instagram' ? 'reels' : 'post';
  return `${siteUrl(s)}/l/${slug}?utm_source=${source}&utm_medium=${medium}&utm_campaign=${slug}`;
}

/** 오늘 날짜 기반 slug: 2026-11-12-a1b2 */
export function newSlug() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  return `${d}-${Math.random().toString(36).slice(2, 6)}`;
}

async function log(contentId: string, step: string, status: string, message?: string) {
  await sbAdmin().from('jobs').insert({ content_id: contentId, step, status, message });
}

const charsNoSpace = (s: string) => (s || '').replace(/\s/g, '').length;
const now = () => new Date().toISOString();
const add = (a: Usage, b: Usage) => ({ input: a.input + b.input, output: a.output + b.output });

// ── 단계 행 ─────────────────────────────────────────────────────────
export async function ensureSteps(contentId: string): Promise<Record<StepKey, StepRow>> {
  const db = sbAdmin();
  await db.from('steps').upsert(STEP_KEYS.map((step) => ({ content_id: contentId, step })), { onConflict: 'content_id,step', ignoreDuplicates: true });
  const { data } = await db.from('steps').select('*').eq('content_id', contentId);
  return Object.fromEntries((data || []).map((r: any) => [r.step, r])) as any;
}

/** 이 단계에서 쓴 API 비용 합계 (후보·채점·글자수 축약·AI 검수·렌더·업로드 전부 = 사용 기록부 기준) */
export async function stepCost(contentId: string, step: string): Promise<number> {
  const { data } = await sbAdmin().from('usage_log').select('cost_usd').eq('content_id', contentId).eq('step', step);
  return Math.round((data || []).reduce((n: number, r: any) => n + Number(r.cost_usd || 0), 0) * 1e6) / 1e6;
}

async function setStep(contentId: string, step: StepKey, patch: Record<string, any>) {
  const { error } = await sbAdmin().from('steps').update(patch).eq('content_id', contentId).eq('step', step);
  if (error) throw new Error(error.message);
}

/** 현황판용: 첫 미승인 단계를 contents.current_step 에 기록 */
export async function syncCurrent(contentId: string) {
  const rows = await ensureSteps(contentId);
  const cur = STEP_KEYS.find((k) => rows[k]?.state !== 'approved') || 'done';
  await sbAdmin().from('contents').update({ current_step: cur }).eq('id', contentId);
  return cur;
}

/** 상위 산출물이 바뀌면 그것을 읽는 하위 단계를 '재작업 필요'로 */
async function markStale(contentId: string, step: StepKey) {
  const ds = downstream(step);
  if (!ds.length) return;
  await sbAdmin().from('steps').update({ state: 'stale', decided_by: null, decided_at: null })
    .eq('content_id', contentId).in('step', ds).in('state', ['approved', 'review', 'rejected']);
}

// ── 산출물 읽기/쓰기 ────────────────────────────────────────────────
// ── 코드 규칙 검사 (md 로 바뀌지 않는 기계 규칙) ─────────────────────
export function lint(step: StepKey, out: any, c: any, s: Settings, extra: { slots?: any[] } = {}): Check[] {
  const r: Check[] = [];
  const err = (msg: string) => r.push({ level: 'error', msg });
  const warn = (msg: string) => r.push({ level: 'warn', msg });
  const text = JSON.stringify(out ?? '');
  for (const b of s.banned_phrases || []) if (b && text.includes(b)) err(`금지 표현 포함: "${b}"`);

  if (step === 'research') {
    const facts = out?.facts || [];
    if (facts.length < 3) warn(`근거 fact ${facts.length}개 (3개 이상 권장)`);
    const noSrc = facts.filter((f: any) => !/^https?:\/\//.test(f.source_url || '')).length;
    if (noSrc) err(`출처 URL 없는 fact ${noSrc}개`);
    if (!out?.program?.deadline) warn('접수 마감/기간이 비어 있음');
    // 지난 공고 차단: 마감이 이미 지났거나 상태가 마감 · 취소면 승인 불가
    const pg = out?.program || {};
    const dl = isoKst(pg.deadline_iso) || parseDeadline(pg.deadline);
    if (dl && Date.parse(dl) < Date.now()) err(`이미 접수가 끝난 공고 (마감 ${String(pg.deadline_iso || pg.deadline)}) — 진행 중 · 예정 공고로 다시 조사`);
    if (/마감|종료|취소|소진/.test(String(pg.status || ''))) err(`공고 상태가 '${pg.status}' — 진행 중 · 예정 공고만 다룹니다`);
    if (!/^https?:\/\//.test(String(pg.url || ''))) warn('공고 원문 주소(program.url) 없음 — 마감 · 변경 확인이 어려움');
    const pastCands = (out?.candidates || []).filter((x: any) => { const d = isoKst(x.deadline_iso); return d && Date.parse(d) < Date.now(); }).length;
    if (pastCands) warn(`후보 중 마감 지난 공고 ${pastCands}개`);
  }
  if (step === 'plan') {
    const st = out?.structure || [];
    const sum = st.reduce((n: number, x: any) => n + Number(x.seconds || 0), 0);
    if (sum < 36 || sum > 44) warn(`장면 합계 ${sum}초 (38~42 권장)`);
    const last = st[st.length - 1]?.role;
    if (st.length && last !== 'apply' && last !== 'cta') err('마지막 장면이 apply(신청 안내)가 아님');
    if (st.length && !['breaking', 'article', 'hook'].includes(st[0].role)) warn(`첫 장면 role 이 ${st[0].role} — 뉴스 브리핑은 breaking(속보) 또는 article 로 시작`);
    if (st.length < 5 || st.length > 9) warn(`장면 ${st.length}개 (6~9 권장)`);
  }
  if (step === 'script') {
    const sc = out?.scenes || [];
    const total = sc.reduce((n: number, x: any) => n + charsNoSpace(x.narration), 0);
    if (total < 195 || total > 265) err(`내레이션 ${total}자 (210~250자 필요)`);
    else if (total < 210 || total > 250) warn(`내레이션 ${total}자 (210~250 권장)`);
    const long = sc.flatMap((x: any) => x.captions || []).filter((t: string) => charLen(t) > 18).length;
    if (long) warn(`18자 넘는 자막 ${long}줄 (하단 자막 한 줄 18자 이내)`);
    const many = sc.filter((x: any) => (x.captions || []).length > 2).map((x: any) => x.id);
    if (many.length) warn(`자막이 3줄 이상인 장면: ${many.join(', ')} (뉴스 하단 자막은 장면당 1~2줄)`);
    const noRole = sc.filter((x: any) => !NEWS_ROLES.includes(x.role)).map((x: any) => x.id);
    if (noRole.length) warn(`role 이 없거나 뉴스 흐름에 없는 장면: ${noRole.join(', ')}`);
    const planIds = (c.plan?.structure || []).map((x: any) => x.id).join(',');
    if (planIds && planIds !== sc.map((x: any) => x.id).join(',')) warn('장면 id 가 기획과 다름');
  }
  if (step === 'offer') {
    if (!out?.event_name) err('이벤트명이 비어 있음');
    if (out?.deadline_label && !out?.deadline_source) err('마감 문구에 근거(deadline_source)가 없음');
    if (!/심사/.test(out?.disclaimer || '')) warn('유의 문구에 "심사" 안내가 없음');
    if (charLen(out?.cta || '') > 14) warn('버튼 문구 14자 초과');
    // 홈페이지 오늘의 랜딩 카운트다운 = 이 마감일 (지나면 홈페이지에서 자동으로 숨김)
    const dl = isoKst(out?.deadline_iso) || isoKst(c.research?.program?.deadline_iso) || parseDeadline(c.research?.program?.deadline);
    if (!dl) warn('마감일(deadline_iso) 없음 — 홈페이지 랜딩에 카운트다운 없이 21일 노출');
    else if (Date.parse(dl) < Date.now()) err('마감일이 이미 지남 — 홈페이지 랜딩이 바로 마감 처리됩니다');
  }
  if (step === 'landing') {
    const all = extra.slots || [];
    const slots = all.filter((x: any) => !isCaseKey(x.key));
    const over = validate(slots, out || {});
    for (const o of over) err(`슬롯 ${o.key}: ${o.len}/${o.max}자 초과`);
    for (const o of validate(all.filter((x: any) => isCaseKey(x.key)), out || {})) warn(`후기 ${o.key}: 원문 ${o.len}/${o.max}자 — 카드에서 넘칠 수 있음 (사례 원문은 자르지 않음)`);
    if (all.some((x: any) => isCaseKey(x.key)) && !all.filter((x: any) => isCaseKey(x.key)).some((x: any) => (out || {})[x.key])) warn('실제 사례 목록이 비어 후기 카드는 템플릿 기본 후기 그대로입니다 — [실제 사례]에 등록하세요');
    const empty = slots.filter((x) => !(out || {})[x.key] && !/^\(선택\)/.test(x.label)).length;
    if (empty) err(`비어 있는 슬롯 ${empty}개`);
    const thin = slots.filter((x) => x.max && (out || {})[x.key] && charLen(out[x.key]) < x.max * 0.4).length;
    if (thin) warn(`최대 글자수의 40% 미만인 슬롯 ${thin}개 (레이아웃이 빌 수 있음)`);
  }
  if (step === 'design') {
    const ids = (c.script?.scenes || []).map((x: any) => x.id);
    const got = (out?.scenes || []).map((x: any) => x.id);
    const miss = ids.filter((i: string) => !got.includes(i));
    if (miss.length) err(`디자인 없는 장면: ${miss.join(', ')}`);
    const news = out?.template === 'news';
    for (const x of out?.scenes || []) {
      const lines = String(x.headline || '').split('\n');
      const maxLine = ['breaking', 'headline', 'cta', 'quote', 'hook'].includes(x.layout) ? 11 : 16;
      if (lines.some((l: string) => charLen(l) > maxLine)) warn(`${x.id}: 제목 한 줄이 ${maxLine}자를 넘음 (화면에서 줄이 밀림)`);
      if (lines.length > 3) warn(`${x.id}: 제목이 3줄 넘음`);
      if (x.layout === 'stat' && !/\d/.test(x.value || '')) warn(`${x.id}: stat 장면에 숫자 value 없음`);
      if (news && x.layout === 'stat' && !x.source) warn(`${x.id}: 숫자 장면에 출처(source) 없음 — 언론사 톤은 출처 표기`);
      if (news && /\p{Extended_Pictographic}/u.test(`${x.headline}${x.sub || ''}${(x.items || []).join('')}`)) warn(`${x.id}: 이모지 사용 (언론사 톤에 맞지 않음)`);
      for (const l of x.layers || []) if (l.y < 240 || l.y > 1420) warn(`${x.id}/${l.id}: 레이어가 안전 영역 밖 (y ${l.y}) — 채널 표시·자막·쇼츠 버튼과 겹칠 수 있음`);
      if (['compare'].includes(x.layout) && (x.items || []).length !== 2) warn(`${x.id}: compare 는 items 2개`);
    }
  }
  if (step === 'copy') {
    const y = out?.youtube || {}; const i = out?.instagram || {};
    if (charLen(y.title || '') > 100) err('유튜브 제목 100자 초과'); else if (charLen(y.title || '') > 45) warn('유튜브 제목 40자 초과');
    if (!/https?:\/\//.test(y.comment || '')) err('유튜브 댓글에 링크 없음');
    if (!/https?:\/\//.test(i.caption || '')) err('인스타 캡션에 링크 없음');
    if (siteLinks(s, c) && !/go\.html\?c=/.test(`${y.description || ''}${i.caption || ''}`)) warn('홈페이지 추적 링크(go.html?c=코드)가 없음 — 이 숏폼의 DB가 집계되지 않습니다');
    if (charLen(i.caption || '') > 2200) err('인스타 캡션 2,200자 초과');
    if (((i.caption || '').match(/#/g) || []).length > 30) err('해시태그 30개 초과');
  }
  if (step === 'post') {
    const n = charLen(out?.body_markdown || '');
    if (n < 1500) warn(`본문 ${n}자 (2,000자 이상 권장)`);
    if (charLen(out?.title || '') > 36) warn('제목 32자 초과');
    const md = charLen(out?.meta_description || '');
    if (md < 60 || md > 140) warn(`메타 설명 ${md}자 (80~120 권장)`);
    if (!/\|.*\|/.test(out?.body_markdown || '')) warn('표가 없음');
    // 홈페이지 정보글 목차(TOC)는 ## 소제목으로 만들어짐 → 검색 노출 구조
    const h2 = (String(out?.body_markdown || '').match(/^##\s+\S/gm) || []).length;
    if (h2 < 3) warn(`## 소제목 ${h2}개 (목차용 3개 이상 권장)`);
    if (!String(out?.body_markdown || '').includes('{LINK}')) warn('본문에 {LINK}(신청 안내) 없음');
    if ((out?.faq || []).length < 3) warn(`FAQ ${(out?.faq || []).length}개 (3~5개 권장 · 검색 FAQ 구조화 데이터)`);
    if ((out?.keywords || []).length < 3) warn('키워드 3개 미만');
  }
  if (!r.length) r.push({ level: 'ok', msg: '규칙 검사 통과' });
  return r;
}
const hasError = (c: Check[]) => c.some((x) => x.level === 'error');

// ── 생성: 준비(prepare) → LLM 또는 에이전트 → 마무리(finalize) ─────────
type Prep = { system: string; prompt: string; webSearch: boolean; maxTokens: number; slots?: any[]; tpl?: any; refs?: number[]; refVideos?: number[]; cases?: LandingCase[]; casePos?: Record<number, CaseField[]>; style?: StyleRow; assets?: { id: number; kind: string; url: string; name?: string; note?: string }[]; images?: string[] };
type Gen = { output: any; notes: any; usage: Usage; slots?: any[]; provider?: string; model?: string; tried?: any[]; input?: { system: string; prompt: string }; candidates?: number; pred_score?: number | null; judge?: any; refs?: number[] };

/** 이 단계에서 모델(또는 에이전트)이 받을 지시문 전체 */
async function prepare(step: StepKey, c: any, s: Settings, sop: Sop, feedback?: string | null, attach?: number[]): Promise<Prep> {
  const db = sbAdmin();
  const prev = feedback ? await getOutput(step, c) : undefined;
  const ctx: any = { s, c, prev, feedback };
  const prep: Prep = { system: '', prompt: '', webSearch: step === 'research', maxTokens: step === 'post' ? 10000 : 8000 };

  if (step === 'research') {
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const { data } = await db.from('contents').select('topic').gte('created_at', since).neq('id', c.id).not('topic', 'is', null).limit(30);
    ctx.recentTopics = (data || []).map((x: any) => x.topic);
  }
  if (step === 'landing') {
    const { data: tpl } = await db.from('landing_templates').select('*').eq('is_active', true).maybeSingle();
    if (!tpl) throw new Error('활성 랜딩 템플릿이 없습니다. [랜딩 템플릿] 메뉴에서 등록하세요.');
    prep.tpl = tpl;
    prep.slots = parseSlots(tpl.html);
    // 후기 카드(case{n}_*)는 AI 가 쓰지 않음 → 문구 슬롯만 넘기고, 사례는 목록에서 "고르기"만
    ctx.slots = prep.slots.filter((x: any) => !isCaseKey(x.key));
    const pos = casePositions(prep.slots);
    if (Object.keys(pos).length) {
      const { data: all } = await db.from('landing_cases').select('*').eq('active', true).order('id');
      const list = (all || []) as LandingCase[];
      // 확인 완료(verified) 사례가 있으면 그것만 사용
      prep.cases = ctx.cases = list.some((x) => x.verified) ? list.filter((x) => x.verified) : list;
      prep.casePos = pos;
      ctx.casePositions = Object.keys(pos).length;
    }
  }
  if (step === 'design') prep.style = ctx.style = await styleFor(c);
  // 첨부 파일: 기획·대사·디자인은 전체 목록(자료화면 후보), 피드백에 붙인 이미지는 AI 가 직접 봄(비전)
  try {
    const { data: rows } = await db.from('content_assets').select('id, kind, url, name, note, step').eq('content_id', c.id).order('created_at');
    const all = (rows || []) as any[];
    if (['plan', 'script', 'design'].includes(step)) prep.assets = ctx.assets = all;
    const att = all.filter((a) => attach?.includes(a.id));
    if (att.length && feedback) {
      prep.images = att.filter((a) => a.kind === 'image').map((a) => a.url).slice(0, 8);
      ctx.feedback = `${feedback}\n\n[피드백 첨부] ${att.map((a) => `${a.kind === 'video' ? '영상' : '이미지'} #${a.id} ${a.name || ''}${a.note ? ` (${a.note})` : ''}`).join(' · ')}`
        + (prep.images.length ? '\n첨부 이미지는 함께 보낸 그림입니다 — 지시에서 가리키는 부분(색·배치·문구·느낌)을 그대로 반영하세요.' : '')
        + (att.some((a) => a.kind === 'video') ? `\n첨부 영상은 ${step === 'design' ? '해당 장면 media 로 넣으세요(url 은 첨부 목록 참고)' : '자료화면(footage 장면) 후보입니다'}.` : '');
    }
  } catch { /* 첨부 테이블 없음(마이그레이션 전) */ }
  if (step === 'research' || step === 'plan') { try { ctx.brief = await editorialBrief(c, step); } catch { /* 편성 없음 */ } }
  prep.system = buildSystem(s, step, sop);
  prep.prompt = USER[step](ctx);
  // 점수 기반 최적화 ①: 운영자가 높은 점수를 준 예시와 낮은 점수 이유를 참고로 주입
  try {
    const fs = await fewShotBlock(step, c.id, s);
    prep.prompt += fs.text;
    prep.refs = fs.ids;
  } catch { /* 예시 없음 */ }
  // 참고 영상 학습: "이 영상처럼 만들기" 콘텐츠면 그 영상, 아니면 학습에 켠 참고 영상들의 재현 규칙
  try {
    const rb = await referenceBlock(step, c);
    if (rb.text) { prep.prompt += rb.text; prep.refVideos = rb.ids; }
  } catch { /* 참고 영상 없음 */ }
  return prep;
}

/** 모델/에이전트가 낸 JSON을 후처리해 저장 */
async function finalize(step: StepKey, c: any, s: Settings, raw: any, prep: Prep): Promise<Gen> {
  const db = sbAdmin();
  let usage: Usage = { input: 0, output: 0 };
  if (!raw || typeof raw !== 'object') throw new Error('산출물이 JSON 객체가 아닙니다');
  let out = { ...raw };
  const notes = out._ai ?? null;
  delete out._ai;

  if (step === 'script') {
    out.total_chars = (out.scenes || []).reduce((n: number, x: any) => n + charsNoSpace(x.narration), 0);
  }
  if (step === 'design') {
    // 스타일 프리셋(색·폰트·굵기·자막·화면 장식)을 그대로 적용 — AI 는 장면 구성·문구·레이어만
    const st = prep.style || (await styleFor(c));
    const { caption_label, ticker, ...rest } = out;
    // 대본의 role·on_screen 으로 빈 레이아웃·문구를 채우고, 첨부 번호(media_id)를 실제 파일 주소로
    const byId = new Map((c.script?.scenes || []).map((x: any) => [x.id, x]));
    const assets: any[] = prep.assets || [];
    const mediaOf = (m: any, os: any) => {
      const pick = (id: any) => assets.find((a) => a.id === Number(id));
      if (m && typeof m === 'object' && m.url) return { kind: /\.(mp4|mov|webm|m4v)(\?|$)/i.test(m.url) ? 'video' : m.kind || 'image', fit: 'cover', ...m };
      const a = pick(typeof m === 'number' || /^\d+$/.test(String(m || '')) ? m : os?.media_id);
      return a ? { url: a.url, kind: a.kind, fit: 'cover', label: '자료화면' } : undefined;
    };
    out = { ...rest, scenes: (out.scenes || []).map((x: any) => {
      const sc: any = byId.get(x.id) || {};
      const os = sc.on_screen || {};
      const y: any = { ...x, layers: cleanLayers(x.layers) };
      if (!y.layout && NEWS_ROLE_LAYOUT[sc.role]) y.layout = NEWS_ROLE_LAYOUT[sc.role];
      for (const k of ['tag', 'kicker', 'headline', 'sub', 'value', 'unit', 'cta', 'source']) if (!y[k] && os[k]) y[k] = os[k];
      if ((!y.items || !y.items.length) && Array.isArray(os.items) && os.items.length) y.items = os.items;
      const media = mediaOf(y.media, os);
      if (media) y.media = media; else delete y.media;
      if (y.layout === 'footage' && !y.media) y.layout = 'headline'; // 첨부 영상이 없으면 자료화면 대신 기사 카드
      return y;
    }) };
    out = applyStyle(out, st.style);
    out.style_key = st.key;
    if (st.style.caption.label && typeof caption_label === 'string' && caption_label.trim()) out.caption.label = caption_label.trim().slice(0, 12);
    if (st.style.chrome.ticker && typeof ticker === 'string' && ticker.trim()) out.chrome.tickerText = ticker.trim().slice(0, 60);
    if (c.design?.size) out.size = c.design.size; // 편집기에서 바꾼 영상 크기 유지
  }
  if (step === 'copy') {
    // 홈페이지 연동(설정 tpf_site_url)이 있으면 자리마다 다른 추적 링크 — 어느 숏폼 · 어느 자리에서 신청이 났는지 홈페이지 관리자에서 집계
    //   유튜브 설명 ch=yt · 고정 댓글 ytc · 인스타 캡션 ig · 첫 댓글 igc (코드 = contents.track_code)
    const t = siteLinks(s, c);
    const yt = t?.yt ?? landingLink(s, c.slug, 'youtube');
    const ytc = t?.ytc ?? yt;
    const ig = t?.ig ?? landingLink(s, c.slug, 'instagram');
    const igc = t?.igc ?? ig;
    const r = (x: string, link: string) => (x || '').split('{LINK}').join(link);
    out = {
      youtube: { ...out.youtube, description: r(out.youtube?.description, yt), comment: r(out.youtube?.comment, ytc), link: yt },
      instagram: { ...out.instagram, caption: r(out.instagram?.caption, ig), first_comment: r(out.instagram?.first_comment, igc), link: ig, ...(t ? { profile_link: t.profile } : {}) },
      ...(t ? { track_code: t.code } : {}),
    };
  }
  // post: {LINK} 는 그대로 둔다 — 홈페이지 정보글에서는 같은 페이지 하단 신청폼(#fundForm), 공장 /policy 페이지에서는 공장 랜딩으로 바뀜

  if (step === 'landing') {
    const slots = prep.slots || [];
    let values: Record<string, string> = { ...(out.values || out) };
    delete (values as any).cases;
    // 홈페이지 '오늘의 랜딩' 틀용 글 (슬롯과 별개)
    const site = out.site && typeof out.site === 'object' ? {
      badge: String(out.site.badge || '').slice(0, 30), headline: String(out.site.headline || '').slice(0, 90),
      sub: String(out.site.sub || '').slice(0, 160), points: (Array.isArray(out.site.points) ? out.site.points : []).map((x: any) => String(x || '').slice(0, 90)).filter(Boolean).slice(0, 5),
    } : null;
    delete (values as any).site;
    // AI 가 후기 칸을 직접 썼어도 버림 — 실제 사례 원문으로만 채움
    for (const k of Object.keys(values)) if (isCaseKey(k)) delete values[k];
    let caseIds: number[] = [];
    if (prep.casePos && prep.cases?.length) {
      const positions = Object.keys(prep.casePos).map(Number).sort((a, b) => a - b);
      const byId = new Map(prep.cases.map((x) => [Number(x.id), x]));
      const picked = [...new Set(((out.cases || []) as any[]).map(Number))].filter((id) => byId.has(id));
      // 고른 게 모자라면 오늘 주제와 겹치는 사례로 채움
      const topicText = [c.topic, JSON.stringify(c.research || {}).slice(0, 3000), JSON.stringify(c.plan || {}).slice(0, 1500)].join(' ');
      for (const x of rankCases(prep.cases, topicText)) { if (picked.length >= positions.length) break; if (!picked.includes(Number(x.id))) picked.push(Number(x.id)); }
      caseIds = picked.slice(0, positions.length);
      caseIds.forEach((id, i) => Object.assign(values, caseValues(byId.get(id)!, positions[i], prep.casePos![positions[i]])));
    }
    const over = validate(slots.filter((x: any) => !isCaseKey(x.key)), values);
    if (over.length) {
      try { // 글자수 초과분만 자동 축약 (서버 제공자가 없으면 건너뛰고 규칙 검사에서 오류로 표시)
        const fix = await ask<{ values: Record<string, string> }>({
          system: '당신은 카피 편집자입니다. 의미를 유지하면서 글자수(공백 포함, \\n 제외)를 줄입니다.',
          prompt: `다음 문구를 각 최대 글자수 이하로 줄이세요.\n${over.map((o) => `- ${o.key} (최대 ${o.max}자): "${o.value}"`).join('\n')}\nJSON: { "values": { "key": "문구" } }`,
          chain: s.llm_chain, task: 'fix', meta: { contentId: c.id, step: 'landing' },
        });
        usage = add(usage, fix.usage);
        values = { ...values, ...fix.data.values };
      } catch { /* 규칙 검사에 맡김 */ }
    }
    const lvRow = { content_id: c.id, template_id: prep.tpl.id, slug: c.slug, values, warnings: validate(slots, values), case_ids: caseIds };
    const lv = await db.from('landing_variants').upsert({ ...lvRow, ...(site ? { site } : {}) }, { onConflict: 'content_id' });
    // 017 마이그레이션 전이면 site 칸 없이 저장 (홈페이지 랜딩은 이벤트 · 조사로 채움)
    if (lv.error && /site/.test(lv.error.message)) await db.from('landing_variants').upsert(lvRow, { onConflict: 'content_id' });
    if (caseIds.length) {
      for (const id of caseIds) {
        const x = prep.cases!.find((y) => Number(y.id) === id);
        await db.from('landing_cases').update({ used_count: Number(x?.used_count || 0) + 1 }).eq('id', id);
      }
    }
    return { output: values, notes, usage, slots };
  }

  const patch: any = { [stepDef(step).field!]: out, error: null };
  if (step === 'research' && !c.topic) patch.topic = out.topic;
  await db.from('contents').update(patch).eq('id', c.id);
  return { output: out, notes, usage };
}

async function generate(step: StepKey, c: any, s: Settings, sop: Sop, feedback?: string | null, prefer?: string | null, attach?: number[]): Promise<Gen> {
  const prep = await prepare(step, c, s, sop, feedback, attach);
  const req = {
    system: prep.system, prompt: prep.prompt, webSearch: prep.webSearch, maxTokens: prep.maxTokens, images: prep.images,
    mcp: step === 'research' ? s.mcp_servers : undefined,
    chain: s.llm_chain, prefer: prefer || sop.provider, task: step, meta: { contentId: c.id, step },
  };
  // 점수 기반 최적화 ②: 후보 N개(SOP 의 best_of) → 운영자 채점 기준으로 점수 예측 → 최고 선택
  const n = Math.max(1, Math.min(4, Number(sop.best_of || 1)));
  const settled = await Promise.allSettled(Array.from({ length: n }, () => ask<any>(req)));
  const ok = settled.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw (settled[0] as PromiseRejectedResult).reason;
  let usage = ok.reduce((u: Usage, r: any) => add(u, r.usage), { input: 0, output: 0 });
  let pick = 0;
  let judge: any = null;
  if (ok.length > 1) {
    try {
      judge = await judgeCandidates(step, ok.map((r: any) => { const d = { ...r.data }; delete d._ai; return d; }), s, sop.content, { contentId: c.id, step });
      usage = add(usage, judge.usage);
      pick = judge.best;
    } catch { /* 채점 실패 → 첫 후보 */ }
  }
  const res = ok[pick];
  const gen = await finalize(step, c, s, res.data, prep);
  if (prep.refVideos?.length) markUsed(prep.refVideos).catch(() => {});
  const pred = judge?.scores?.find((x: any) => x.i === pick)?.score ?? null;
  return {
    ...gen, usage: add(gen.usage, usage), provider: res.provider, model: res.model, tried: res.tried,
    input: { system: prep.system, prompt: prep.prompt }, candidates: ok.length, pred_score: pred,
    judge: judge ? { best: pick, scores: judge.scores } : null, refs: prep.refs,
  };
}

// ── AI 검수 ─────────────────────────────────────────────────────────
async function review(step: StepKey, c: any, s: Settings, sop: Sop, output: any, checks: Check[]) {
  const inputs = Object.fromEntries(await Promise.all(stepDef(step).deps.map(async (d) => [d, await getOutput(d, c)])));
  if (step === 'offer') (inputs as any).available_offers = s.offers;
  const res = await ask<any>({ ...reviewPrompt(s, step, sop, inputs, output, checks), maxTokens: 4000, chain: s.llm_chain, task: 'review', meta: { contentId: c.id, step } });
  if (hasError(checks)) res.data.verdict = 'revise';
  return res;
}

async function loadContent(contentId: string) {
  const { data: c, error } = await sbAdmin().from('contents').select('*').eq('id', contentId).single();
  if (error || !c) throw new Error('콘텐츠를 찾을 수 없습니다');
  return c;
}

async function slotsFor(contentId: string) {
  const { data } = await sbAdmin().from('landing_variants').select('landing_templates(html)').eq('content_id', contentId).maybeSingle();
  const html = (data as any)?.landing_templates?.html;
  return html ? parseSlots(html) : [];
}

function depsBlocked(step: StepKey, rows: Record<string, StepRow>) {
  return stepDef(step).deps.filter((d) => rows[d]?.state !== 'approved');
}

/** 규칙 검사 → 결정 방식(게이트) 적용 → 단계 행 기록 → 하위 단계 무효화 */
async function settle(step: StepKey, contentId: string, row: StepRow, s: Settings, sop: Sop, gen: Gen, t0: number, regen?: (fb: string) => Promise<Gen>, beforeSave?: () => Promise<void>) {
  let c = await loadContent(contentId);
  let usage = gen.usage;
  let checks = lint(step, gen.output, c, s, { slots: gen.slots });
  try { const nv = await noveltyChecks(step, gen.output, c); if (nv.length) checks = [...checks.filter((x) => x.level !== 'ok'), ...nv]; } catch { /* 무시 */ }
  let aiReview: any = null;
  let state: StepRow['state'] = 'review';
  let decidedBy: string | null = null;
  let extra = 0;

  if (sop.gate === 'auto') {
    if (!hasError(checks)) { state = 'approved'; decidedBy = 'auto'; }
  } else if (sop.gate === 'ai') {
    try {
      let rv = await review(step, c, s, sop, gen.output, checks);
      usage = add(usage, rv.usage);
      if (rv.data.verdict !== 'pass' && rv.data.feedback && regen) {
        gen = await regen(rv.data.feedback); // 미달 → AI 피드백 반영 1회 재작업 후 재검수
        usage = add(usage, gen.usage);
        extra = 1;
        c = await loadContent(contentId);
        checks = lint(step, gen.output, c, s, { slots: gen.slots });
        rv = await review(step, c, s, sop, gen.output, checks);
        usage = add(usage, rv.usage);
      }
      aiReview = rv.data;
      if (rv.data.verdict === 'pass') { state = 'approved'; decidedBy = 'ai'; }
    } catch (e: any) {
      checks = [...checks, { level: 'warn', msg: `AI 검수를 실행하지 못해 사람 검수로 넘김: ${String(e.message).slice(0, 120)}` }];
    }
  }
  if (gen.tried?.length) checks = [...checks, { level: 'warn', msg: `제공자 전환: ${gen.tried.map((t: any) => `${t.provider} 실패`).join(' → ')} → ${gen.provider} 사용` }];

  if (beforeSave) await beforeSave(); // 중지·시간 초과됐으면 저장하지 않음
  const t = now();
  await setStep(contentId, step, {
    state, decided_by: decidedBy, decided_at: decidedBy ? t : null,
    decision_note: decidedBy === 'ai' ? aiReview?.summary ?? null : null,
    ai_notes: gen.judge ? { ...(gen.notes || {}), judge: gen.judge } : gen.notes, ai_review: aiReview, checks, feedback: null, finished_at: t, ai_output: gen.output ?? null,
    provider: gen.provider ?? null, model: gen.model ?? null, effort: gen.model?.split(' · ')[1] ?? null,
    cost_usd: await stepCost(contentId, step),
    ai_input: gen.input ?? null, sop_hash: sopHash(sop.content), freedom: sop.freedom, candidates: gen.candidates ?? 1, refs: gen.refs ?? null,
    pred_score: gen.pred_score ?? (aiReview?.score != null ? Math.round((Number(aiReview.score) / 20) * 10) / 10 : null),
    attempts: row.attempts + 1 + extra,
    work_ms: Number(row.work_ms) + (Date.now() - t0),
    input_tokens: Number(row.input_tokens) + usage.input,
    output_tokens: Number(row.output_tokens) + usage.output,
  });
  await markStale(contentId, step);
  await syncCurrent(contentId);
  await log(contentId, step, 'done', `${gen.provider || '-'} · ${state === 'approved' ? `승인(${decidedBy})` : '검수 대기'}`);
  await notify(state === 'approved' ? 'step_done' : 'step_review', { contentId, step });
  await exportNow(() => exportRun(contentId, step));
  return { step, state, decided_by: decidedBy, provider: gen.provider, model: gen.model, checks, ai_review: aiReview };
}

// ── 단계 실행 (서버 LLM 체인) ───────────────────────────────────────
export async function runStep(step: StepKey, contentId: string, opts: { feedback?: string; force?: boolean; provider?: string; attachments?: number[] } = {}) {
  const def = stepDef(step);
  if (!def || def.kind !== 'ai') throw new Error(`'${step}' 는 AI 단계가 아닙니다 (렌더·업로드는 워커가 실행)`);
  const c = await loadContent(contentId);
  const rows = await ensureSteps(contentId);
  const blocked = depsBlocked(step, rows);
  if (blocked.length && !opts.force) throw new Error(`상위 단계 승인이 필요합니다: ${blocked.map((d) => stepDef(d).label).join(', ')}`);

  const [s, sop] = await Promise.all([getSettings(), getSop(step)]);
  const row = rows[step];
  const feedback = opts.feedback || row.feedback || null;
  const t0 = Date.now();
  const startedAt = now();
  await setStep(contentId, step, { state: 'running', started_at: startedAt, attempts: row.attempts + 1, ai_review: null });
  await log(contentId, step, 'running', feedback ? `피드백 반영: ${feedback.slice(0, 80)}` : undefined);
  // 감시: [중지]를 누르거나 제한 시간이 지나면 기다리지 않고 바로 멈춤 (늦게 온 결과는 버림)
  const limit = limitsOf(s).step_timeout_sec;
  const w = watchStep(contentId, step, startedAt, limit);
  const race = <T,>(p: Promise<T>) => Promise.race([p, w.promise]) as Promise<T>;

  try {
    const gen = await race(generate(step, c, s, sop, feedback, opts.provider, opts.attachments));
    const res = await race(settle(step, contentId, row, s, sop, gen, t0,
      async (fb) => race(generate(step, await loadContent(contentId), s, sop, fb, opts.provider)), w.check));
    // SOP 사용 기록: 이 결과물에 어떤 SOP 버전이 쓰였는지 (SOP 화면 → 버전별 사용 이력)
    await recordSopUse(step, sop, contentId, { outcome: res.state, decided_by: res.decided_by, provider: res.provider, model: res.model, feedback: !!feedback, attempt: row.attempts + 1 });
    return res;
  } catch (e: any) {
    if (e instanceof StopError) {
      const ms = Date.now() - t0;
      if (e.kind === 'timeout') {
        // 시간 초과: 이 실행이 아직 '작업 중'일 때만 실패로 (그사이 [중지]됐으면 그대로)
        await sbAdmin().from('steps').update({ state: 'failed', finished_at: now(), work_ms: Number(row.work_ms) + ms })
          .eq('content_id', contentId).eq('step', step).eq('state', 'running').eq('started_at', startedAt);
        await sbAdmin().from('contents').update({ error: `[${step}] ${e.message}` }).eq('id', contentId);
        await log(contentId, step, 'timeout', e.message);
        await notify('step_failed', { contentId, step, message: e.message });
      }
      await recordSopUse(step, sop, contentId, { outcome: e.kind === 'timeout' ? 'failed' : 'stopped', feedback: !!feedback, attempt: row.attempts + 1 });
      return { step, state: 'failed', stopped: e.kind, message: e.message };
    }
    // 이미 중지된 실행이면 실패 기록으로 덮어쓰지 않음
    try { await w.check(); } catch (x: any) { if (x?.kind === 'user') return { step, state: 'failed', stopped: 'user', message: '사용자가 중지함' }; }
    await setStep(contentId, step, { state: 'failed', finished_at: now(), work_ms: Number(row.work_ms) + (Date.now() - t0) });
    await sbAdmin().from('contents').update({ error: `[${step}] ${e.message}` }).eq('id', contentId);
    await log(contentId, step, 'failed', e.message);
    await notify('step_failed', { contentId, step, message: e.message });
    await recordSopUse(step, sop, contentId, { outcome: 'failed', provider: opts.provider || null, feedback: !!feedback, attempt: row.attempts + 1 });
    await exportNow(() => exportRun(contentId, step, e.message));
    throw e;
  } finally {
    w.done();
  }
}

// ── 에이전트 직접 작업: Codex·Claude Code·오픈소스 에이전트가 스스로 산출물을 만든다 ──
/** 지시문(시스템+작업+출력 형식)을 내려준다. 서버 API 키 없이도 단계 진행 가능 */
export async function stepBrief(step: StepKey, contentId: string, feedback?: string) {
  if (stepDef(step)?.kind !== 'ai') throw new Error('AI 단계만 가능합니다');
  const c = await loadContent(contentId);
  const rows = await ensureSteps(contentId);
  const blocked = depsBlocked(step, rows);
  if (blocked.length) throw new Error(`상위 단계 승인이 필요합니다: ${blocked.map((d) => stepDef(d).label).join(', ')}`);
  const [s, sop] = await Promise.all([getSettings(), getSop(step)]);
  const prep = await prepare(step, c, s, sop, feedback || rows[step].feedback || null);
  return {
    step, content_id: contentId, needs_web_search: prep.webSearch, freedom: sop.freedom, gate: sop.gate,
    system: prep.system, task: prep.prompt,
    how_to_submit: '위 system 과 task 를 따라 JSON 하나를 만든 뒤 step_submit(content_id, step, output, agent) 으로 제출. 제출하면 규칙 검사와 결정 방식이 적용됩니다.' +
      (prep.webSearch ? ' 조사 단계는 반드시 실제 웹 검색으로 확인한 공식 출처 URL만 facts 에 넣으세요.' : ''),
  };
}

/** 에이전트가 만든 산출물 제출 → 후처리·규칙 검사·게이트 적용 */
export type AgentUsage = { model?: string; platform?: string; effort?: string; input_tokens?: number; output_tokens?: number; cache_read_tokens?: number; searches?: number };
export async function stepSubmit(step: StepKey, contentId: string, output: any, agent = 'agent', usage?: AgentUsage | null) {
  if (stepDef(step)?.kind !== 'ai') throw new Error('AI 단계만 가능합니다');
  const c = await loadContent(contentId);
  const rows = await ensureSteps(contentId);
  const blocked = depsBlocked(step, rows);
  if (blocked.length) throw new Error(`상위 단계 승인이 필요합니다: ${blocked.map((d) => stepDef(d).label).join(', ')}`);
  const [s, sop] = await Promise.all([getSettings(), getSop(step)]);
  const row = rows[step];
  const t0 = Date.now();
  const prep = await prepare(step, c, s, sop, null);
  const gen = await finalize(step, c, s, output, prep);
  // 외부 에이전트도 사용 기록부에 남김. 플랫폼·모델·토큰을 알려 주면 비용까지 계산 (구독 요금제로 돌렸으면 0)
  const name = String(agent).slice(0, 30);
  const plat = ['anthropic', 'openai', 'oss'].includes(String(usage?.platform)) ? String(usage!.platform) : 'agent';
  await logUsage([{
    kind: 'llm', platform: plat, model: usage?.model || name, effort: usage?.effort || null, ms: null,
    input_tokens: Number(usage?.input_tokens || 0), output_tokens: Number(usage?.output_tokens || 0),
    cache_read_tokens: Number(usage?.cache_read_tokens || 0), searches: Number(usage?.searches || 0),
  }], { contentId, step, task: step, by: `agent:${name}` });
  return settle(step, contentId, row, s, sop, { ...gen, provider: `agent:${name}`, model: usage?.model ? `${usage.model}${usage.effort ? ' · ' + usage.effort : ''}` : undefined, input: { system: prep.system, prompt: prep.prompt }, refs: prep.refs }, t0);
}

// ── 결정: 사람 승인/반려 ────────────────────────────────────────────
export async function decide(step: StepKey, contentId: string, decision: 'approve' | 'reject', note = '', by: 'human' | 'ai' = 'human') {
  const rows = await ensureSteps(contentId);
  const row = rows[step];
  if (!row) throw new Error('알 수 없는 단계');
  if (!['review', 'stale', 'rejected', 'approved'].includes(row.state)) throw new Error(`현재 상태(${row.state})에서는 결정할 수 없습니다`);
  const t = now();
  const wait = row.finished_at && row.state === 'review' ? Math.max(0, Date.now() - new Date(row.finished_at).getTime()) : 0;
  if (decision === 'approve') {
    if (step === 'landing' || stepDef(step).kind === 'ai') {
      const c = await loadContent(contentId);
      if ((await getOutput(step, c)) == null) throw new Error('산출물이 없습니다');
    }
    await setStep(contentId, step, { state: 'approved', decided_by: by, decided_at: t, decision_note: note || null, wait_ms: Number(row.wait_ms) + wait });
  } else {
    await setStep(contentId, step, { state: 'rejected', decided_by: by, decided_at: t, decision_note: note || null, feedback: note || null, wait_ms: Number(row.wait_ms) + wait });
  }
  await log(contentId, step, decision === 'approve' ? 'approved' : 'rejected', `${by}${note ? ': ' + note.slice(0, 100) : ''}`);
  await syncCurrent(contentId);
  // 사람이 고친 뒤 승인 → AI 원본과 최종본의 차이를 학습 재료(수정 예)로 자동 저장
  let learned = false;
  if (decision === 'approve' && by === 'human' && stepDef(step).kind === 'ai') {
    learned = await recordEditExemplar(step, contentId, row.ai_output, note).catch(() => false);
  }
  await exportNow(() => exportRun(contentId, step));
  const lc = learned ? await learnCounts(step).catch(() => null) : null;
  return { step, state: decision === 'approve' ? 'approved' : 'rejected', learned_edit: learned, should_propose: !!lc?.should_propose };
}

// ── 결정: AI 에게 판단 맡기기 ───────────────────────────────────────
export async function aiDecide(step: StepKey, contentId: string, apply = false) {
  if (stepDef(step).kind !== 'ai') throw new Error('영상 검수는 사람이 확인해야 합니다');
  const c = await loadContent(contentId);
  const rows = await ensureSteps(contentId);
  const [s, sop] = await Promise.all([getSettings(), getSop(step)]);
  const output = await getOutput(step, c);
  if (output == null) throw new Error('산출물이 없습니다');
  const checks = lint(step, output, c, s, { slots: step === 'landing' ? await slotsFor(contentId) : undefined });
  const rv = await review(step, c, s, sop, output, checks);
  const row = rows[step];
  await setStep(contentId, step, {
    ai_review: rv.data, checks,
    input_tokens: Number(row.input_tokens) + rv.usage.input, output_tokens: Number(row.output_tokens) + rv.usage.output,
    cost_usd: await stepCost(contentId, step),
  });
  if (rv.data.verdict === 'pass') {
    await decide(step, contentId, 'approve', rv.data.summary || 'AI 검수 통과', 'ai');
    return { step, state: 'approved', ai_review: rv.data };
  }
  if (apply && rv.data.feedback) return runStep(step, contentId, { feedback: rv.data.feedback, force: true });
  return { step, state: row.state, ai_review: rv.data };
}

// ── 사람이 산출물을 직접 고친 뒤 호출 ────────────────────────────────
export async function onEdited(step: StepKey, contentId: string) {
  const rows = await ensureSteps(contentId);
  const c = await loadContent(contentId);
  const s = await getSettings();
  const output = await getOutput(step, c);
  const checks = lint(step, output, c, s, { slots: step === 'landing' ? await slotsFor(contentId) : undefined });
  const row = rows[step];
  await setStep(contentId, step, {
    checks,
    ...(row.state === 'approved' || row.state === 'stale' || row.state === 'pending' || row.state === 'failed'
      ? { state: 'review', decided_by: null, decided_at: null, finished_at: now() }
      : {}),
  });
  await markStale(contentId, step);
  await syncCurrent(contentId);
  await log(contentId, step, 'edited', '사람이 직접 수정');
}

// ── 다음 단계 1개 진행 (원클릭·워커·MCP 공용) ───────────────────────
export async function advance(contentId: string) {
  const rows = await ensureSteps(contentId);
  for (const d of STEP_DEFS) {
    const st = rows[d.key].state;
    if (st === 'approved') continue;
    if (st === 'review') return { step: d.key, action: 'wait_review' as const, message: `'${d.label}' 검수 대기 중` };
    if (st === 'running') return { step: d.key, action: 'running' as const, message: `'${d.label}' 작업 중` };
    if (d.kind === 'worker') return { step: d.key, action: 'worker' as const, message: `'${d.label}' 는 워커가 실행합니다` };
    const r = await runStep(d.key, contentId);
    return { step: d.key, action: r.state === 'approved' ? ('continue' as const) : ('wait_review' as const), state: r.state, message: `'${d.label}' ${r.state === 'approved' ? '승인' : '검수 대기'}` };
  }
  return { step: null, action: 'done' as const, message: '모든 단계 완료' };
}

export async function requireApproved(contentId: string, step: StepKey) {
  const rows = await ensureSteps(contentId);
  const blocked = stepDef(step).deps.filter((d) => rows[d]?.state !== 'approved');
  if (blocked.length) throw new Error(`승인이 필요한 단계: ${blocked.map((d) => stepDef(d).label).join(', ')}`);
}
