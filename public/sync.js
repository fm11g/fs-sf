/*
 * 오늘의 정책자금 — 외부 랜딩 연동 (문구 교체 + 신청폼 + 조회 집계)
 * 기존 사이트(예: govbizfund.co.kr) <body> 끝에 추가:
 *   <script src="https://YOUR-SITE/sync.js" data-slug="today" defer></script>
 * - data-slot 요소의 문구를 오늘 숏폼(또는 ?utm_campaign=슬러그)에 맞게 교체
 * - <form data-tpf-form> 을 /api/leads 로 접수 (name, phone, company, memo, consent 필드명 사용)
 * - data-cta 요소 클릭과 페이지 조회를 집계
 */
(function () {
  var me = document.currentScript;
  var origin = new URL(me.src).origin;
  var qs = new URLSearchParams(location.search);
  var slug = qs.get('c') || qs.get('utm_campaign') || me.getAttribute('data-slug') || 'today';

  function bindForms() {
    document.querySelectorAll('form[data-tpf-form]').forEach(function (f) {
      if (f.__tpf) return; f.__tpf = 1;
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = Object.fromEntries(new FormData(f).entries());
        var utm = {}; qs.forEach(function (v, k) { if (k.indexOf('utm_') === 0) utm[k] = v; });
        var btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
        var msg = f.querySelector('[data-tpf-msg]');
        fetch(window.__TPF.api + '/api/leads', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: d.name, phone: d.phone, company: d.company, memo: d.memo, consent: !!d.consent, website: d.website, slug: window.__TPF.slug, utm: utm })
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (x) {
            if (x.ok) { f.reset(); if (msg) msg.textContent = f.getAttribute('data-done') || '신청이 접수되었습니다. 곧 연락드리겠습니다.'; }
            else if (msg) msg.textContent = x.j.error || '접수에 실패했습니다.';
          })
          .catch(function () { if (msg) msg.textContent = '네트워크 오류입니다. 다시 시도해 주세요.'; })
          .finally(function () { if (btn) btn.disabled = false; });
      });
    });
  }

  // /l/슬러그 로 서비스되는 페이지는 서버가 이미 문구를 채우고 __TPF 를 넣어 둠 → 폼만 연결
  if (window.__TPF) return bindForms();

  fetch(origin + '/api/landing/' + encodeURIComponent(slug))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      window.__TPF = { slug: d.slug || slug, api: origin };
      var v = d.values || {};
      document.querySelectorAll('[data-slot]').forEach(function (el) {
        var k = el.getAttribute('data-slot');
        if (v[k] == null) return;
        var attr = el.getAttribute('data-slot-attr');
        if (attr) el.setAttribute(attr, v[k]);
        else {
          el.textContent = '';
          String(v[k]).split('\n').forEach(function (line, i) {
            if (i) el.appendChild(document.createElement('br'));
            el.appendChild(document.createTextNode(line));
          });
        }
      });
      var u = origin + '/api/track?c=' + encodeURIComponent(window.__TPF.slug);
      try { navigator.sendBeacon(u + '&t=view'); } catch (e) {}
      document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('[data-cta]');
        if (a) try { navigator.sendBeacon(u + '&t=cta'); } catch (_) {}
      });
      bindForms();
    })
    .catch(function () { window.__TPF = { slug: slug, api: origin }; bindForms(); });
})();
