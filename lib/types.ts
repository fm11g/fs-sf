export type Settings = {
  brand: string;
  site_url: string;
  voice_id: string;
  tts_model: string;
  tts_speed: number;
  /** 뉴스 장면 기본 순서 (role) — 편집기에서 장면을 옮기면 저장, 다음 기획·대사가 이 순서를 따름 */
  news_flow_order?: string[];
  news_flow_history?: { order: string[]; at: string; by: string; from?: string }[];
  /** AI 목소리 제공자·예비 순서·제공자별 목소리 (worker/video/tts-core.ts) */
  tts_provider?: 'fish' | 'elevenlabs' | 'google' | 'openai' | 'oss';
  tts_fallback?: ('fish' | 'elevenlabs' | 'google' | 'openai' | 'oss')[];
  eleven_voice_id?: string; eleven_model?: string; eleven_stability?: number; eleven_similarity?: number; eleven_style?: number;
  google_voice?: string; google_lang?: string;
  openai_tts_model?: string; openai_tts_voice?: string; openai_tts_instructions?: string;
  oss_tts_model?: string; oss_tts_voice?: string;
  auto_publish: boolean;
  daily_enabled: boolean;
  default_hashtags: string[];
  cta_text: string;
  target: string;
  banned_phrases: string[];
  offers: string;
  offer_rules: string;
  lead_webhook: string;
  mcp_servers: { name: string; url: string; token?: string }[];
  llm_chain: string[];
  notify_emails: string[];
  notify_events: string[];
  learn_mode: 'off' | 'propose' | 'auto';
  learn_min: number;
  learn_from_edits: boolean;
  export_github: boolean;
  github_data_repo: string;
  github_data_branch: string;
  export_sheets: boolean;
  sheets_id: string;
  sheets_webhook: string;
  sheets_secret: string;
  fewshot_k: number;
  fewshot_min_score: number;
  youtube_channel: string;
  instagram_account: string;
  channel_lookback_days: number;
  editorial_enabled: boolean;
  novelty_strength: number;
  explore_rate: number;
  cooldown_days: number;
  perf_to_learning: boolean;
  perf_weights: Record<string, number>;
  /** 오늘의 정책자금 홈페이지 연동 (lib/tpf-site.ts) */
  tpf_site_url?: string;        // 홈페이지 주소 — 추적 링크 go.html · 정보글
  tpf_admin_url?: string;       // 홈페이지 관리자 주소 — /api/integration/*
  tpf_post_on_publish?: boolean; // 업로드되면 정보글 자동 발행
  tpf_forward_leads?: boolean;   // 공장 랜딩 신청을 홈페이지 관리자로 전달
  program_watch_daily?: number;  // 공고 변경 확인: 하루에 다시 확인할 공고 수 (0 = 끔, 기본 3)
};

export type ScriptScene = { id: string; narration: string; captions: string[] };
export type DesignScene = {
  id: string;
  layout: 'hook' | 'stat' | 'list' | 'compare' | 'quote' | 'cta';
  headline: string;
  sub?: string;
  items?: string[];
  value?: string;
  unit?: string;
  emphasis?: string[];
  motion?: 'pop' | 'slide' | 'typewriter' | 'countup' | 'zoom';
  icon?: string;
};
export type Design = {
  theme: { bg: string; bg2: string; accent: string; text: string; sub: string };
  fonts: { title: string; body: string };
  scale: { title: number; body: number; caption: number };
  scenes: DesignScene[];
};

export type Content = {
  id: string;
  slug: string;
  status: string;
  current_step: string | null;
  topic: string | null;
  research: any;
  plan: any;
  script: { total_chars?: number; scenes: ScriptScene[] } | null;
  design: Design | null;
  offer: any;
  editorial?: any;
  reference_id?: number | null;
  copy: any;
  post: any;
  audio: any;
  images: { url: string; alt?: string }[];
  video_url: string | null;
  thumbnail_url: string | null;
  bgm_id: string | null;
  youtube_id: string | null;
  instagram_id: string | null;
  error: string | null;
  published_at: string | null;
  created_at: string;
};

export { FONT_NAMES as FONT_OPTIONS } from './fonts';
export const LAYOUTS = ['hook', 'stat', 'list', 'compare', 'quote', 'cta'] as const;
export const MOTIONS = ['pop', 'slide', 'typewriter', 'countup', 'zoom'] as const;

export type StepState = 'pending' | 'running' | 'review' | 'approved' | 'rejected' | 'stale' | 'failed';
export type StepRow = {
  content_id: string; step: string; state: StepState; attempts: number;
  decided_by: string | null; decision_note: string | null; feedback: string | null;
  ai_notes: any; ai_review: any; ai_output?: any; ai_input?: any;
  sop_hash?: string | null; freedom?: number | null; candidates?: number | null; pred_score?: number | null; refs?: number[] | null; checks: { level: 'error' | 'warn' | 'ok'; msg: string }[];
  started_at: string | null; finished_at: string | null; decided_at: string | null;
  provider: string | null; model: string | null;
  work_ms: number; wait_ms: number; input_tokens: number; output_tokens: number; updated_at: string;
};
