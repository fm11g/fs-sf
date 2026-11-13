import { sbAdmin } from './supabase/server';

/** 첫 가입이 필요한가: 로그인 가능한(auth 계정이 있는) 활성 대표가 한 명도 없으면 true */
export async function setupNeeded(): Promise<boolean> {
  const db = sbAdmin();
  const { data: owners, error } = await db.from('admins').select('email').eq('role', 'owner').eq('active', true);
  if (error) throw new Error(`Supabase 확인 실패: ${error.message} — SQL(001~007)을 먼저 실행했는지 확인하세요`);
  if (!owners?.length) return true;
  const emails = new Set(owners.map((o: any) => String(o.email).toLowerCase()));
  for (let page = 1; page <= 10; page++) {
    const { data, error: e } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (e) throw new Error(e.message);
    if (data.users.some((u) => u.email && emails.has(u.email.toLowerCase()))) return false;
    if (data.users.length < 200) break;
  }
  return true;
}

/** auth 계정 생성(이미 있으면 비밀번호 갱신) → id */
export async function upsertAuthUser(email: string, password: string, name?: string | null) {
  const db = sbAdmin();
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: name ? { name } : undefined });
  if (!created.error) return created.data.user!.id;
  if (!/already|registered|exists/i.test(created.error.message)) throw new Error(created.error.message);
  for (let page = 1; page <= 10; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users.find((x) => x.email?.toLowerCase() === email);
    if (u) {
      const { error } = await db.auth.admin.updateUserById(u.id, { password, email_confirm: true });
      if (error) throw new Error(error.message);
      return u.id;
    }
    if (!data || data.users.length < 200) break;
  }
  throw new Error('계정을 만들 수 없습니다');
}

export function checkPassword(pw: string) {
  if (!pw || pw.length < 8) return '비밀번호는 8자 이상';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '비밀번호에 영문과 숫자를 함께 넣어 주세요';
  return null;
}
export const normEmail = (e: any) => String(e || '').trim().toLowerCase();
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ── 아이디 로그인 ─────────────────────────────────────────────────────
/** 아이디만 있는 계정의 로그인용 내부 주소 (RFC 2606 예약 도메인 → 메일이 실제로 가지 않음) */
export const ID_DOMAIN = 'users.example.com';
export const normId = (v: any) => String(v || '').trim().toLowerCase();
export function checkUsername(id: string) {
  if (!/^[a-z0-9][a-z0-9._-]{2,19}$/.test(id)) return '아이디는 영문 소문자·숫자·. _ - 로 3~20자 (첫 글자는 영문/숫자)';
  return null;
}
export const idEmail = (id: string) => `${id}@${ID_DOMAIN}`;
export const isIdEmail = (e?: string | null) => !!e && e.endsWith(`@${ID_DOMAIN}`);

/** 로그인 입력(아이디 또는 이메일) → Supabase 로그인 이메일 */
export async function resolveLogin(login: string): Promise<string> {
  const v = normId(login);
  if (v.includes('@')) return v;
  const { data } = await sbAdmin().from('admins').select('email').eq('username', v).maybeSingle();
  return data?.email || idEmail(v);
}
