import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sbAdmin } from '@/lib/supabase/server';
import { can, canStep } from '@/lib/perms';
import { ask } from '@/lib/llm';
import { getSettings } from '@/lib/settings';
import { styleFor } from '@/lib/styles';
import { motionPrompt } from '@/lib/motion-guide';
import { cleanLayers } from '@/lib/video-style';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * 편집기 "Claude 에게 모션 요청": 장면 하나의 레이어를 Claude 가 설계 (저장은 편집기에서)
 * { scene: 편집 중인 장면(design.scenes[i]), narration, duration_sec, instruction, design? }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, 'board');
  if (g.deny) return g.deny;
  if (!can(g.me, 'editor', 'work') && !canStep(g.me, 'design', 'work')) return NextResponse.json({ error: '영상 편집 권한이 없습니다' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.scene) return NextResponse.json({ error: 'scene 필요' }, { status: 400 });
  const { data: c } = await sbAdmin().from('contents').select('id, style_key, design').eq('id', params.id).single();
  if (!c) return NextResponse.json({ error: '콘텐츠 없음' }, { status: 404 });
  const st = await styleFor(c);
  const s = await getSettings();
  try {
    const res = await ask<any>({
      system: '당신은 방송 뉴스 모션그래픽 디자이너입니다. 렌더러가 그대로 그리는 레이어 JSON 을 설계합니다. 사실·숫자는 장면에 있는 것만 씁니다.',
      prompt: motionPrompt({ scene: b.scene, narration: String(b.narration || ''), durationSec: Number(b.duration_sec || 3), design: b.design || c.design, styleName: st.name, style: st.style, instruction: String(b.instruction || '') }),
      maxTokens: 5000, chain: s.llm_chain, task: 'motion', meta: { contentId: c.id, step: 'design', by: g.me.email },
    });
    return NextResponse.json({ layers: cleanLayers(res.data?.layers), hideLayout: !!res.data?.hideLayout, note: String(res.data?.note || ''), model: res.model, cost_usd: res.cost_usd });
  } catch (e: any) {
    return NextResponse.json({ error: `모션 설계 실패: ${e.message}` }, { status: 500 });
  }
}
