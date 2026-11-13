import { STATE_KO, STEP_DEFS, stepDef, type StepKey } from './steps';

/** 메일 발송: RESEND_API_KEY 가 있으면 Resend, 없으면 SMTP(SMTP_HOST…, 예: Gmail 앱 비밀번호) */
export async function sendMail(m: { to: string[]; subject: string; html: string; text: string }) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || '';
  if (!m.to.length) throw new Error('받는 사람이 없습니다');
  if (process.env.RESEND_API_KEY) {
    const r = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: m.to, subject: m.subject, html: m.html, text: m.text }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return 'resend';
  }
  if (process.env.SMTP_HOST) {
    const nodemailer = (await import('nodemailer')).default;
    const port = Number(process.env.SMTP_PORT || 465);
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 15000,
    });
    await t.sendMail({ from, to: m.to.join(', '), subject: m.subject, html: m.html, text: m.text });
    return 'smtp';
  }
  throw new Error('메일 발송 설정이 없습니다 (RESEND_API_KEY 또는 SMTP_HOST)');
}

// ── 템플릿 (메일 클라이언트 호환: 표 + 인라인 스타일) ────────────────────
export const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const C = { navy: '#0B1B3F', yellow: '#FFD400', ink: '#111a33', mute: '#6b7594', line: '#e3e7f1', bg: '#f4f6fb', ok: '#14845b', bad: '#c0392b', warn: '#8a6100' };
const DOT: Record<string, string> = { pending: '#cfd5e4', running: '#1739a6', review: '#f0b400', approved: '#14845b', rejected: '#c0392b', failed: '#c0392b', stale: '#9333ea' };

