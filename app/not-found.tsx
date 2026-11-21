import Link from "next/link";
import { outlineLinkCls } from "./_components/styles";

export default function NotFound() {
  return (
    <div className="panel mx-auto mt-10 max-w-lg px-6 py-8 text-center">
      <h1 className="mb-2 text-xl font-semibold">찾는 화면이 없습니다</h1>
      <p className="mb-5 text-sm text-ink-2">주소가 잘못되었거나, 수집 지역에서 빠진 단지일 수 있습니다.</p>
      <div className="flex justify-center gap-2">
        <Link href="/complex" className={outlineLinkCls}>단지 찾기</Link>
        <Link href="/" className={outlineLinkCls}>추이로</Link>
      </div>
    </div>
  );
}
