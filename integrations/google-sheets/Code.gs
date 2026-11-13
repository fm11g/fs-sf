/**
 * 오늘의 정책자금 → 구글 시트 수신 (Apps Script 웹앱)
 * 1) 기록할 구글 시트에서 [확장 프로그램] → [Apps Script] → 이 코드를 붙여넣기
 * 2) SECRET 을 임의의 긴 문자열로 바꾸기 (관리자 설정의 '시트 비밀값'과 같게)
 * 3) [배포] → [새 배포] → 유형 '웹 앱' · 실행: 나 · 액세스: 모든 사용자 → 웹앱 URL 복사
 * 4) 관리자 → 설정 → 데이터 내보내기 → Apps Script 웹앱 URL 에 붙여넣기 → 테스트
 * 탭(outputs · ratings · sop_changes · performance)은 처음 들어올 때 자동으로 만들어집니다.
 */
const SECRET = 'CHANGE-ME';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false, error: 'secret 불일치' });
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sh = ss.getSheetByName(d.sheet);
      if (!sh) { sh = ss.insertSheet(d.sheet); sh.setFrozenRows(1); }
      if (sh.getLastRow() === 0 && d.header && d.header.length) sh.getRange(1, 1, 1, d.header.length).setValues([d.header]).setFontWeight('bold');
      const rows = d.rows || [];
      if (rows.length) {
        const width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
        const norm = rows.map(function (r) { while (r.length < width) r.push(''); return r; });
        sh.getRange(sh.getLastRow() + 1, 1, norm.length, width).setValues(norm);
      }
      return out({ ok: true, appended: rows.length });
    } finally { lock.releaseLock(); }
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
