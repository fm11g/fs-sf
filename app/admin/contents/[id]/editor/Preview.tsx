'use client';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { FPS, Short, sizeOf, totalFrames, type ShortProps } from '@/worker/video/Short';

export type PreviewHandle = { seek: (frame: number) => void; frame: () => number; pause: () => void };

/**
 * 렌더 워커와 같은 컴포지션(Short.tsx)을 브라우저에서 재생.
 * drag 가 켜져 있으면 화면 위에서 끌어서 선택한 요소를 옮김 (1080 기준 px 로 변환해 onMove 로 넘김)
 */
// next/dynamic 은 ref 를 넘기지 않으므로 handle 을 prop 으로 받음
export default function Preview({ props, drag, onMove, onFrame, handle }: {
  props: ShortProps; drag: boolean; onMove: (dx: number, dy: number, done: boolean) => void; onFrame?: (f: number) => void;
  handle: React.MutableRefObject<PreviewHandle | null>;
}) {
  const player = useRef<PlayerRef>(null);
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const { w, h } = sizeOf(props);
  const dur = totalFrames(props);
  const [maxH, setMaxH] = useState(720);

  useImperativeHandle(handle, () => ({
    seek: (f) => player.current?.seekTo(Math.max(0, Math.min(dur - 1, f))),
    frame: () => player.current?.getCurrentFrame() ?? 0,
    pause: () => player.current?.pause(),
  }), [dur]);

  useEffect(() => {
    const fit = () => setMaxH(Math.max(360, window.innerHeight - 170));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  useEffect(() => {
    const p = player.current;
    if (!p || !onFrame) return;
    const fn = (e: any) => onFrame(e.detail.frame);
    p.addEventListener('frameupdate', fn);
    p.addEventListener('seeked', fn);
    return () => { p.removeEventListener('frameupdate', fn); p.removeEventListener('seeked', fn); };
  }, [onFrame]);

  // 화면 px → 영상 px → 1080 기준 px (Short.tsx 의 k = min(W/1080, H/1350))
  const toBase = (px: number) => {
    const shown = box.current?.getBoundingClientRect().width || w;
    const k = Math.min(w / 1080, h / 1350);
    return (px * (w / shown)) / k;
  };
  const down = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    player.current?.pause();
  };
  const move = (e: React.PointerEvent, done = false) => {
    if (!start.current) return;
    onMove(Math.round(toBase(e.clientX - start.current.x)), Math.round(toBase(e.clientY - start.current.y)), done);
    if (done) start.current = null;
  };

  const width = Math.min(560, (maxH * w) / h);
  return (
    <div ref={box} style={{ position: 'relative', width, maxWidth: '100%', margin: '0 auto' }}>
      <Player
        ref={player}
        component={Short as any}
        inputProps={props}
        durationInFrames={dur}
        compositionWidth={w % 2 ? w + 1 : w}
        compositionHeight={h % 2 ? h + 1 : h}
        fps={FPS}
        controls
        loop
        clickToPlay={!drag}
        acknowledgeRemotionLicense
        style={{ width: '100%', borderRadius: 12, overflow: 'hidden', background: '#000' }}
      />
      {drag && (
        <div
          onPointerDown={down}
          onPointerMove={(e) => move(e)}
          onPointerUp={(e) => move(e, true)}
          onPointerCancel={(e) => move(e, true)}
          title="끌어서 선택한 요소 이동"
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 46, cursor: 'move', outline: '2px dashed #FFD400', outlineOffset: -2, borderRadius: 12, touchAction: 'none' }}
        />
      )}
    </div>
  );
}
