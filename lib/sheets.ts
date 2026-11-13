import { google } from 'googleapis';

/**
 * 구글 시트에 행 추가 — 두 방식 중 설정된 것
 *  1) 서비스 계정: GOOGLE_SERVICE_ACCOUNT_JSON(환경변수) + 설정 sheets_id (시트를 서비스 계정 이메일에 '편집자'로 공유)
 *  2) Apps Script 웹앱: 설정 sheets_webhook + sheets_secret (integrations/google-sheets/Code.gs)
 * 탭이 없으면 만들고 첫 줄에 머리글을 쓴다.
 */
const headerDone = new Set<string>();

export function sheetsMode(s: any) {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && s.sheets_id) return 'service_account';
  if (s.sheets_webhook) return 'apps_script';
  return null;
}

const cell = (v: any) => {
  if (v == null) return '';
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return t.length > 45000 ? t.slice(0, 45000) + '…(잘림)' : t; // 셀 한도 50,000자
};

export async function appendRows(tab: string, header: string[], rows: any[][], s: any) {
  if (!rows.length) return 0;
  const values = rows.map((r) => r.map(cell));
  const mode = sheetsMode(s);
  if (mode === 'apps_script') {
    const r = await fetch(s.sheets_webhook, {
      method: 'POST', redirect: 'follow', signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'text/plain;charset=utf-8' }, // Apps Script 는 preflight 없는 text/plain 이 안전
      body: JSON.stringify({ secret: s.sheets_secret || '', sheet: tab, header, rows: values }),
    });
    const t = await r.text();
    let j: any = {};
    try { j = JSON.parse(t); } catch { /* HTML 오류 페이지 */ }
    if (!r.ok || j.ok === false || !('ok' in j)) throw new Error(`Apps Script ${r.status}: ${j.error || t.slice(0, 160)}`);
    return values.length;
  }
  if (mode === 'service_account') {
    const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });
    const id = s.sheets_id;
    const key = `${id}:${tab}`;
    if (!headerDone.has(key)) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties.title' });
      const exists = (meta.data.sheets || []).some((x) => x.properties?.title === tab);
      if (!exists) await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }] } });
      const first = exists ? await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${tab}!1:1` }) : null;
      if (!first?.data.values?.length) await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `${tab}!A1`, valueInputOption: 'RAW', requestBody: { values: [header] } });
      headerDone.add(key);
    }
    await sheets.spreadsheets.values.append({ spreadsheetId: id, range: `${tab}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values } });
    return values.length;
  }
  throw new Error('구글 시트 설정이 없습니다 (서비스 계정 + 시트 ID, 또는 Apps Script 웹앱 URL)');
}
