// 공동주택 단지 기본정보 (K-apt, data.go.kr)
//   단지 목록  AptListService4/getSigunguAptList4      → kaptCode, kaptName, bjdCode, as3(동)
//   기본정보   AptBasisInfoServiceV5/getAphusBassInfoV5 → 지번 주소, 세대수, 동수, 사용승인일, 최고층, 난방
//   상세정보   AptBasisInfoServiceV5/getAphusDtlInfoV5  → 지상·지하 주차 대수
// 2026-10-11 확인: 목록 items는 배열(1건이면 객체일 수 있음), 없는 kaptCode는 오류 대신 값이 모두 null인 item.
// K-apt는 의무관리 대상(대략 150세대 이상)만 있어서 소규모 단지는 짝이 없는 게 정상이다.

import { requireEnv } from "./env";
import { dataGoKrError, dataGoKrXmlError, requestWithRetry, type CallCounter } from "./http";
import { str } from "./normalize";

const BASE = "https://apis.data.go.kr/1613000";

type Item = Record<string, string | number | null | undefined>;

export function parseKapt(text: string): { items: Item[]; totalCount: number } {
  if (text.trimStart().startsWith("<")) throw dataGoKrXmlError(text, "K-apt 오류");
  let json: {
    response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: unknown; item?: unknown; totalCount?: number } };
    OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnReasonCode?: string; returnAuthMsg?: string; errMsg?: string } };
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`K-apt 응답 파싱 실패: ${text.slice(0, 200)}`);
  }
  // 게이트웨이 오류는 JSON으로도 온다 (2026-10-11: 04 HTTP_ERROR = 제공 기관 서버 오류, 재시도 대상)
  const gw = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gw) throw dataGoKrError(gw.returnReasonCode, gw.returnAuthMsg ?? gw.errMsg, "K-apt 오류");
  const header = json.response?.header;
  if (header?.resultCode !== "00") throw dataGoKrError(header?.resultCode, header?.resultMsg, "K-apt 오류");
  const body = json.response?.body ?? {};
  const raw = body.items ?? body.item;
  const list = raw == null || raw === "" ? [] : Array.isArray(raw) ? raw : [raw];
  return { items: list as Item[], totalCount: Number(body.totalCount ?? list.length) };
}

// ---------- 응답 → 값 ----------

export interface KaptListItem {
  kaptCode: string;
  kaptName: string;
  bjdCode: string; // 10자리 법정동코드 = lawd_cd(5) + umd_cd(5)
  dong: string; // 법정동 이름 (as3)
}

export interface KaptBasis {
  kaptCode: string;
  kaptName: string | null;
  kaptAddr: string | null; // 지번 주소: "경기도 수원영통구 매탄동 50 매탄극동"
  bjdCode: string | null;
  households: number | null;
  dongCount: number | null;
  topFloor: number | null;
  useDate: string | null; // YYYY-MM-DD
  heatType: string | null;
  roadAddr: string | null;
}

const int = (v: unknown) => {
  const n = Number(str(v));
  return str(v) == null || !Number.isFinite(n) ? null : Math.round(n);
};

export function toListItem(it: Item): KaptListItem | null {
  const code = str(it.kaptCode), name = str(it.kaptName), bjd = str(it.bjdCode);
  if (!code || !name || !bjd) return null;
  return { kaptCode: code, kaptName: name, bjdCode: bjd, dong: str(it.as3) ?? "" };
}

export function toBasis(it: Item | undefined): KaptBasis | null {
  if (!it || !str(it.kaptCode)) return null; // 없는 단지: 값이 모두 null
  const d = str(it.kaptUsedate);
  return {
    kaptCode: str(it.kaptCode)!,
    kaptName: str(it.kaptName),
    kaptAddr: str(it.kaptAddr),
    bjdCode: str(it.bjdCode),
    households: int(it.kaptdaCnt),
    dongCount: int(it.kaptDongCnt),
    topFloor: int(it.kaptTopFloor),
    useDate: d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : null,
    heatType: str(it.codeHeatNm),
    roadAddr: str(it.doroJuso),
  };
}

/** 지상 + 지하 주차 대수 (둘 다 없으면 null) */
export function toParking(it: Item | undefined): number | null {
  const a = int(it?.kaptdPcnt), b = int(it?.kaptdPcntu);
  return a == null && b == null ? null : (a ?? 0) + (b ?? 0);
}

