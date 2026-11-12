import * as cheerio from 'cheerio';

export type Slot = { key: string; label: string; max: number | null; attr: string | null; current: string };

/** 글자수: 공백 포함, 줄바꿈(\n) 제외 */
export const charLen = (v: string) => [...v.replace(/\n/g, '')].length;

/**
 * 템플릿 규칙
 *   <h1 data-slot="hero_title" data-max="18" data-label="메인 헤드라인">기존 문구</h1>
 *   <meta name="description" content="..." data-slot="meta_desc" data-slot-attr="content" data-max="90">
 */
export function parseSlots(html: string): Slot[] {
  const $ = cheerio.load(html);
  const out: Slot[] = [];
  $('[data-slot]').each((_, el) => {
    const $el = $(el);
    const attr = $el.attr('data-slot-attr') || null;
    const current = attr ? $el.attr(attr) || '' : $el.html()?.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() || '';
    out.push({
      key: $el.attr('data-slot')!,
      label: $el.attr('data-label') || $el.attr('data-slot')!,
      max: $el.attr('data-max') ? Number($el.attr('data-max')) : null,
      attr,
      current,
    });
  });
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function fillSlots(html: string, values: Record<string, string>, opts: { assetBase?: string | null; canonical?: string; slug?: string; origin?: string } = {}) {
  const $ = cheerio.load(html);
  $('[data-slot]').each((_, el) => {
    const $el = $(el);
    const key = $el.attr('data-slot')!;
    const v = values[key];
    if (v == null) return;
    const attr = $el.attr('data-slot-attr');
    if (attr) $el.attr(attr, v);
    else $el.html(esc(v).replace(/\n/g, '<br>'));
  });
  if (opts.assetBase && !$('head base').length) $('head').prepend(`<base href="${opts.assetBase}">`);
  if (opts.canonical) {
    $('link[rel="canonical"]').remove();
    $('head').append(`<link rel="canonical" href="${opts.canonical}">`);
  }
  if (opts.slug) {
    // 신청폼·조회 집계용: window.__TPF + 조회 비콘 + CTA 클릭 비콘
    const o = opts.origin || '';
    $('body').append(`<script>window.__TPF={slug:${JSON.stringify(opts.slug)},api:${JSON.stringify(o)}};(function(){var u=__TPF.api+'/api/track?c='+encodeURIComponent(__TPF.slug);try{navigator.sendBeacon(u+'&t=view')}catch(e){}document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-cta]');if(a)try{navigator.sendBeacon(u+'&t=cta')}catch(_){}});})();</script><script src="${o}/sync.js" defer></script>`);
  }
  return $.html();
}

export function validate(slots: Slot[], values: Record<string, string>) {
  return slots
    .filter((s) => s.max && values[s.key] != null && charLen(values[s.key]) > s.max)
    .map((s) => ({ key: s.key, max: s.max!, value: values[s.key], len: charLen(values[s.key]) }));
}