export function layout(o: { title: string; pre?: string; badge?: { text: string; color: string }; body: string; cta?: { label: string; url: string }; foot?: string }) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.title)}</title></head>
<body style="margin:0;background:${C.bg};font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif;color:${C.ink}">
<span style="display:none;max-height:0;overflow:hidden">${esc(o.pre || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:14px;overflow:hidden;border:1px solid ${C.line}">
<tr><td style="background:${C.navy};padding:18px 24px;color:#fff;font-size:15px;font-weight:800">오늘의 <span style="color:${C.yellow}">정책자금</span> 공장</td></tr>
<tr><td style="padding:24px">
${o.badge ? `<span style="display:inline-block;background:${o.badge.color};color:#fff;font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px">${esc(o.badge.text)}</span>` : ''}
<h1 style="font-size:20px;line-height:1.4;margin:10px 0 16px">${esc(o.title)}</h1>
${o.body}
${o.cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr><td style="background:${C.navy};border-radius:10px"><a href="${esc(o.cta.url)}" style="display:inline-block;padding:13px 22px;color:#fff;font-weight:800;text-decoration:none;font-size:15px">${esc(o.cta.label)} →</a></td></tr></table>` : ''}
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid ${C.line};color:${C.mute};font-size:12px;line-height:1.6">${o.foot || '이 메일은 관리자 [설정 · 알림]에서 받는 사람과 알림 종류를 바꿀 수 있습니다.'}</td></tr>
</table></td></tr></table></body></html>`;
}

export const h2 = (t: string) => `<h2 style="font-size:15px;margin:22px 0 8px;padding-left:8px;border-left:4px solid ${C.yellow}">${esc(t)}</h2>`;
export const p = (t: string, color = C.ink) => `<p style="margin:6px 0;line-height:1.65;font-size:14px;color:${color}">${t}</p>`;

export function kv(rows: [string, any][]) {
  const r = rows.filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
  if (!r.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">${r.map(([k, v]) =>
    `<tr><td style="padding:7px 10px 7px 0;color:${C.mute};vertical-align:top;width:110px;border-bottom:1px solid ${C.line}">${esc(k)}</td><td style="padding:7px 0;line-height:1.6;border-bottom:1px solid ${C.line}">${Array.isArray(v) ? v.map((x) => `• ${esc(x)}`).join('<br>') : String(v).startsWith('<') ? v : esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>`;
}

/** 공정 진행 막대: 10단계 상태 */
export function progress(states: Record<string, string>, current?: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="2" style="table-layout:fixed;margin:4px 0 6px"><tr>${STEP_DEFS.map((d) => {
    const st = states[d.key] || 'pending';
    return `<td style="text-align:center;font-size:10px;color:${d.key === current ? C.ink : C.mute};font-weight:${d.key === current ? 800 : 400}">
<div style="height:8px;border-radius:4px;background:${DOT[st]};margin-bottom:4px"></div>${d.no}<br>${esc(d.label.replace('음성·자막·BGM·렌더', '렌더').replace('업로드·공개', '업로드'))}</td>`;
  }).join('')}</tr></table>
<p style="margin:0;font-size:11px;color:${C.mute}">초록 승인 · 노랑 검수 대기 · 파랑 작업 중 · 보라 재작업 필요 · 빨강 반려/실패 · 회색 대기</p>`;
}

export function checksHtml(checks: { level: string; msg: string }[] = []) {
  const r = checks.filter((c) => c.level !== 'ok');
  if (!r.length) return p(`<span style="color:${C.ok}">✓ 규칙 검사 통과</span>`);
  return r.map((c) => p(`<span style="color:${c.level === 'error' ? C.bad : C.warn}">${c.level === 'error' ? '✕' : '!'} ${esc(c.msg)}</span>`)).join('');
}

const cut = (s: any, n = 160) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n) + '…' : t; };

/** 단계별 산출물 요약 (LLM 호출 없이 결정적으로) */
export function summarize(step: StepKey, out: any, c: any): [string, any][] {
  if (out == null) return [];
  switch (step) {
    case 'research': return [
      ['주제', out.topic], ['왜 지금', out.angle],
      ['사업', [out.program?.name, out.program?.agency].filter(Boolean).join(' · ')],
      ['한도·금리', [out.program?.amount, out.program?.rate].filter(Boolean).join(' / ')],
      ['접수 기간', out.program?.deadline || out.program?.period],
      ['근거', (out.facts || []).slice(0, 4).map((f: any) => `${cut(f.claim, 70)} (${f.source_title || f.source_url || '출처 없음'})`)],
      ['확인 필요', (out.risk_notes || []).slice(0, 3)],
    ];
    case 'plan': return [
      ['선택한 훅', out.chosen_hook], ['다른 후보', (out.hook_options || []).map((h: any) => typeof h === 'string' ? h : `${h.type}: ${h.text}`).slice(0, 3)],
      ['무드', out.mood], ['구성', `${(out.structure || []).length}장면 · ${(out.structure || []).reduce((n: number, x: any) => n + Number(x.seconds || 0), 0)}초`],
      ['장면', (out.structure || []).map((x: any) => `${x.id} ${x.role}: ${cut(x.point, 50)}`)],
    ];
    case 'script': return [
      ['내레이션', (out.scenes || []).map((x: any) => x.narration).join(' ')],
      ['분량', `${out.total_chars ?? '-'}자 (공백 제외) · ${(out.scenes || []).length}장면`],
    ];
    case 'offer': return [
      ['이벤트명', out.event_name], ['연결 문장', out.bridge], ['주력 혜택', out.main_benefit], ['보조 혜택', out.benefits],
      ['마감', out.deadline_label ? `${out.deadline_label} (근거: ${out.deadline_source || '-'})` : '없음'], ['신청 부담', out.effort], ['버튼', out.cta],
    ];
    case 'landing': return [
      ['헤드라인', out.hero_title], ['서브', out.hero_lead], ['이벤트', out.event_title], ['버튼', out.cta_label || out.form_button],
      ['슬롯', `${Object.keys(out).length}개 채움`],
    ];
    case 'design': return [
      ['폰트', out.fonts ? `${out.fonts.title} / ${out.fonts.body}` : ''],
      ['장면 그래픽', (out.scenes || []).map((x: any) => `${x.id} [${x.layout}·${x.motion || '-'}] ${x.value ? x.value + (x.unit || '') + ' ' : ''}${x.headline}`)],
    ];
    case 'copy': return [
      ['유튜브 제목', out.youtube?.title], ['유튜브 댓글', out.youtube?.comment],
      ['인스타 캡션 첫 줄', String(out.instagram?.caption || '').split('\n')[0]],
    ];
    case 'post': return [
      ['제목', out.title], ['메타 설명', out.meta_description], ['분량', `${String(out.body_markdown || '').replace(/\s/g, '').length}자 · FAQ ${(out.faq || []).length}개`],
      ['키워드', (out.keywords || []).slice(0, 8).join(', ')],
    ];
    case 'render': return [
      ['영상 길이', c.audio?.totalSec ? `${Number(c.audio.totalSec).toFixed(1)}초` : ''],
      ['영상', c.video_url ? `<a href="${esc(c.video_url)}">영상 보기</a>` : ''],
      ['썸네일', c.thumbnail_url ? `<img src="${esc(c.thumbnail_url)}" width="160" style="border-radius:8px;display:block" alt="">` : ''],
    ];
    case 'publish': return [
      ['유튜브', c.youtube_id ? `<a href="https://youtube.com/shorts/${esc(c.youtube_id)}">youtube.com/shorts/${esc(c.youtube_id)}</a> — 스튜디오에서 댓글 고정 필요` : '게시 안 함'],
      ['인스타', c.instagram_id ? `게시됨 (미디어 ${esc(c.instagram_id)})` : '게시 안 함'],
    ];
  }
  return [];
}

const NEXT: Record<string, string> = {
  step_review: '작업대에서 산출물을 확인하고 승인 / 수정 지시 / 반려 중 하나를 결정하세요. 마음에 들면 👍 좋은 예로 저장하면 SOP 학습에 쓰입니다.',
  step_done: '자동으로 다음 단계가 이어집니다. 확인만 하시면 됩니다.',
  step_failed: '작업대에서 오류를 확인하고 다시 실행하세요. AI 제공자 문제면 설정 → AI 제공자 상태를 확인하세요.',
  render_done: '영상을 끝까지 보고 승인하거나, 고칠 단계(대사·디자인)를 지정해 반려하세요.',
  published: '유튜브 스튜디오에서 방금 단 댓글을 "고정"하세요. 내일 조회·신청 수를 작업 효율에서 확인하세요.',
};

export function stepEmail(event: string, c: any, stepStates: Record<string, any>, step: StepKey, output: any, site: string, message?: string) {
  const d = stepDef(step);
  const row = stepStates[step] || {};
  const topic = c.topic || c.slug;
  const by = row.decided_by === 'ai' ? 'AI 승인' : row.decided_by === 'auto' ? '자동 통과' : '';
  const kind: Record<string, [string, string]> = {
    step_review: ['결정 필요', C.warn], step_done: [`완료${by ? ' · ' + by : ''}`, C.ok], step_failed: ['실패', C.bad],
    render_done: ['영상 렌더 완료', '#1739a6'], published: ['게시 완료', C.ok],
  };
  const [badge, color] = kind[event] || ['알림', C.mute];
  const states = Object.fromEntries(STEP_DEFS.map((x) => [x.key, stepStates[x.key]?.state || 'pending']));
  const nextStep = STEP_DEFS.find((x) => states[x.key] !== 'approved');
  const subject = `[오늘의 정책자금] ${badge} · ${d.no} ${d.label} — ${cut(topic, 40)}`;

  const body = [
    p(`<b>${esc(topic)}</b> <span style="color:${C.mute}">${esc(c.slug)}</span>`),
    h2('일의 흐름'), progress(states, step),
    p(`지금 위치: <b>${nextStep ? `${nextStep.no} ${nextStep.label} — ${STATE_KO[states[nextStep.key]]}` : '모든 단계 완료'}</b>`),
    h2(`이번에 끝난 일 · ${d.no} ${d.label}`),
    message ? p(`<span style="color:${C.bad}">${esc(message)}</span>`) : '',
    kv(summarize(step, output, c)),
    row.provider ? p(`<span style="color:${C.mute};font-size:12px">작성: ${esc(row.provider)}${row.model ? ' / ' + esc(row.model) : ''} · 시도 ${row.attempts ?? 1}회${row.work_ms ? ` · ${Math.round(Number(row.work_ms) / 1000)}초` : ''}</span>`) : '',
    row.checks?.length ? h2('규칙 검사') + checksHtml(row.checks) : '',
    row.ai_review ? h2(`AI 검수 · ${row.ai_review.verdict === 'pass' ? '통과' : '수정 필요'} ${row.ai_review.score ?? ''}점`) + p(esc(row.ai_review.summary || '')) : '',
    row.ai_notes?.opinion ? h2('AI 의견') + p(esc(row.ai_notes.opinion)) + (row.ai_notes.questions?.length ? kv([['질문', row.ai_notes.questions]]) : '') : '',
    h2('다음 할 일'), p(NEXT[event] || ''),
  ].join('');

  const text = [
    subject, '', `일의 흐름: ${STEP_DEFS.map((x) => `${x.no}${states[x.key] === 'approved' ? '✓' : states[x.key] === 'review' ? '?' : states[x.key] === 'failed' ? '✕' : '·'}`).join(' ')}`,
    '', `이번에 끝난 일: ${d.no} ${d.label}`, ...summarize(step, output, c).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(' / ') : String(v).replace(/<[^>]+>/g, '')}`),
    message ? `\n오류: ${message}` : '', '', `다음 할 일: ${NEXT[event] || ''}`, `${site}/admin/contents/${c.id}`,
  ].join('\n');

  return { subject, html: layout({ title: `${d.no} ${d.label} ${badge}`, pre: `${topic} — ${badge}`, badge: { text: badge, color }, body, cta: { label: event === 'step_review' || event === 'render_done' ? '작업대에서 결정하기' : '작업대 열기', url: `${site}/admin/contents/${c.id}` } }), text };
}

export function proposalEmail(event: 'sop_proposal' | 'sop_applied', step: StepKey, proposal: any, site: string, extra: any = {}) {
  const d = stepDef(step);
  const changes: any[] = proposal.changes || [];
  const OP: Record<string, string> = { add: '추가', modify: '수정', remove: '삭제' };
  const applied: number[] | undefined = extra.applied;
  const list = changes.map((c, i) => {
    const on = !applied || applied.includes(i);
    return `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.line};font-size:13px;line-height:1.6;${on ? '' : 'opacity:.45'}">
<b>${i + 1}. [${OP[c.op] || c.op}] ${esc(c.section)}</b>${c.warn ? ` <span style="color:${C.warn}">⚠ ${esc(c.warn)}</span>` : ''}<br>
${c.target ? `<span style="color:${C.bad};text-decoration:line-through">${esc(c.target)}</span><br>` : ''}${c.text ? `<span style="color:${C.ok}">${esc(c.text)}</span><br>` : ''}
<span style="color:${C.mute}">${esc(c.reason || '')}${c.evidence?.length ? ` · 근거 예시 #${c.evidence.join(', #')}` : ''}</span></td></tr>`;
  }).join('');
  const title = event === 'sop_proposal'
    ? `${d.no} ${d.label} SOP 학습 제안 (변경 ${changes.length}건)`
    : `${d.no} ${d.label} SOP 보완 반영 (${applied?.length ?? changes.length}건${extra.by === 'auto' ? ', 자동' : ''})`;
  const body = [
    p(esc(proposal.summary || '')),
    h2(event === 'sop_proposal' ? '제안된 변경' : '반영된 변경 (흐린 항목은 제외)'),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list || `<tr><td>${p('변경 없음')}</td></tr>`}</table>`,
    extra.conflicts?.length ? p(`<span style="color:${C.warn}">충돌로 건너뛴 변경 ${extra.conflicts.length}건 — 관리자에서 확인하세요.</span>`) : '',
    h2('다음 할 일'),
    p(event === 'sop_proposal' ? '[SOP · AI 제어]에서 변경을 골라 반영하거나 문구를 고쳐 반영하세요. 거절해도 기존 SOP 는 그대로입니다.' : '다음 실행부터 바뀐 SOP 가 적용됩니다. 마음에 들지 않으면 [SOP · AI 제어] → 학습 제안에서 "되돌리기".'),
  ].join('');
  return {
    subject: `[오늘의 정책자금] ${title}`,
    html: layout({ title, badge: { text: event === 'sop_proposal' ? 'SOP 학습' : 'SOP 반영', color: '#6b21a8' }, body, cta: { label: 'SOP 열기', url: `${site}/admin/sop?step=${step}` } }),
    text: `${title}\n\n${proposal.summary || ''}\n\n${changes.map((c, i) => `${i + 1}. [${OP[c.op]}] ${c.section}: ${c.target ? c.target + ' → ' : ''}${c.text || ''} (${c.reason || ''})`).join('\n')}\n\n${site}/admin/sop?step=${step}`,
  };
}
