import { esc, h2, kv, layout, p, progress, proposalEmail, sendMail, stepEmail } from './email';
import { getOutput, getSettings } from './settings';
import { sbAdmin } from './supabase/server';
import { STATE_KO, stepDef, type StepKey } from './steps';

export type NotifyEvent = 'step_done' | 'step_review' | 'step_failed' | 'render_done' | 'published' | 'sop_proposal' | 'sop_applied' | 'digest';

const site = (s: any) => String(s.site_url || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');

async function record(row: Record<string, any>) {
  try { await sbAdmin().from('notifications').insert(row); } catch { /* 기록 실패는 무시 */ }
}

/**
 * 알림 발송 — 파이프라인을 절대 멈추지 않는다 (모든 오류를 삼키고 기록만)
 * 받는 사람: 설정 notify_emails · 종류: 설정 notify_events
 */
export async function notify(event: NotifyEvent, o: { contentId?: string; step?: StepKey; message?: string; extra?: any; to?: string[] } = {}) {
  try {
    const s = await getSettings();
    const to = (o.to || s.notify_emails || []).map((x) => String(x).trim()).filter((x) => /.+@.+\..+/.test(x));
    if (!to.length) return { status: 'skipped', reason: '받는 사람 없음' };
    if (!o.to && !(s.notify_events || []).includes(event)) return { status: 'skipped', reason: '꺼진 알림' };

    let mail: { subject: string; html: string; text: string };
    if (event === 'sop_proposal' || event === 'sop_applied') {
      mail = proposalEmail(event, o.step!, o.extra?.proposal || {}, site(s), o.extra);
    } else if (event === 'digest') {
      mail = await digestEmail(s);
    } else {
      const db = sbAdmin();
      const { data: c } = await db.from('contents').select('*').eq('id', o.contentId!).single();
      if (!c) return { status: 'skipped', reason: '콘텐츠 없음' };
      const { data: rows } = await db.from('steps').select('*').eq('content_id', c.id);
      const states = Object.fromEntries((rows || []).map((r: any) => [r.step, r]));
      const step = (o.step || 'render') as StepKey;
      const output = stepDef(step).kind === 'ai' ? await getOutput(step, c) : null;
      mail = stepEmail(event, c, states, step, output, site(s), o.message);
    }

    try {
      await sendMail({ to, ...mail });
      await record({ content_id: o.contentId || null, step: o.step || null, event, recipients: to, subject: mail.subject, status: 'sent' });
      return { status: 'sent', subject: mail.subject };
    } catch (e: any) {
      await record({ content_id: o.contentId || null, step: o.step || null, event, recipients: to, subject: mail.subject, status: 'failed', error: String(e.message).slice(0, 300) });
      return { status: 'failed', error: e.message };
    }
  } catch (e: any) {
    return { status: 'failed', error: e.message };
  }
}

const kstDayStart = () => {
  const now = new Date();
  const k = new Date(now.getTime() + 9 * 3600e3);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - 9 * 3600e3).toISOString();
};

