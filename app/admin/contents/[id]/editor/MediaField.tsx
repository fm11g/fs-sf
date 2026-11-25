'use client';
import { useEffect, useState } from 'react';
import { listAssets, uploadAsset, type Asset } from '@/lib/assets-client';
import { AssetThumb } from '../Attachments';
import { Field, Num, Seg } from './controls';

/**
 * 장면 자료(영상·이미지) — 첨부함에서 고르거나 바로 올리기.
 * 레이아웃이 '자료화면'이면 화면 안 틀에, 다른 레이아웃이면 배경으로 어둡게 깔림. 파일은 스토리지에 있어 렌더 워커가 그대로 씀
 */
export default function MediaField({ contentId, media, layout, set, canUpload }: {
  contentId: string; media: any; layout: string; set: (m: any | undefined, layout?: string) => void; canUpload: boolean;
}) {
  const [list, setList] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false);
  const [prog, setProg] = useState('');
  useEffect(() => { listAssets(contentId).then(setList).catch(() => {}); }, [contentId]);
  const pick = (a: Asset) => { set({ url: a.url, kind: a.kind, fit: 'cover', label: media?.label || '자료화면' }); setOpen(false); };
  const cur = media?.url ? list.find((a) => a.url === media.url) : null;

  return (
    <div className="media-field">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b style={{ fontSize: 13 }}>🎬 자료 (영상·이미지) {layout === 'footage' ? '— 화면 안 틀' : media?.url ? '— 배경(어둡게)' : ''}</b>
        <div className="row" style={{ gap: 4 }}>
          {!media?.url && layout !== 'footage' && list.some((a) => a.kind === 'video') && <button onClick={() => { const v = list.find((a) => a.kind === 'video')!; set({ url: v.url, kind: 'video', fit: 'cover', label: '자료화면' }, 'footage'); }}>자료화면 장면으로 바꾸기</button>}
          <button onClick={() => setOpen(!open)}>{media?.url ? '바꾸기' : '고르기'}</button>
          {media?.url && <button onClick={() => set(undefined)}>빼기</button>}
        </div>
      </div>
      {media?.url && (
        <div className="row" style={{ alignItems: 'flex-start', gap: 10, marginTop: 6 }}>
          {cur ? <AssetThumb a={cur} size={72} /> : <span className="mute" style={{ fontSize: 11, wordBreak: 'break-all', maxWidth: 160 }}>{media.url}</span>}
          <div style={{ display: 'grid', gap: 6, flex: 1 }}>
            <Field label="맞춤"><Seg value={media.fit || 'cover'} options={[['cover', '꽉 채우기'], ['contain', '전체 보이기']]} onChange={(v) => set({ ...media, fit: v })} /></Field>
            <div className="row">
              {(media.kind === 'video' || /\.(mp4|mov|webm|m4v)/i.test(media.url)) && <Field label="시작(초)"><Num value={media.start || 0} step={0.5} min={0} max={Math.max(5, Math.floor(cur?.duration || 60))} onChange={(v) => set({ ...media, start: v || undefined })} /></Field>}
              <Field label="라벨"><input value={media.label ?? ''} placeholder="자료화면" onChange={(e) => set({ ...media, label: e.target.value })} style={{ width: 110 }} /></Field>
              {layout !== 'footage' && <Field label="어둡게(0~1)"><Num value={media.dim ?? 0.7} step={0.05} min={0} max={1} onChange={(v) => set({ ...media, dim: v })} /></Field>}
              {(media.kind === 'video') && <label className="row" style={{ gap: 4, fontSize: 12 }}><input type="checkbox" checked={!!media.volume} onChange={(e) => set({ ...media, volume: e.target.checked ? 0.3 : undefined })} /> 영상 소리 (작게)</label>}
            </div>
          </div>
        </div>
      )}
      {open && (
        <div className="media-pick">
          {canUpload && (
            <label className="media-up">
              <input type="file" hidden accept="image/*,video/mp4,video/quicktime,video/webm" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                try { const a = await uploadAsset(contentId, f, { note: '장면 자료' }, setProg); setList([a, ...list]); pick(a); } catch (er: any) { alert(er.message); }
                setProg(''); e.target.value = '';
              }} />
              <span>{prog || '＋ 새로 올리기'}</span>
            </label>
          )}
          {list.map((a) => (
            <button key={a.id} className={`media-opt ${media?.url === a.url ? 'on' : ''}`} onClick={() => pick(a)} title={`${a.name || ''}${a.note ? ` — ${a.note}` : ''}`}>
              <AssetThumb a={a} size={84} />
              <span>#{a.id} {a.kind === 'video' ? `🎬${a.duration ? ` ${a.duration}초` : ''}` : '🖼'}</span>
            </button>
          ))}
          {!list.length && !canUpload && <span className="mute">첨부 파일이 없습니다</span>}
        </div>
      )}
      <style>{`
        .media-field{border:1px dashed var(--line,#dde3ee);border-radius:10px;padding:10px;margin:8px 0}
        .media-pick{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
        .media-opt{display:grid;gap:2px;padding:4px;border:2px solid transparent;border-radius:8px;background:none;font-size:11px;cursor:pointer}
        .media-opt.on{border-color:var(--pri,#2b6cdf)}
        .media-up{display:grid;place-items:center;width:92px;height:104px;border:2px dashed var(--line,#dde3ee);border-radius:8px;font-size:12px;cursor:pointer;text-align:center}
      `}</style>
    </div>
  );
}