// ---------- 짝짓기 ----------

/** "50", "172-181", "산 12-3", "0897-0000" → "50", "172-181", "산12-3", "897" */
export function normJibun(j: string | null | undefined): string | null {
  const m = /^(산)?\s*0*(\d+)(?:-0*(\d+))?/.exec((j ?? "").trim());
  if (!m) return null;
  const sub = m[3] && m[3] !== "0" ? `-${m[3]}` : "";
  return `${m[1] ?? ""}${m[2]}${sub}`;
}

/** 지번 주소에서 법정동 다음의 지번: "경기도 수원영통구 매탄동 50 매탄극동" + "매탄동" → "50" */
export function jibunFromAddr(addr: string | null, dong: string): string | null {
  if (!addr) return null;
  const tokens = addr.split(/\s+/);
  const i = tokens.lastIndexOf(dong);
  const rest = (i >= 0 ? tokens.slice(i + 1) : tokens).join(" ");
  const m = /(?:^|\s)((?:산\s*)?\d+(?:-\d+)?)(?:번지)?(?:\s|$)/.exec(rest);
  return m ? normJibun(m[1].replace(/\s/g, "")) : null;
}

/** 이름 비교용: 공백·괄호·"아파트"·"APT"·동 이름 접두 제거, "제3단지"/"3단지"/"3차" → "3" */
export function normName(name: string, dong = ""): string {
  let s = name.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/\s+/g, "");
  s = s.replace(/주상복합|아파트|apt|apartment/g, "");
  s = s.replace(/제?(\d+)(단지|차)/g, "$1");
  const stem = dong.replace(/\d*동$/, "");
  if (stem.length >= 2 && s.startsWith(stem) && s.length > stem.length + 1) s = s.slice(stem.length);
  return s;
}

/** 이름 비슷한 정도 0~1: 같으면 1, 한쪽이 다른 쪽을 포함하면 0.9(짧은 쪽 3글자 이상: "현대"⊂"현대2" 같은 흔한 이름 제외), 아니면 두 글자 묶음 Dice 계수 */
export function nameScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a))) return 0.9;
  const grams = (s: string) => {
    const g = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) g.set(s.slice(i, i + 2), (g.get(s.slice(i, i + 2)) ?? 0) + 1);
    return g;
  };
  const ga = grams(a), gb = grams(b);
  let common = 0;
  for (const [k, n] of ga) common += Math.min(n, gb.get(k) ?? 0);
  const total = Math.max(1, a.length - 1 + b.length - 1);
  return (2 * common) / total;
}

/** 숫자(단지·차수)가 서로 다르면 다른 단지: "주공4" vs "주공5" */
function numbersConflict(a: string, b: string): boolean {
  const na = a.match(/\d+/g) ?? [], nb = b.match(/\d+/g) ?? [];
  return na.length > 0 && nb.length > 0 && na.join(",") !== nb.join(",");
}

export interface OurComplex {
  apt_seq: string;
  apt_nm: string;
  lawd_cd: string;
  umd_cd: string | null;
  umd_nm: string | null;
  jibun: string | null;
  build_year: number | null;
}

export interface KaptCandidate {
  kaptCode: string;
  kaptName: string;
  bjdCode: string;
  dong: string;
  jibun: string | null;
  useYear: number | null; // 사용승인 연도
}

export interface Match {
  apt_seq: string;
  kaptCode: string;
  method: "jibun" | "name" | "manual";
  score: number;
}

export const NAME_MIN = 0.75; // 같은 법정동 안 이름만으로 짝지을 때 최소 점수
export const YEAR_GAP = 3; // 준공·사용승인 연도가 이보다 더 다르면 재건축·리모델링 등 다른 건물로 보고, 이름이 똑같을 때만 짝짓는다

/**
 * 우리 단지(실거래 aptSeq) ↔ K-apt 단지.
 *  ① 수동 보정 (kaptCode null이면 짝 없음 확정)
 *  ② 같은 법정동 + 같은 지번. 후보가 여럿이면 이름이 가장 비슷한 쪽 (단지 번호가 다르면 제외)
 *  ③ 같은 법정동 안에서 이름 점수 NAME_MIN 이상인 단지 중 최고점 (번호 다르면 제외)
 *  ②③ 모두 준공 연도와 사용승인 연도가 YEAR_GAP 넘게 다르면 이름이 똑같은 경우만 (예: 미성 1980 ↔ 잠실르엘 2025 제외)
 */
