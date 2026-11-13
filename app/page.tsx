import { redirect } from 'next/navigation';

/** 첫 화면 = 웹 공장 현황판 (로그인 안 돼 있으면 /admin 이 /login 으로 보냄). 공개 정보글 목록은 /policy */
export default function Root() {
  redirect('/admin');
}
