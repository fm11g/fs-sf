import { ask } from './llm';
import { getSettings } from './settings';
import { sbAdmin } from './supabase/server';
import { DIMENSIONS, DIM_KEYS, type DimKey } from './editorial-taxonomy';
import { perfTags, scorePosts, COMPONENT_KO } from './perf';
import { recordPerformanceRating } from './learn';
import { exportNow, exportChannelSnapshot } from './export';
import { features } from './tags';

const LOOKBACK = (s: any) => Number(s.channel_lookback_days || 60);
const since = (days: number) => new Date(Date.now() - days * 864e5).toISOString();

/** 공장 콘텐츠의 형태 (조사·기획 산출물 + 편성 슬롯) */
export function contentAttrs(c: any) {
  const f = features('plan', c.plan, { c });
  const a: Record<string, any> = {
    topic_category: c.research?.topic_category || c.plan?.topic_category || c.editorial?.topic_category,
    angle: c.plan?.angle || c.editorial?.angle,
    hook_type: (f.hook_type !== '-' ? f.hook_type : null) || c.editorial?.hook_type,
    format: c.plan?.format || c.editorial?.format,
    target: c.plan?.target || c.editorial?.target,
  };
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v));
}

const pickIn = (dim: DimKey, v: any) => ((DIMENSIONS[dim].values as readonly string[]).includes(v) ? v : null);

/** 댓글 분석 + 형태 분류 (LLM, 6편씩). 댓글이 바뀐 영상·분류 없는 영상만 */
async function analyzeBatch(posts: any[], s: any) {
  const res = await ask<any>({
    system: `당신은 '${s.brand}' 채널의 데이터 분석가입니다. 영상별로 (1) 콘텐츠 형태를 분류하고 (2) 댓글을 분석합니다.
분류 값은 아래 목록에서만 고릅니다 (맞는 것이 없으면 null).
${DIM_KEYS.map((k) => `- ${k} (${DIMENSIONS[k].label}): ${DIMENSIONS[k].values.join(', ')}`).join('\n')}
댓글 분석: 광고·스팸은 제외. intent 는 신청·상담·자격 문의 등 행동 의향이 보이는 댓글 수. requests 는 "다음에 ○○도 다뤄 달라"처럼 시청자가 원하는 주제(짧게).`,
    prompt: `${posts.map((p) => `## 영상 ${p.id} (${p.platform})
제목: ${p.title || '-'}
설명: ${String(p.caption || '').slice(0, 300)}
지표: 조회 ${p.metrics?.views ?? '-'} · 좋아요 ${p.metrics?.likes ?? '-'} · 댓글 ${p.metrics?.comments ?? '-'} · 공유 ${p.metrics?.shares ?? '-'}
${p.known ? `이미 알고 있는 형태: ${JSON.stringify(p.known)}` : ''}
댓글:
${(p.comments || []).slice(0, 15).map((c: any) => `- (${c.likes}) ${c.text}`).join('\n') || '(없음)'}`).join('\n\n')}

JSON: { "posts": [{ "id": 0, "attrs": { "topic_category": "", "angle": "", "hook_type": "", "format": "", "target": "", "tone": "한 단어" },
  "comment_analysis": { "sentiment": { "pos": 0.0, "neu": 0.0, "neg": 0.0 }, "themes": [""], "questions": [""], "intent": 0, "requests": [""], "complaints": [""], "quality": 3, "summary": "한 줄" } }] }`,
    maxTokens: 4000, chain: s.llm_chain, task: 'channels',
  });
  return res.data.posts || [];
}