export function matchComplexes(ours: OurComplex[], kapts: KaptCandidate[], overrides: Map<string, string | null>): Match[] {
  // umd_cd가 빠진 단지는 같은 시군구의 동 이름으로 법정동코드를 찾는다
  const bjdByDong = new Map(kapts.map((k) => [`${k.bjdCode.slice(0, 5)}|${k.dong}`, k.bjdCode]));
  const byBjd = new Map<string, KaptCandidate[]>();
  for (const k of kapts) byBjd.set(k.bjdCode, [...(byBjd.get(k.bjdCode) ?? []), k]);

  const out: Match[] = [];
  for (const c of ours) {
    if (overrides.has(c.apt_seq)) {
      const code = overrides.get(c.apt_seq);
      if (code) out.push({ apt_seq: c.apt_seq, kaptCode: code, method: "manual", score: 1 });
      continue;
    }
    const bjd = c.umd_cd ? `${c.lawd_cd}${c.umd_cd}` : bjdByDong.get(`${c.lawd_cd}|${c.umd_nm ?? ""}`);
    const cands = bjd ? byBjd.get(bjd) ?? [] : [];
    if (cands.length === 0) continue;
    const ourName = normName(c.apt_nm, c.umd_nm ?? "");
    const scored = cands
      .map((k) => ({ k, name: normName(k.kaptName, k.dong) }))
      .filter((x) => !numbersConflict(ourName, x.name))
      .map((x) => ({ k: x.k, s: nameScore(ourName, x.name) }))
      .filter((x) => x.s === 1 || c.build_year == null || x.k.useYear == null || Math.abs(c.build_year - x.k.useYear) <= YEAR_GAP);
    const j = normJibun(c.jibun);
    const sameJibun = j ? scored.filter((x) => x.k.jibun === j) : [];
    if (sameJibun.length > 0) {
      const best = sameJibun.sort((a, b) => b.s - a.s)[0];
      out.push({ apt_seq: c.apt_seq, kaptCode: best.k.kaptCode, method: "jibun", score: best.s });
      continue;
    }
    const best = scored.filter((x) => x.s >= NAME_MIN).sort((a, b) => b.s - a.s)[0];
    if (best) out.push({ apt_seq: c.apt_seq, kaptCode: best.k.kaptCode, method: "name", score: best.s });
  }
  return out;
}

// ---------- 호출 ----------

const key = () => encodeURIComponent(requireEnv("DATA_GO_KR_SERVICE_KEY"));

export async function fetchKaptList(lawdCd: string, counter: CallCounter): Promise<KaptListItem[]> {
  const all: KaptListItem[] = [];
  for (let page = 1; ; page++) {
    const url = `${BASE}/AptListService4/getSigunguAptList4?serviceKey=${key()}&sigunguCode=${lawdCd}&pageNo=${page}&numOfRows=1000&_type=json`;
    const { items, totalCount } = await requestWithRetry(url, parseKapt, counter);
    all.push(...items.map(toListItem).filter((x): x is KaptListItem => x != null));
    if (items.length === 0 || page * 1000 >= totalCount) return all;
  }
}

export async function fetchKaptBasis(kaptCode: string, counter: CallCounter): Promise<KaptBasis | null> {
  const url = `${BASE}/AptBasisInfoServiceV5/getAphusBassInfoV5?serviceKey=${key()}&kaptCode=${encodeURIComponent(kaptCode)}&_type=json`;
  const { items } = await requestWithRetry(url, parseKapt, counter);
  return toBasis(items[0]);
}

export async function fetchKaptParking(kaptCode: string, counter: CallCounter): Promise<number | null> {
  const url = `${BASE}/AptBasisInfoServiceV5/getAphusDtlInfoV5?serviceKey=${key()}&kaptCode=${encodeURIComponent(kaptCode)}&_type=json`;
  const { items } = await requestWithRetry(url, parseKapt, counter);
  return toParking(items[0]);
}
