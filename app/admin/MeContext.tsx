'use client';
import { createContext, useContext } from 'react';
import type { Me } from '@/lib/perms';

export const MeCtx = createContext<Me | null>(null);
/** 지금 로그인한 계정 (대표·직원) — 화면에서 버튼 숨김용. 실제 차단은 API 가 함 */
export const useMe = () => useContext(MeCtx);
