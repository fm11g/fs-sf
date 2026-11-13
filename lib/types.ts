export type Settings = {
  brand: string;
  site_url: string;
  voice_id: string;
  tts_model: string;
  tts_speed: number;
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

export const FONT_OPTIONS = ['Black Han Sans', 'Noto Sans KR', 'Do Hyeon', 'Gothic A1'] as const;
export const LAYOUTS = ['hook', 'stat', 'list', 'compare', 'quote', 'cta'] as const;
export const MOTIONS = ['pop', 'slide', 'typewriter', 'countup', 'zoom'] as const;

export type StepState = 'pending' | 'running' | 'review' | 'approved' | 'rejected' | 'stale' | 'failed';
export type StepRow = {
  content_id: string; step: string; state: StepState; attempts: number;
  decided_by: string | null; decision_note: string | null; feedback: string | null;
  ai_notes: any; ai_review: any; ai_output?: any; checks: { level: 'error' | 'warn' | 'ok'; msg: string }[];
  started_at: string | null; finished_at: string | null; decided_at: string | null;
  provider: string | null; model: string | null;
  work_ms: number; wait_ms: number; input_tokens: number; output_tokens: number; updated_at: string;
};
