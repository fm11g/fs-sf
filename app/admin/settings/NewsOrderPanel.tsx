'use client';
import { DEFAULT_FLOW_ORDER } from '@/lib/motion-guide';

const LABEL: Record<string, string> = {
  breaking: '속보', stat: '핵심 숫자', points: '꼭 알아야 할 3가지', compare: '일반 대출과 비교', quote: '기관 인용',
  document: '공고문 핵심', timeline: '접수 일정', apply: '신청 방법', article: '기사 카드', footage: '자료화면(첨부 영상)',
};
const ALL = Object.keys(LABEL);

/** 설정 > 뉴스 장면 순서 — 다음 기획·대사가 따르는 순서. 편집기에서 장면을 옮겨 저장해도 여기 바뀜 */
export default function NewsOrderPanel({ v, setV, onSave }: { v: any; setV: (x: any) => void; onSave: () => void }) {
  const order: string[] = v.news_flow_order?.length ? v.news_flow_order : DEFAULT_FLOW_ORDER;
  const custom = !!v.news_flow_order?.length;
  const set = (o: string[]) => setV({ ...v, news_flow_order: o });
  const move = (i: number, d: number) => { const o = [...order]; const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; set(o); };
  const off = ALL.filter((r) => !order.includes(r));
  return (
    <div className="card">
      <h2>📰 뉴스 장면 순서 <span className="mute" style={{ fontWeight: 400, fontSize: 13 }}>{custom ? '운영자 지정' : '기본값'} — 다음 기획·대사가 이 순서로 장면을 짭니다</span></h2>
      <p className="mute" style={{ marginTop: -6 }}>영상 편집기에서 장면을 끌어 옮기고 저장하면 그 순서가 여기에 저장됩니다. 여기서 직접 바꿔도 됩니다. 주제에 안 맞는 장면은 AI 가 빼지만 남은 장면의 순서는 지킵니다.</p>
      <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 4, maxWidth: 520 }}>
        {order.map((r, i) => (
          <li key={r} className="row" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', justifyContent: 'space-between' }}>
            <span><b>{i + 1}</b> {LABEL[r] || r} <span className="mute" style={{ fontSize: 12 }}>{r}</span></span>
            <span className="row" style={{ gap: 4 }}>
              <button disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
              <button disabled={i === order.length - 1} onClick={() => move(i, 1)}>▼</button>
              <button disabled={order.length <= 3} onClick={() => set(order.filter((x) => x !== r))} title="기본 순서에서 빼기 (선택 장면으로)">빼기</button>
            </span>
          </li>
        ))}
      </ol>
      {off.length > 0 && <div className="row" style={{ marginTop: 8, gap: 6 }}><span className="mute">선택 장면(필요할 때만):</span>{off.map((r) => <button key={r} onClick={() => set([...order.slice(0, -1), r, order[order.length - 1]])}>＋ {LABEL[r]}</button>)}</div>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="pri" onClick={onSave}>저장</button>
        {custom && <button onClick={() => setV({ ...v, news_flow_order: [] })}>기본 순서로 되돌리기</button>}
      </div>
      {!!v.news_flow_history?.length && (
        <details style={{ marginTop: 10 }}>
          <summary className="mute">순서 변경 이력 ({v.news_flow_history.length})</summary>
          <ul style={{ fontSize: 12, margin: '6px 0 0' }}>
            {v.news_flow_history.map((h: any, i: number) => (
              <li key={i}>{new Date(h.at).toLocaleString('ko-KR')} · {h.by}{h.from ? ` · ${h.from} 편집에서` : ''} — {h.order.map((r: string) => LABEL[r] || r).join(' → ')} <a href="#" onClick={(e) => { e.preventDefault(); set(h.order); }}>이 순서로</a></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
