'use client';
import { useEffect, useRef, useState } from 'react';
import { deleteAsset, listAssets, uploadAsset, type Asset } from '@/lib/assets-client';
import { api } from '@/lib/api';

const mb = (n?: number) => (n ? `${(n / 1048576).toFixed(1)}MB` : '');

/** 첨부 썸네일 (이미지·영상) */
export function AssetThumb({ a, size = 64 }: { a: Asset; size?: number }) {
  return a.kind === 'video'
    ? <video src={`${a.url}#t=0.5`} muted preload="metadata" style={{ width: size, height: size, objectFit: 'cover', borderRadius: 6, background: '#0b1220', display: 'block' }} />
    : <img src={a.url} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: 6, display: 'block' }} />;
}

/**
 * 피드백 첨부 — 이미지·영상을 올려 수정 지시와 함께 보냄.
 * 이미지는 AI 가 직접 보고(비전), 영상은 장면 자료화면(footage) 후보로 전달. 파일은 스토리지 contents/{slug}/assets 에 저장 → 렌더 워커가 씀
 */
export function FeedbackAttach({ contentId, step, selected, setSelected, disabled }: {
  contentId: string; step: string; selected: Asset[]; setSelected: (a: Asset[]) => void; disabled?: boolean;
}) {
  const [prog, setProg] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const out: Asset[] = [];
    try {
      for (const f of Array.from(files).slice(0, 6)) out.push(await uploadAsset(contentId, f, { step }, setProg));
    } catch (e: any) { alert(e.message); }
    setProg('');
    setSelected([...selected, ...out]);
  };
  return (
    <div className="fb-attach" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
      <input ref={input} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <button type="button" disabled={disabled || !!prog} onClick={() => input.current?.click()}>📎 이미지·영상 첨부</button>
      {prog && <span className="mute" style={{ fontSize: 12 }}>{prog}</span>}
      {selected.map((a) => (
        <span key={a.id} className="fb-chip" title={a.name}>
          <AssetThumb a={a} size={40} />
          <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.kind === 'video' ? '🎬' : '🖼'} {a.name}</span>
          <button type="button" onClick={() => setSelected(selected.filter((x) => x.id !== a.id))} title="이번 지시에서 빼기 (파일은 첨부함에 남음)">✕</button>
        </span>
      ))}
      {!selected.length && !prog && <span className="mute" style={{ fontSize: 12 }}>끌어다 놓기 가능 · 이미지=AI가 보고 반영 · 영상=장면 자료화면으로 넣기</span>}
      <style>{`
        .fb-attach{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}
        .fb-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line,#dde3ee);border-radius:8px;padding:3px 6px;font-size:12px;background:#fff}
        .fb-chip button{padding:0 6px;font-size:11px}
      `}</style>
    </div>
  );
}

/** 이 콘텐츠의 첨부함 — 올린 파일 전체(설명 수정·삭제·주소 복사). 설명은 AI 에게 그대로 전달됨 */
export function AssetLibrary({ contentId, canWork, refreshKey }: { contentId: string; canWork: boolean; refreshKey?: number }) {
  const [list, setList] = useState<Asset[] | null>(null);
  const [open, setOpen] = useState(false);
  const [prog, setProg] = useState('');
  const load = () => listAssets(contentId).then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, [contentId, refreshKey]);
  if (!list) return null;
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>📁 첨부 파일 <span className="mute" style={{ fontWeight: 400, fontSize: 13 }}>{list.length}개 · 피드백 첨부·장면 자료화면 · 렌더 워커가 이 파일을 씀</span></h2>
        <div className="row">
          {canWork && <label className="btn-like"><input type="file" hidden multiple accept="image/*,video/mp4,video/quicktime,video/webm" onChange={async (e) => {
            const fs = e.target.files; if (!fs) return;
            try { for (const f of Array.from(fs)) await uploadAsset(contentId, f, {}, setProg); } catch (er: any) { alert(er.message); }
            setProg(''); e.target.value = ''; load();
          }} /><span>＋ 자료 올리기</span></label>}
          <button onClick={() => setOpen(!open)}>{open ? '접기' : '펼치기'}</button>
        </div>
      </div>
      {prog && <p className="mute">{prog}</p>}
      {open && (
        <div className="asset-grid">
          {list.map((a) => (
            <div key={a.id} className="asset-item">
              <a href={a.url} target="_blank" rel="noreferrer"><AssetThumb a={a} size={120} /></a>
              <div style={{ fontSize: 12 }}><b>#{a.id}</b> {a.kind === 'video' ? `🎬 ${a.duration ? `${a.duration}초 · ` : ''}` : '🖼 '}{a.width ? `${a.width}×${a.height} · ` : ''}{mb(a.size)}</div>
              <div className="mute" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>{a.name}{a.step ? ` · ${a.step} 피드백` : ''}</div>
              <input disabled={!canWork} defaultValue={a.note || ''} placeholder="설명 (AI 에게 전달)" style={{ fontSize: 12 }}
                onBlur={(e) => e.target.value !== (a.note || '') && api(`/api/contents/${contentId}/assets`, { action: 'update', id: a.id, note: e.target.value })} />
              <div className="row" style={{ gap: 4 }}>
                <button style={{ fontSize: 11 }} onClick={() => navigator.clipboard.writeText(a.url)}>주소 복사</button>
                {canWork && <button style={{ fontSize: 11 }} onClick={async () => { if (confirm('이 파일을 지울까요? 장면에 넣어 둔 경우 그 장면에서도 빠집니다.')) { await deleteAsset(contentId, a.id); load(); } }}>삭제</button>}
              </div>
            </div>
          ))}
          {!list.length && <p className="mute">아직 없음 — 피드백에 첨부하거나 [＋ 자료 올리기]로 영상·이미지를 올리면 여기 모입니다. 편집기 [장면] 탭에서 장면에 넣을 수 있습니다.</p>}
        </div>
      )}
      <style>{`
        .asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:10px}
        .asset-item{display:grid;gap:4px;align-content:start}
        .btn-like{display:inline-flex;align-items:center;border:1px solid var(--line,#dde3ee);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px;background:#fff}
      `}</style>
    </div>
  );
}
