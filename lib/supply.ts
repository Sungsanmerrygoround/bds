// 입주 물량 집계와 '입주 전후 전세가 반응' 계산 (순수 함수)

export interface SupplyProjectLike {
  region_id: number;
  move_in_ym: string;
  households: number;
  total_households_override: number | null;
  is_excluded: boolean;
}
export interface ManualSupplyLike {
  region_id: number;
  ym: string;
  households: number;
  kind: "입주" | "이주";
}

/** 그룹별 월별 합계를 쌓는 틀: 모든 그룹이 months 길이의 0 배열로 시작한다. 모르는 지역·기간 밖 달은 버린다. */
function groupMonthSums(regionToGroup: Map<number, number>, months: string[]) {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out = new Map<number, number[]>([...new Set(regionToGroup.values())].map((g) => [g, months.map(() => 0)]));
  const add = (regionId: number, ym: string, n: number) => {
    const g = regionToGroup.get(regionId);
    const i = idx.get(ym);
    if (g != null && i != null) out.get(g)![i] += n;
  };
  return { out, add };
}

/** 지역 그룹별 월별 입주 세대 (months와 같은 길이). 제외된 공고·이주는 빼고, 재건축 보정값이 있으면 그 값. */
export function supplyByGroup(
  regionToGroup: Map<number, number>,
  months: string[],
  projects: SupplyProjectLike[],
  manual: ManualSupplyLike[],
): Map<number, number[]> {
  const { out, add } = groupMonthSums(regionToGroup, months);
  for (const p of projects) if (!p.is_excluded) add(p.region_id, p.move_in_ym, p.total_households_override ?? p.households);
  for (const m of manual) if (m.kind === "입주") add(m.region_id, m.ym, m.households);
  return out;
}

/** 지역 그룹별 월별 이주 세대 (직접 입력한 재건축·재개발 이주). 입주와 반대로 주변 전세 수요를 늘린다. */
export function relocationByGroup(regionToGroup: Map<number, number>, months: string[], manual: ManualSupplyLike[]): Map<number, number[]> {
  const { out, add } = groupMonthSums(regionToGroup, months);
  for (const m of manual) if (m.kind === "이주") add(m.region_id, m.ym, m.households);
  return out;
}

/**
 * 입주 전후 전세 반응 비교 창 (입주월 m 기준 인덱스 오프셋).
 * 새 아파트 전세 계약은 입주 1~2개월 전에 몰리므로(계약일 기준 집계) '입주장'은 입주 전월~익월로 본다.
 */
export const REACTION_BEFORE = [-6, -4] as const;
export const REACTION_AROUND = [-1, 1] as const;

export interface Reaction {
  groupId: number;
  ym: string;
  households: number;
  before: number; // 입주 4~6개월 전 전세 중위 평균
  around: number; // 입주 전월~익월 평균
  change: number; // %
  others: number | null; // 같은 기간 다른 지역 평균 변화 %
  excess: number | null; // change − others (%p): 지역 전체 흐름을 뺀 입주 효과 추정
}

const meanOf = (vals: (number | null)[], from: number, to: number) => {
  const xs = vals.slice(Math.max(0, from), to + 1).filter((v): v is number => v != null);
  return xs.length * 2 > to - from + 1 ? xs.reduce((a, b) => a + b, 0) / xs.length : null; // 창의 과반 이상 있어야
};

/**
 * 한 달 입주가 threshold 세대 이상인 달마다 전세 중위가 변화를 계산.
 * lastDone: 집계가 끝난 마지막 인덱스 (창 끝이 이보다 뒤면 제외).
 */
export function supplyReactions(
  months: string[],
  supply: Map<number, number[]>,
  jeonse: Map<number, (number | null)[]>,
  lastDone: number,
  threshold = 500,
): Reaction[] {
  const out: Reaction[] = [];
  const change = (vals: (number | null)[], m: number) => {
    const b = meanOf(vals, m + REACTION_BEFORE[0], m + REACTION_BEFORE[1]);
    const a = meanOf(vals, m + REACTION_AROUND[0], m + REACTION_AROUND[1]);
    return b != null && a != null ? { before: b, around: a, pct: (a / b - 1) * 100 } : null;
  };
  for (const [g, hh] of supply) {
    const vals = jeonse.get(g);
    if (!vals) continue;
    hh.forEach((n, m) => {
      if (n < threshold || m + REACTION_BEFORE[0] < 0 || m + REACTION_AROUND[1] > lastDone) return;
      const c = change(vals, m);
      if (!c) return;
      const others = [...jeonse.entries()]
        .filter(([k]) => k !== g)
        .map(([, v]) => change(v, m)?.pct)
        .filter((v): v is number => v != null);
      const o = others.length ? others.reduce((a, b) => a + b, 0) / others.length : null;
      out.push({ groupId: g, ym: months[m], households: n, before: c.before, around: c.around, change: c.pct, others: o, excess: o == null ? null : c.pct - o });
    });
  }
  return out.sort((a, b) => b.ym.localeCompare(a.ym));
}
