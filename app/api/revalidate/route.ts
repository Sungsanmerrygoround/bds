// 수집이 끝나면 GitHub Actions가 호출해 조회 캐시를 비운다 (lib/queries의 DATA_TAG).
// Authorization: Bearer <REVALIDATE_SECRET>. 비밀값이 설정되지 않았으면 항상 거절한다.
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { DATA_TAG } from "@/lib/queries";

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !timingSafeEqual(digest(given), digest(secret))) {
    return Response.json({ revalidated: false }, { status: 401 });
  }
  // 수집 직후 화면은 새 데이터여야 하므로 이전 결과를 내주지 않고 바로 만료
  revalidateTag(DATA_TAG, { expire: 0 });
  return Response.json({ revalidated: true });
}
