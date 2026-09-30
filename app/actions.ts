"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { FAV_COOKIE, FAV_MAX, getFavorites, isValidAptSeq } from "@/lib/favorites";

/** 관심 단지 추가/해제. 쿠키만 바꾸고 현재 화면을 다시 그린다. */
export async function toggleFavorite(aptSeq: string, on: boolean): Promise<void> {
  if (!isValidAptSeq(aptSeq)) return;
  const current = await getFavorites();
  const next = on ? [aptSeq, ...current.filter((s) => s !== aptSeq)].slice(0, FAV_MAX) : current.filter((s) => s !== aptSeq);
  (await cookies()).set(FAV_COOKIE, next.join(","), {
    maxAge: 60 * 60 * 24 * 730,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  refresh();
}
