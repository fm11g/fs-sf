'use client';
import { api } from './api';
import { sbBrowser } from './supabase/client';

export type Asset = { id: number; kind: 'image' | 'video'; url: string; name?: string; note?: string; size?: number; width?: number; height?: number; duration?: number; step?: string; created_at: string };

/** 파일의 크기·길이 읽기 (영상 길이·해상도 — AI·편집기 참고용) */
function probe(file: File): Promise<{ width?: number; height?: number; duration?: number }> {
  return new Promise((ok) => {
    const url = URL.createObjectURL(file);
    const done = (v: any) => { URL.revokeObjectURL(url); ok(v); };
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: Number(v.duration.toFixed(2)) });
      v.onerror = () => done({}); v.src = url;
    } else {
      const i = new Image(); i.onload = () => done({ width: i.naturalWidth, height: i.naturalHeight }); i.onerror = () => done({}); i.src = url;
    }
    setTimeout(() => done({}), 8000);
  });
}

/** 콘텐츠 첨부 올리기 — 브라우저에서 스토리지로 바로 (큰 영상도 가능, 200MB 까지) */
export async function uploadAsset(contentId: string, file: File, opts: { step?: string; note?: string } = {}, onProgress?: (m: string) => void): Promise<Asset> {
  onProgress?.(`${file.name} 준비…`);
  const u = await api(`/api/contents/${contentId}/assets`, { action: 'upload_url', filename: file.name, size: file.size, step: opts.step });
  onProgress?.(`${file.name} 올리는 중… (${(file.size / 1048576).toFixed(1)}MB)`);
  const [meta, up] = await Promise.all([probe(file), sbBrowser().storage.from('media').uploadToSignedUrl(u.path, u.token, file, { contentType: file.type || undefined })]);
  if (up.error) throw new Error(`업로드 실패: ${up.error.message}`);
  const r = await api(`/api/contents/${contentId}/assets`, { action: 'add', path: u.path, name: file.name, mime: file.type, size: file.size, ...meta, ...opts });
  onProgress?.('');
  return r.asset;
}

export const listAssets = async (contentId: string): Promise<Asset[]> => (await api(`/api/contents/${contentId}/assets`)).assets;
export const deleteAsset = (contentId: string, id: number) => api(`/api/contents/${contentId}/assets`, { action: 'delete', id });