/** 매일 (워커가 수집 직후 호출): 분석 → 점수 → 성과 학습 → 데이터 내보내기 */
export async function analyzeChannels(o: { warnings?: string[]; reanalyze?: boolean } = {}) {
  const s = await getSettings();
  const db = sbAdmin();
  const { data: rows } = await db.from('channel_posts').select('*').gte('published_at', since(LOOKBACK(s))).order('published_at', { ascending: false }).limit(400);
  const posts = rows || [];
  if (!posts.length) return { posts: 0, analyzed: 0, scored: 0, learned: 0, warnings: [...(o.warnings || []), '수집된 영상이 없습니다 — 채널 링크·토큰 확인'] };

  // 1) 공장 콘텐츠 형태 + 랜딩 전환
  const cids = [...new Set(posts.map((p: any) => p.content_id).filter(Boolean))];
  const { data: cs } = cids.length ? await db.from('contents').select('id, slug, topic, research, plan, editorial, created_at').in('id', cids) : { data: [] as any[] };
  const byId = new Map((cs || []).map((c: any) => [c.id, c]));
  const slugs = (cs || []).map((c: any) => c.slug);
  const [{ data: ev }, { data: ld }] = slugs.length ? await Promise.all([
    db.from('events').select('content_slug').eq('type', 'view').in('content_slug', slugs).limit(50000),
    db.from('leads').select('content_slug').in('content_slug', slugs),
  ]) : [{ data: [] as any[] }, { data: [] as any[] }];
  const conv = (slug: string) => { const v = (ev || []).filter((x: any) => x.content_slug === slug).length; const l = (ld || []).filter((x: any) => x.content_slug === slug).length; return v >= 20 ? l / v : null; };

  // 2) 댓글 분석 + 형태 분류 (바뀐 것만)
  const need = posts.filter((p: any) => o.reanalyze || !p.comment_analysis || p.comment_analysis?._hash !== p.comments_hash || !Object.keys(p.attrs || {}).length);
  let analyzed = 0;
  const warnings = [...(o.warnings || [])];
  for (let i = 0; i < need.length; i += 6) {
    const batch = need.slice(i, i + 6).map((p: any) => ({ ...p, known: p.content_id ? contentAttrs(byId.get(p.content_id) || {}) : null }));
    try {
      const out = await analyzeBatch(batch, s);
      for (const r of out) {
        const p = batch.find((x: any) => String(x.id) === String(r.id));
        if (!p) continue;
        const ai = Object.fromEntries(DIM_KEYS.map((k) => [k, pickIn(k, r.attrs?.[k])]).filter(([, v]) => v));
        const attrs = p.attrs_source === 'manual' ? p.attrs : { ...ai, ...(r.attrs?.tone ? { tone: r.attrs.tone } : {}), ...(p.known || {}) };
        await db.from('channel_posts').update({ attrs, attrs_source: p.attrs_source === 'manual' ? 'manual' : p.known && Object.keys(p.known).length ? 'content' : 'ai', comment_analysis: { ...(r.comment_analysis || {}), _hash: p.comments_hash } }).eq('id', p.id);
        Object.assign(p, { attrs, comment_analysis: r.comment_analysis });
        const orig = posts.find((x: any) => x.id === p.id); if (orig) Object.assign(orig, { attrs, comment_analysis: r.comment_analysis });
        analyzed++;
      }
    } catch (e: any) { warnings.push(`댓글 분석 실패: ${String(e.message).slice(0, 120)}`); break; }
  }

  // 3) 최종 점수
  const scores = scorePosts(posts.map((p: any) => ({ ...p, conversion: p.content_id ? conv(byId.get(p.content_id)?.slug) : null })), s.perf_weights);
  const now = new Date().toISOString();
  for (const p of posts) {
    const r = scores.get(p.id);
    if (!r) continue;
    p.perf = { ...r, computed_at: now };
    p.perf_score = r.score;
    await db.from('channel_posts').update({ perf: p.perf, perf_score: r.score }).eq('id', p.id);
  }

  // 4) 성과 → 학습: 확정(7일+) 된 공장 콘텐츠의 기획·대사·카피를 성과 점수로 평가
  let learned = 0;
  if (s.perf_to_learning !== false) {
    for (const cid of cids) {
      const linked = posts.filter((p: any) => p.content_id === cid && p.perf?.maturity === 'final');
      if (!linked.length) continue;
      const totalViews = linked.reduce((a: number, p: any) => a + (p.metrics?.views || 0), 0) || linked.length;
      const score = linked.reduce((a: number, p: any) => a + p.perf.score * ((p.metrics?.views || 0) || 1), 0) / totalViews;
      const tags = [...new Set(linked.flatMap((p: any) => perfTags(p.perf)))];
      const note = `채널 성과 ★${score.toFixed(1)} — ` + linked.map((p: any) => `${p.platform === 'youtube' ? '유튜브' : '인스타'} 조회 ${p.metrics?.views ?? '-'}·좋아요 ${p.metrics?.likes ?? '-'}·공유 ${p.metrics?.shares ?? '-'}·댓글 ${p.metrics?.comments ?? '-'}${p.comment_analysis?.summary ? ` (${p.comment_analysis.summary})` : ''}`).join(' / ');
      for (const step of ['plan', 'script', 'copy'] as const) {
        try { if (await recordPerformanceRating(step, cid, score, tags, note.slice(0, 500))) learned++; } catch { /* 산출물 없음 */ }
      }
    }
  }

  await exportNow(() => exportChannelSnapshot(posts));
  return { posts: posts.length, analyzed, scored: scores.size, learned, warnings };
}

