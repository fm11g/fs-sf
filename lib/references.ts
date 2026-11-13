import { ask } from './llm';
import { getSettings } from './settings';
import { sbAdmin } from './supabase/server';
import { dispatch } from './github';
import { DIMENSIONS } from './editorial-taxonomy';
import { FONT_OPTIONS } from './types';
import { newSlug } from './pipeline';
import type { StepKey } from './steps';

/**
 * 참고 영상 학습
 *  1) 등록(유튜브 링크·영상 파일) → 2) 워커가 영상·자막·컷·프레임 추출 → 3) 여기서 AI(비전)가 구조를 분석
 *  4) 생성할 때: 학습에 켜 둔 참고 영상의 "재현 규칙"을 단계별로 주입
 *     "이 영상처럼 만들기"로 만든 콘텐츠는 그 영상 한 편을 강하게 따라감 (내용·문장은 베끼지 않음)
 *  5) 원하면 분석 규칙을 SOP 보완 제안으로 (기존 SOP 유지, 사람이 반영)
 */
export const REF_STEPS: StepKey[] = ['research', 'plan', 'script', 'offer', 'design', 'copy'];
const clip = (v: any, n: number) => { const s = typeof v === 'string' ? v : JSON.stringify(v ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

export function parseYoutubeId(url: string): string | null {
  const m = String(url).match(/(?:youtube\.com\/(?:shorts\/|watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export async function addReference(o: { url?: string; storage_path?: string; title?: string; note?: string; tags?: string[]; weight?: number; learn_steps?: string[] }, by: string) {
  const db = sbAdmin();
  let kind: 'youtube' | 'upload' | 'link' = 'link';
  let url = (o.url || '').trim() || null;
  if (o.storage_path) {
    kind = 'upload';
    url = db.storage.from('media').getPublicUrl(o.storage_path).data.publicUrl;
  } else if (url) {
    if (!/^https?:\/\//.test(url)) throw new Error('링크는 https:// 로 시작해야 합니다');
    const yid = parseYoutubeId(url);
    if (yid) { kind = 'youtube'; url = `https://www.youtube.com/watch?v=${yid}`; }
    const { data: dup } = await db.from('ref_videos').select('id').eq('url', url).maybeSingle();
    if (dup) throw new Error(`이미 등록된 영상입니다 (#${dup.id})`);
  } else throw new Error('유튜브 링크나 영상 파일이 필요합니다');

  const { data, error } = await db.from('ref_videos').insert({
    kind, url, storage_path: o.storage_path || null, title: o.title || null, note: o.note || null,
    tags: (o.tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 12), weight: Math.min(5, Math.max(1, Number(o.weight || 3))),
    learn_steps: (o.learn_steps?.length ? o.learn_steps : ['plan', 'script', 'design', 'copy']).filter((s) => REF_STEPS.includes(s as StepKey)),
    created_by: by, status: 'queued',
  }).select().single();
  if (error) throw new Error(error.message);
  let warn: string | null = null;
  try { await dispatch('reference', { ref_id: data.id }); }
  catch (e: any) { warn = `분석 워커를 시작하지 못했습니다: ${e.message}`; await db.from('ref_videos').update({ error: warn }).eq('id', data.id); }
  return { ref: data, warn };
}

export async function reanalyze(id: number) {
  await sbAdmin().from('ref_videos').update({ status: 'queued', error: null }).eq('id', id);
  await dispatch('reference', { ref_id: id });
}

// ── 분석 (워커가 추출을 마친 뒤 호출) ─────────────────────────────────
const ANALYSIS_SCHEMA = `{
  "summary": "이 영상이 무엇을 어떻게 전달하는지 2~3문장",
  "why_it_works": ["잘 되는 이유 (구체적으로, 시간 근거 포함)"],
  "taxonomy": { ${Object.entries(DIMENSIONS).map(([k, d]) => `"${k}": "${d.values.join(' | ')} 중 가장 가까운 것"`).join(', ')} },
  "hook": { "type": "마감형|숫자형|질문형|손실형|사례형|반전형", "first_seconds": "첫 1~3초에 화면·말·자막이 무엇을 하는지", "line": "첫 문장(원문)", "pattern": "우리 주제에 적용할 수 있게 일반화한 훅 틀 (예: '[대상] 이거 모르면 [손실]')" },
  "structure": [{ "from": 0, "to": 3.2, "role": "훅|문제제기|근거·숫자|조건|방법|반전|사례|CTA", "says": "말한 내용 요약", "shows": "화면에 보인 것" }],
  "pacing": { "total_sec": 0, "cuts": 0, "avg_shot_sec": 0, "chars_per_sec": 0, "notes": "속도감·호흡" },
  "script_style": { "tone": "", "sentence_len": "짧음|보통|김", "devices": ["반복·질문·숫자·대비 같은 장치"], "cta": "마지막 행동 유도 방식" },
  "captions": { "position": "상단|중앙|하단", "size": "작음|보통|큼|아주 큼", "chars_per_line": 0, "style": "박스·외곽선·강조색·단어 단위 팝업 등", "emphasis": "강조 방식" },
  "visual": { "palette": ["#hex 3~5개"], "background": "단색|그라데이션|실사|화면녹화|일러스트", "title_font_feel": "굵은 고딕|손글씨|명조|둥근", "recommended_fonts": ["${FONT_OPTIONS.join('|')} 중 1~2개"], "layouts": ["hook|stat|list|compare|quote|cta 중 자주 쓰인 것"], "motion": ["pop|slide|typewriter|countup|zoom 중 가까운 것"], "graphics": "아이콘·숫자 카드·화살표·이모지 등" },
  "audio": { "voice": "성별·속도·톤", "bgm": "분위기", "sfx": "효과음 사용" },
  "replicate_rules": [{ "step": "plan|script|design|copy|offer|research", "rule": "우리 숏폼에 바로 적용할 한 줄 지시", "evidence": "몇 초에서 무엇을 보고" }],
  "avoid": ["따라 하면 안 되는 것 (과장·허위·저작권 소지·우리 채널과 맞지 않는 것)"],
  "fit_score": 1
}`;

export async function analyzeWithAI(id: number) {
  const db = sbAdmin();
  const { data: r } = await db.from('ref_videos').select('*').eq('id', id).single();
  if (!r) throw new Error('참고 영상 없음');
  const s = await getSettings();
  const frames: { url: string; t: number }[] = (r.frames || []).slice(0, 16);
  const meta = r.meta || {};
  const prompt = `참고 영상 #${id} 를 분석해 우리 채널('${s.brand}' — ${s.target || '정책자금 정보'} 숏폼) 제작에 쓸 재현 규칙을 뽑으세요.

## 영상 정보
${clip({ title: r.title || meta.title, channel: r.channel || meta.channel, duration_sec: meta.duration, views: meta.view_count, likes: meta.like_count, comments: meta.comment_count, uploaded: meta.upload_date, size: meta.width && `${meta.width}x${meta.height}`, description: clip(meta.description || '', 500) }, 1500)}

## 운영자 메모 (왜 좋다고 골랐는지 — 가장 중요하게 반영)
${r.note || '(없음)'}${r.tags?.length ? `\n태그: ${r.tags.join(', ')}` : ''}

## 컷 전환 시각(초)
${(r.cuts || []).length ? (r.cuts || []).map((x: number) => x.toFixed(1)).join(', ') : '(추출 못 함)'}

## 대사(타임스탬프)
${clip(r.transcript || '(자막·음성 인식 없음 — 프레임과 제목으로만 판단)', 6000)}

## 프레임
첨부 이미지 ${frames.length}장, 순서대로 ${frames.map((f) => `${Number(f.t).toFixed(1)}초`).join(', ')} 시점입니다. 자막 위치·크기·색, 배경, 그래픽, 레이아웃을 이미지에서 직접 읽으세요.

원칙
- 구체적으로: "훅이 좋다"가 아니라 "0~1.5초에 숫자 '3천만원'을 화면 중앙 큰 글씨로 + '이거 모르면'으로 시작".
- replicate_rules 는 단계(step)별로 실제로 따라 할 수 있는 지시 8~14개. 이 영상의 문장·고유 정보·인물·로고를 그대로 쓰라는 규칙은 금지 — 형식·구조·리듬·디자인만.
- 정책자금 정보는 사실이 중요합니다. 과장·확정 표현을 따라 하게 하지 마세요(avoid 에 적기).
- fit_score: 우리 채널에 적용하기 좋은 정도 1~5.

JSON 스키마:
${ANALYSIS_SCHEMA}`;

  const res = await ask<any>({
    system: '당신은 숏폼(유튜브 쇼츠·인스타 릴스) 구조 분석가이자 PD입니다. 잘 된 영상을 초 단위로 해부해 다른 주제에도 재현 가능한 규칙으로 바꿉니다.',
    prompt, images: frames.map((f) => f.url), maxTokens: 6000, chain: s.llm_chain, task: 'reference',
  });
  const a = res.data || {};
  a._provider = `${res.provider}/${res.model}`;
  await db.from('ref_videos').update({ analysis: a, status: 'ready', error: null, analyzed_at: new Date().toISOString(), title: r.title || meta.title || null, channel: r.channel || meta.channel || null }).eq('id', id);
  return a;
}

// ── 생성할 때 주입 ───────────────────────────────────────────────────
const fmtRules = (a: any, step: string) => (a?.replicate_rules || []).filter((x: any) => x.step === step).map((x: any) => `- ${x.rule}`).join('\n');

function stepSpecific(a: any, step: StepKey) {
  const lines: string[] = [];
  if (step === 'plan') {
    if (a.hook) lines.push(`- 훅 틀: ${a.hook.pattern || ''} (유형 ${a.hook.type || '-'}; 첫 장면: ${a.hook.first_seconds || ''})`);
    if (a.structure?.length) lines.push(`- 구성 흐름: ${a.structure.map((x: any) => `${x.role}(${Number(x.from).toFixed(0)}~${Number(x.to).toFixed(0)}초)`).join(' → ')}`);
    if (a.pacing) lines.push(`- 속도: 컷 ${a.pacing.cuts ?? '-'}개 · 평균 ${a.pacing.avg_shot_sec ?? '-'}초/컷 · ${a.pacing.notes || ''}`);
  }
  if (step === 'script') {
    if (a.script_style) lines.push(`- 말투: ${a.script_style.tone || ''} · 문장 ${a.script_style.sentence_len || ''} · 장치: ${(a.script_style.devices || []).join(', ')} · CTA: ${a.script_style.cta || ''}`);
    if (a.pacing?.chars_per_sec) lines.push(`- 말 속도 참고: 초당 ${a.pacing.chars_per_sec}자`);
    if (a.captions) lines.push(`- 자막: 한 줄 ${a.captions.chars_per_line || '-'}자 안팎 · ${a.captions.emphasis || ''}`);
  }
  if (step === 'design') {
    if (a.visual) lines.push(`- 색: ${(a.visual.palette || []).join(' ')} · 배경 ${a.visual.background || ''} · 폰트 ${(a.visual.recommended_fonts || []).join(', ')} · 레이아웃 ${(a.visual.layouts || []).join(', ')} · 모션 ${(a.visual.motion || []).join(', ')} · 그래픽 ${a.visual.graphics || ''}`);
    if (a.captions) lines.push(`- 자막 스타일: ${a.captions.position || ''} · ${a.captions.size || ''} · ${a.captions.style || ''}`);
  }
  return lines.join('\n');
}

/** 생성 프롬프트에 붙일 참고 영상 블록. c.reference_id 가 있으면 그 영상을 강하게, 없으면 학습에 켠 영상 상위 3편 */
export async function referenceBlock(step: StepKey, c: any): Promise<{ text: string; ids: number[] }> {
  if (!REF_STEPS.includes(step)) return { text: '', ids: [] };
  const db = sbAdmin();
  if (c.reference_id) {
    const { data: r } = await db.from('ref_videos').select('id, title, note, analysis, status').eq('id', c.reference_id).maybeSingle();
    if (r?.status === 'ready' && r.analysis) {
      const a = r.analysis;
      const rules = fmtRules(a, step);
      const extra = stepSpecific(a, step);
      if (!rules && !extra && step !== 'plan') return { text: '', ids: [] };
      return {
        ids: [r.id],
        text: `\n\n## 이 콘텐츠의 목표: 참고 영상 #${r.id}「${r.title || ''}」처럼 만들기
운영자가 이 영상을 기준으로 지정했습니다. 형식·구조·리듬·디자인을 최대한 가깝게 따르되, 내용·사실·숫자는 이번 조사 자료만 씁니다. 원본 문장·고유명사·로고를 그대로 쓰지 않습니다.
요약: ${a.summary || ''}${r.note ? `\n운영자가 좋다고 본 점: ${r.note}` : ''}
${extra}${rules ? `\n${rules}` : ''}${a.avoid?.length ? `\n피할 것: ${a.avoid.join(' / ')}` : ''}`,
      };
    }
  }
  const { data: refs } = await db.from('ref_videos').select('id, title, note, weight, analysis, learn_steps')
    .eq('active', true).eq('status', 'ready').contains('learn_steps', [step])
    .order('weight', { ascending: false }).order('created_at', { ascending: false }).limit(3);
  const list = (refs || []).filter((r: any) => r.analysis);
  if (!list.length) return { text: '', ids: [] };
  const body = list.map((r: any) => {
    const rules = fmtRules(r.analysis, step);
    const extra = stepSpecific(r.analysis, step);
    return (rules || extra) ? `### 참고 영상 #${r.id} (반영 강도 ${r.weight}/5)${r.note ? ` — ${clip(r.note, 120)}` : ''}\n${extra}${rules ? `\n${rules}` : ''}` : '';
  }).filter(Boolean);
  if (!body.length) return { text: '', ids: [] };
  return {
    ids: list.map((r: any) => r.id),
    text: `\n\n## 운영자가 고른 참고 영상에서 배운 것 (형식만 참고 · 내용은 가져오지 않음 · 반영 강도가 높을수록 우선)\n${body.join('\n\n')}`,
  };
}

export async function markUsed(ids: number[]) {
  if (!ids.length) return;
  const db = sbAdmin();
  const { data } = await db.from('ref_videos').select('id, uses').in('id', ids);
  for (const r of data || []) await db.from('ref_videos').update({ uses: (r.uses || 0) + 1 }).eq('id', r.id);
}

/** "이 영상처럼 만들기" → 새 콘텐츠 (편성 슬롯 분류도 참고 영상 분석값으로 미리 채움) */
export async function createFromReference(refId: number, topic?: string) {
  const db = sbAdmin();
  const { data: r } = await db.from('ref_videos').select('id, status, analysis, title').eq('id', refId).single();
  if (!r || r.status !== 'ready') throw new Error('분석이 끝난 참고 영상만 가능합니다');
  const tx = r.analysis?.taxonomy || {};
  const { data, error } = await db.from('contents').insert({
    slug: newSlug(), topic: topic || null, status: 'working', current_step: 'research', reference_id: refId,
    editorial: { source: 'reference', reference_id: refId, ...Object.fromEntries(Object.keys(DIMENSIONS).filter((k) => tx[k]).map((k) => [k, tx[k]])), title_idea: `참고 #${refId} 형식` },
  }).select('id, slug').single();
  if (error) throw new Error(error.message);
  await markUsed([refId]);
  return data;
}