/** 하루 요약: 오늘 끝난 일, 결정 대기, 진행 현황, 게시·신청, SOP 학습 */
export async function digestEmail(s: any) {
  const db = sbAdmin();
  const since = kstDayStart();
  const base = site(s);
  const [{ data: contents }, { data: done }, { count: leads }, { data: props }, { count: exUnused }] = await Promise.all([
    db.from('contents').select('id, slug, topic, current_step, published_at, youtube_id, created_at').order('created_at', { ascending: false }).limit(30),
    db.from('steps').select('content_id, step, state, decided_by, finished_at, provider').gte('finished_at', since),
    db.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', since),
    db.from('sop_proposals').select('id, step, status, summary, decided_at, created_at').or(`status.eq.pending,decided_at.gte.${since}`),
    db.from('exemplars').select('id', { count: 'exact', head: true }).is('used_in', null),
  ]);
  const list = contents || [];
  const ids = list.map((c: any) => c.id);
  const { data: allSteps } = ids.length ? await db.from('steps').select('content_id, step, state, finished_at').in('content_id', ids) : { data: [] as any[] };
  const stOf = (id: string) => Object.fromEntries((allSteps || []).filter((r: any) => r.content_id === id).map((r: any) => [r.step, r.state]));
  const byId = Object.fromEntries(list.map((c: any) => [c.id, c]));
  const active = list.filter((c: any) => c.current_step && c.current_step !== 'done');
  const waiting = active.filter((c: any) => stOf(c.id)[c.current_step] === 'review');
  const publishedToday = list.filter((c: any) => c.published_at && c.published_at >= since);
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());

  const doneByContent: Record<string, any[]> = {};
  for (const r of done || []) (doneByContent[r.content_id] ||= []).push(r);

  const body = [
    kv([['결정 대기', `${waiting.length}건`], ['오늘 끝난 일', `${(done || []).length}개 단계`], ['오늘 게시', `${publishedToday.length}편`], ['오늘 신청', `${leads || 0}건`], ['SOP 제안 대기', `${(props || []).filter((x: any) => x.status === 'pending').length}건`]]),
    waiting.length ? h2('지금 결정이 필요한 것') + waiting.map((c: any) => {
      const d = stepDef(c.current_step);
      return p(`• <a href="${esc(base)}/admin/contents/${c.id}">${esc(c.topic || c.slug)}</a> — <b>${d.no} ${d.label}</b>`);
    }).join('') : '',
    Object.keys(doneByContent).length ? h2('오늘 끝난 일') + Object.entries(doneByContent).map(([cid, rows]) => {
      const c = byId[cid];
      const items = rows.sort((a, b) => String(a.finished_at).localeCompare(String(b.finished_at)))
        .map((r) => `${stepDef(r.step).no} ${stepDef(r.step).label}(${r.state === 'approved' ? (r.decided_by === 'ai' ? 'AI 승인' : r.decided_by === 'auto' ? '자동' : '승인') : STATE_KO[r.state]})`);
      return p(`<b>${esc(c?.topic || c?.slug || cid.slice(0, 8))}</b><br><span style="color:#4a5578">${esc(items.join(' → '))}</span>`);
    }).join('') : '',
    active.length ? h2('진행 현황') + active.slice(0, 8).map((c: any) => p(`<a href="${esc(base)}/admin/contents/${c.id}">${esc(c.topic || c.slug)}</a>`) + progress(stOf(c.id), c.current_step)).join('') : '',
    publishedToday.length ? h2('오늘 게시') + publishedToday.map((c: any) => p(`• ${esc(c.topic || c.slug)} ${c.youtube_id ? `— <a href="https://youtube.com/shorts/${esc(c.youtube_id)}">유튜브</a>` : ''} · <a href="${esc(base)}/l/${esc(c.slug)}">랜딩</a> · <a href="${esc(base)}/policy/${esc(c.slug)}">정보글</a>`)).join('') : '',
    h2('SOP 학습') + p(`아직 반영하지 않은 학습 재료(좋은 예·수정 예·아쉬운 예): <b>${exUnused || 0}개</b>`) +
      (props || []).map((x: any) => p(`• ${stepDef(x.step).no} ${stepDef(x.step).label} — ${x.status === 'pending' ? '<b>검토 대기</b>' : x.status === 'applied' ? '반영됨' : '거절'}: ${esc(String(x.summary || '').slice(0, 120))}`)).join(''),
  ].join('');

  const text = [
    `오늘의 정책자금 공장 · ${date} 요약`, `결정 대기 ${waiting.length} · 끝난 단계 ${(done || []).length} · 게시 ${publishedToday.length} · 신청 ${leads || 0}`,
    ...waiting.map((c: any) => `- 결정 필요: ${c.topic || c.slug} (${stepDef(c.current_step).label}) ${base}/admin/contents/${c.id}`),
    `${base}/admin`,
  ].join('\n');
  return { subject: `[오늘의 정책자금] ${date} 공장 요약 — 결정 대기 ${waiting.length}건`, html: layout({ title: `${date} 공장 요약`, pre: `결정 대기 ${waiting.length}건 · 게시 ${publishedToday.length}편 · 신청 ${leads || 0}건`, body, cta: { label: '현황판 열기', url: `${base}/admin` } }), text };
}

