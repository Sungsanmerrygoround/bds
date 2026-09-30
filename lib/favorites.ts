// 관심 단지: 로그인 없는 공개 대시보드라 DB가 아니라 브라우저 쿠키에 단지 코드 목록을 둔다(기기별).
import "server-only";
import { cookies } from "next/headers";

export const FAV_COOKIE = "bds_fav";
export const FAV_MAX = 40;
const SEQ = /^[0-9A-Za-z_-]{1,32}$/;

export function parseFavorites(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").filter((s) => SEQ.test(s)))].slice(0, FAV_MAX);
}

export async function getFavorites(): Promise<string[]> {
  return parseFavorites((await cookies()).get(FAV_COOKIE)?.value);
}

export const isValidAptSeq = (s: string) => SEQ.test(s);