/** 편성·화면용 인사이트: 형태별 성과, 마지막 사용, 시청자 요청, 최근 흐름 */
export async function channelInsights() {
  const s = await getSettings();
  const db = sbAdmin();
  const [{ data: posts }, { data: recent }] = await Promise.all([
    db.from('channel_posts').select('id, platform, url, title, thumbnail_url, published_at, metrics, attrs, attrs_source, perf, perf_score, comment_analysis, content_id, comments').gte('published_at', since(LOOKBACK(s))).order('published_at', { ascending: false }).limit(400),
    db.from('contents').select('id, slug, topic, research, plan, editorial, created_at, published_at').gte('created_at', since(21)).order('created_at', { ascending: false }).limit(40),
  ]);
  const P = posts || [];
  const linked = new Set(P.map((p: any) => p.content_id).filter(Boolean));
  // 흐름: 게시된 영상(플랫폼 중복 제거) + 아직 게시 안 된 공장 콘텐츠
  const seen = new Set<string>();
  const seq: { at: string; title: string; attrs: any; score: number | null; source: string; id: any }[] = [];
  for (const p of P) {
    const key = p.content_id || `${p.platform}:${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    seq.push({ at: p.published_at, title: p.title, attrs: p.attrs || {}, score: p.perf_score ?? null, source: p.platform, id: p.id });
  }
  for (const c of recent || []) if (!linked.has(c.id)) seq.push({ at: c.published_at || c.created_at, title: c.topic || c.slug, attrs: contentAttrs(c), score: null, source: 'factory', id: c.id });
  seq.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const scored = P.filter((p: any) => p.perf && p.perf.maturity !== 'early');
  const overall = scored.length ? scored.reduce((a: number, p: any) => a + p.perf_score, 0) / scored.length : 3;
  const dims = Object.fromEntries(DIM_KEYS.map((k) => {
    const vals = (DIMENSIONS[k].values as readonly string[]).map((v) => {
      const hit = scored.filter((p: any) => p.attrs?.[k] === v);
      const used = seq.filter((x) => x.attrs?.[k] === v);
      const last = used[0]?.at || null;
      return {
        value: v, n: hit.length, avg: hit.length ? Math.round((hit.reduce((a: number, p: any) => a + p.perf_score, 0) / hit.length) * 100) / 100 : null,
        last_used: last, days_since: last ? Math.floor((Date.now() - +new Date(last)) / 864e5) : null,
        used_7d: used.filter((x) => Date.now() - +new Date(x.at) < 7 * 864e5).length,
        best: hit.sort((a: any, b: any) => b.perf_score - a.perf_score)[0]?.title || null,
      };
    });
    return [k, vals];
  }));
  const reqMap = new Map<string, { text: string; n: number; last: string }>();
  for (const p of P) for (const r of [...(p.comment_analysis?.requests || []), ...(p.comment_analysis?.questions || []).slice(0, 2)]) {
    const t = String(r || '').trim(); if (t.length < 2) continue;
    const k = t.replace(/\s/g, '').slice(0, 20);
    const cur = reqMap.get(k) || { text: t, n: 0, last: p.published_at }; cur.n++; if (p.published_at > cur.last) cur.last = p.published_at; reqMap.set(k, cur);
  }
  const byScore = [...scored].sort((a: any, b: any) => b.perf_score - a.perf_score);
  return {
    overall: Math.round(overall * 100) / 100, posts: P, scored: scored.length, dims, sequence: seq.slice(0, 14),
    requests: [...reqMap.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, 12),
    top: byScore.slice(0, 5).map((p: any) => ({ title: p.title, score: p.perf_score, attrs: p.attrs, platform: p.platform, url: p.url, why: Object.entries(p.perf?.components || {}).filter(([, c]: any) => c.pct >= 0.8).map(([k]) => COMPONENT_KO[k]) })),
    bottom: byScore.slice(-5).reverse().map((p: any) => ({ title: p.title, score: p.perf_score, attrs: p.attrs, platform: p.platform, url: p.url })),
    last_collected: P.map((p: any) => p.collected_at).filter(Boolean).sort().pop() || null,
  };
}
export type Insights = Awaited<ReturnType<typeof channelInsights>>;
