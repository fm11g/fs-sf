/**
 * 최종 콘텐츠 점수 (1~5) — 순수 함수
 * 같은 플랫폼의 내 영상들과 비교한 백분위로 계산한다 (채널 규모와 무관하게 "우리 채널 기준으로 잘 됐나")
 *
 * 구성 요소 (값이 있는 것만 가중 평균, 가중치는 설정 perf_weights)
 *   views       나이 보정 조회수: 조회 ÷ (1 + ln(1 + 경과일, 최대 14일))
 *   engagement  (좋아요 + 댓글 + 저장) ÷ 조회
 *   shares      공유 ÷ 조회
 *   comments    댓글 품질(분석 1~5) × ln(1 + 댓글 수) × (1 + 신청·문의 의향 비율)
 *   retention   평균 시청 비율(유튜브) 또는 평균 시청 초(인스타)
 *   conversion  랜딩 신청 ÷ 랜딩 조회 (공장 콘텐츠만)
 * 성숙도: 48시간 미만 early(잠정) · 7일 미만 settling · 7일 이상 final(확정)
 */
export type PerfInput = {
  id: number | string; platform: string; published_at: string; duration_sec?: number | null;
  metrics: Record<string, number | null | undefined>; comment_analysis?: any; conversion?: number | null;
};
export type PerfResult = { score: number; components: Record<string, { value: number | null; pct: number | null }>; maturity: 'early' | 'settling' | 'final'; age_days: number; rank_pct: number };

export const DEFAULT_WEIGHTS = { views: 0.35, engagement: 0.2, shares: 0.15, comments: 0.1, retention: 0.1, conversion: 0.1 };
export const COMPONENT_KO: Record<string, string> = { views: '조회', engagement: '참여', shares: '공유', comments: '댓글', retention: '시청유지', conversion: '신청전환' };

const n = (v: any) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function rawComponents(p: PerfInput, now = Date.now()) {
  const m = p.metrics || {};
  const age = Math.max(0, (now - +new Date(p.published_at)) / 864e5);
  const views = n(m.views);
  const v = views && views > 0 ? views : null;
  const ca = p.comment_analysis || {};
  const comments = n(m.comments);
  const intentRatio = comments && ca.intent != null ? Math.min(1, Number(ca.intent) / Math.max(1, Math.min(comments, 20))) : 0;
  return {
    age,
    raw: {
      views: views == null ? null : views / (1 + Math.log(1 + Math.min(age, 14))),
      engagement: v ? ((n(m.likes) || 0) + (comments || 0) + (n(m.saves) || 0)) / v : null,
      shares: v && n(m.shares) != null ? (n(m.shares) as number) / v : null,
      comments: comments == null ? null : ((ca.quality ?? 3) / 5) * Math.log(1 + comments) * (1 + intentRatio),
      retention: n(m.avg_view_pct) ?? (n(m.avg_watch_sec) != null && p.duration_sec ? Math.min(150, ((n(m.avg_watch_sec) as number) / p.duration_sec) * 100) : n(m.avg_watch_sec)),
      conversion: n(p.conversion),
    } as Record<string, number | null>,
  };
}

/** 백분위 (동점은 평균 순위). 비교 대상이 1개면 0.5 */
function pctRank(values: number[], x: number) {
  if (values.length <= 1) return 0.5;
  const below = values.filter((v) => v < x).length;
  const equal = values.filter((v) => v === x).length;
  return (below + (equal - 1) / 2) / (values.length - 1);
}

export function scorePosts(posts: PerfInput[], weights: Record<string, number> = DEFAULT_WEIGHTS, now = Date.now()) {
  const out = new Map<string | number, PerfResult>();
  for (const platform of [...new Set(posts.map((p) => p.platform))]) {
    const group = posts.filter((p) => p.platform === platform).map((p) => ({ p, ...rawComponents(p, now) }));
    // 비교 기준은 24시간 이상 지난 영상 (너무 이른 영상이 기준을 흔들지 않게). 부족하면 전체
    const mature = group.filter((g) => g.age >= 1);
    const ref = mature.length >= 3 ? mature : group;
    const keys = Object.keys(DEFAULT_WEIGHTS);
    const dist = Object.fromEntries(keys.map((k) => [k, ref.map((g) => g.raw[k]).filter((v): v is number => v != null)]));
    for (const g of group) {
      const components: PerfResult['components'] = {};
      let wsum = 0, acc = 0;
      for (const k of keys) {
        const val = g.raw[k];
        const pct = val == null || !dist[k].length ? null : pctRank([...dist[k], ...(dist[k].includes(val) ? [] : [val])], val);
        components[k] = { value: val == null ? null : Math.round(val * 1000) / 1000, pct: pct == null ? null : Math.round(pct * 100) / 100 };
        const w = Number(weights[k] ?? 0);
        if (pct != null && w > 0) { wsum += w; acc += w * pct; }
      }
      const rank = wsum ? acc / wsum : 0.5;
      out.set(g.p.id, {
        score: Math.round((1 + 4 * rank) * 10) / 10, components, rank_pct: Math.round(rank * 100) / 100, age_days: Math.round(g.age * 10) / 10,
        maturity: g.age < 2 ? 'early' : g.age < 7 ? 'settling' : 'final',
      });
    }
  }
  return out;
}

/** 성과 → 학습 태그 (상위 20% / 하위 20% 구성 요소) */
export function perfTags(r: PerfResult) {
  const t: string[] = [];
  for (const [k, c] of Object.entries(r.components)) {
    if (c.pct == null) continue;
    if (c.pct >= 0.8) t.push(`성과:${COMPONENT_KO[k]}상위`);
    else if (c.pct <= 0.2) t.push(`성과:${COMPONENT_KO[k]}하위`);
  }
  return t;
}
