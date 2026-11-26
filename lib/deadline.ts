/**
 * 공고 마감일 글 → ISO (한국 시간) — 순수 함수
 *  '2026-12-15', '2026.12.15', '2026년 12월 15일 18:00까지', '12월 15일(월) 18시', '~12.15', '12/15 17시' …
 *  연도가 없으면 기준일 이후 가장 가까운 날짜. 시간이 없으면 그날 23:59:59. 못 읽으면 null ('예산 소진 시' 등)
 */
export function parseDeadline(text: unknown, ref: Date = new Date()): string | null {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s || /소진|상시|수시|미정|추후/.test(s) && !/\d{1,2}\s*[월./-]\s*\d{1,2}/.test(s)) return null;
  // 기간이면 마지막 날짜(마감)를 씀: "12.1 ~ 12.15"
  const part = s.includes('~') ? s.slice(s.lastIndexOf('~') + 1) : s;
  let y: number | null = null, mo: number | null = null, d: number | null = null;
  let m = /(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})/.exec(part);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?/.exec(part))) { mo = +m[1]; d = +m[2]; }
  if (!mo || !d || mo > 12 || d > 31) return null;
  let hh = 23, mi = 59, ss = 59;
  const t = /(오전|오후)?\s*(\d{1,2})\s*(?::|시)\s*(\d{2})?/.exec(part.replace(/^[^\d]*\d{4}\s*[년.\-/]\s*\d{1,2}\s*[월.\-/]\s*\d{1,2}\s*일?|^[^\d]*\d{1,2}\s*[월.\-/]\s*\d{1,2}\s*일?/, ''));
  if (t && Number(t[2]) <= 24) { hh = Number(t[2]) + (t[1] === '오후' && Number(t[2]) < 12 ? 12 : 0); mi = t[3] ? Number(t[3]) : 0; ss = 0; if (hh === 24) { hh = 23; mi = 59; ss = 59; } }
  const kstNow = new Date(ref.getTime() + 9 * 3600e3);
  const make = (yy: number) => new Date(`${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(ss).padStart(2, '0')}+09:00`);
  let out: Date;
  if (y) out = make(y);
  else {
    out = make(kstNow.getUTCFullYear());
    if (out.getTime() < ref.getTime() - 30 * 864e5) out = make(kstNow.getUTCFullYear() + 1); // 한 달 넘게 지난 날짜면 내년
  }
  return Number.isNaN(out.getTime()) ? null : out.toISOString();
}

/** 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:mm' (KST) → ISO */
export function isoKst(v: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(v ?? '').trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '23'}:${m[5] ?? '59'}:${m[4] ? '00' : '59'}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
