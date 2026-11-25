/**
 * 최종 콘텐츠 점수 (1~5) — 순수 함수
 * 같은 플랫폼의 내 영상들과 비교한 백분위로 계산한다 (채널 규모와 무관하게 "우리 채널 기준으로 잘 됐나")
 *
 * 구성 요소 (값이 있는 것만 가중 평균, 가중치는 설정 perf_weights · 기본 DEFAULT_WEIGHTS)
 *   leads       ★가장 큰 비중★ 홈페이지 신청(DB) 수: 이 영상 링크로 온 신청 + 같은 숏폼 정보글(검색) 신청 배분 ÷ 나이 보정
 *               (홈페이지 관리자 연동 lib/tpf-site.ts syncLeads → channel_posts.leads)
 *   views       나이 보정 조회수: 조회 ÷ (1 + ln(1 + 경과일, 최대 14일))
 *   engagement  (좋아요 + 댓글 + 저장) ÷ 조회
 *   shares      공유 ÷ 조회
 *   comments    댓글 품질(분석 1~5) × ln(1 + 댓글 수) × (1 + 신청·문의 의향 비율)
 *   subscribers 이 영상으로 늘어난 구독자(팔로워) ÷ 나이 보정
 *   retention   평균 시청 비율(유튜브) 또는 평균 시청 초(인스타)
 *   conversion  공장 랜딩 신청 ÷ 랜딩 조회 (공장 콘텐츠만)
 * DB 항목은 비교 대상 영상 중 신청이 1건 이상 있을 때만 점수에 들어간다 (연동 전 · 신청 0건 기간엔 나머지로 평가).
 * DB 백분위는 특별 규칙: 0건 = 0, 1건 이상 = 0.5~1 (신청이 난 영상끼리 순위) → DB 가 난 영상이 조회만 많은 영상보다 위로.
 * 성숙도: 48시간 미만 early(잠정) · 7일 미만 settling · 7일 이상 final(확정)
 */
export type PerfInput = {
  id: number | string; platform: string; published_at: string; duration_sec?: number | null;
  metrics: Record<string, number | null | undefined>; comment_analysis?: any; conversion?: number | null;
  leads?: number | null;  // 홈페이지 신청(DB) 수 (null = 연동 안 됨)
};
export type PerfResult = { score: number; components: Record<string, { value: number | null; pct: number | null }>; maturity: 'early' | 'settling' | 'final'; age_days: number; rank_pct: number };

export const DEFAULT_WEIGHTS = { leads: 0.4, views: 0.12, engagement: 0.1, shares: 0.1, comments: 0.1, subscribers: 0.1, retention: 0.05, conversion: 0.03 };
/** 저장된 가중치에 DB(leads) 항목이 없으면(예전 설정) 기본값 사용 */
export function effectiveWeights(w?: Record<string, number> | null): Record<string, number> {
  return w && w.leads != null ? { ...DEFAULT_WEIGHTS, ...w } : DEFAULT_WEIGHTS;
}
export const COMPONENT_KO: Record<string, string> = { leads: 'DB', views: '조회', engagement: '참여', shares: '공유', comments: '댓글', subscribers: '구독', retention: '시청유지', conversion: '랜딩전환' };

const n = (v: any) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function rawComponents(p: PerfInput, now = Date.now()) {
  const m = p.metrics || {};
  const age = Math.max(0, (now - +new Date(p.published_at)) / 864e5);
  const views = n(m.views);
  const v = views && views > 0 ? views : null;
  const ca = p.comment_analysis || {};
  const comments = n(m.comments);
  const intentRatio = comments && ca.intent != null ? Math.min(1, Number(ca.intent) / Math.max(1, Math.min(comments, 20))) : 0;
  const ageAdj = 1 + Math.log(1 + Math.min(age, 14));
  const subs = n(m.subs_gained) ?? n(m.follows);
  return {
    age,
    raw: {
      leads: p.leads == null ? null : Number(p.leads) / ageAdj,
      views: views == null ? null : views / ageAdj,
      engagement: v ? ((n(m.likes) || 0) + (comments || 0) + (n(m.saves) || 0)) / v : null,
      shares: v && n(m.shares) != null ? (n(m.shares) as number) / v : null,
      comments: comments == null ? null : ((ca.quality ?? 3) / 5) * Math.log(1 + comments) * (1 + intentRatio),
      retention: n(m.avg_view_pct) ?? (n(m.avg_watch_sec) != null && p.duration_sec ? Math.min(150, ((n(m.avg_watch_sec) as number) / p.duration_sec) * 100) : n(m.avg_watch_sec)),
      subscribers: subs == null ? null : subs / ageAdj,
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

export function scorePosts(posts: PerfInput[], weightsIn: Record<string, number> = DEFAULT_WEIGHTS, now = Date.now()) {
  const weights = effectiveWeights(weightsIn);
  const out = new Map<string | number, PerfResult>();
  for (const platform of [...new Set(posts.map((p) => p.platform))]) {
    const group = posts.filter((p) => p.platform === platform).map((p) => ({ p, ...rawComponents(p, now) }));
    // 비교 기준은 24시간 이상 지난 영상 (너무 이른 영상이 기준을 흔들지 않게). 부족하면 전체
    const mature = group.filter((g) => g.age >= 1);
    const ref = mature.length >= 3 ? mature : group;
    const keys = Object.keys(DEFAULT_WEIGHTS);
    const dist = Object.fromEntries(keys.map((k) => [k, ref.map((g) => g.raw[k]).filter((v): v is number => v != null)]));
    // 신청이 한 건도 없는 기간엔 DB 항목이 모두 같은 값(0) → 점수를 흐리지 않게 제외
    const noLeads = !group.some((g) => (g.raw.leads ?? 0) > 0);
    for (const g of group) {
      const components: PerfResult['components'] = {};
      let wsum = 0, acc = 0;
      for (const k of keys) {
        const val = k === 'leads' && noLeads ? null : g.raw[k];
        let pct = val == null || !dist[k].length ? null : pctRank([...dist[k], ...(dist[k].includes(val) ? [] : [val])], val);
        // DB: 신청 0건은 바닥(0), 1건 이상은 0.5~1 사이에서 순위 — "DB 가 났는가"가 다른 지표보다 먼저 갈리게
        if (k === 'leads' && val != null) {
          const pos = dist[k].filter((v) => v > 0);
          pct = val <= 0 ? 0 : 0.5 + 0.5 * pctRank([...pos, ...(pos.includes(val) ? [] : [val])], val);
        }
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
