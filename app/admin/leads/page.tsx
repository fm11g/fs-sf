'use client';
import { useEffect, useState } from 'react';
import { sbBrowser } from '@/lib/supabase/client';

export default function Leads() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    sbBrowser().from('leads').select('*').order('created_at', { ascending: false }).limit(200).then(({ data }) => setRows(data || []));
  }, []);
  const csv = () => {
    const head = ['일시', '이름', '연락처', '업체', '콘텐츠', 'utm_source'];
    const body = rows.map((r) => [new Date(r.created_at).toLocaleString('ko-KR'), r.name, r.phone, r.company || '', r.content_slug || '', r.utm?.utm_source || '']);
    const text = '﻿' + [head, ...body].map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = 'leads.csv'; a.click();
  };
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}><h1>신청 내역</h1><button onClick={csv}>CSV 내려받기</button></div>
      <div className="card">
        <table>
          <thead><tr><th>일시</th><th>이름</th><th>연락처</th><th>업체</th><th>유입 콘텐츠</th><th>채널</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td className="mute">{new Date(r.created_at).toLocaleString('ko-KR')}</td><td>{r.name}</td><td>{r.phone}</td><td>{r.company}</td>
                <td>{r.content_slug}</td><td>{r.utm?.utm_source || '-'}</td></tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="mute">아직 신청이 없습니다. 설정의 `lead_webhook`에 URL을 넣으면 접수 즉시 기존 DB 시스템으로도 전달됩니다.</p>}
      </div>
    </>
  );
}
