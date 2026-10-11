import { describe, expect, it } from "vitest";
import { complexFacts, deltaTone, formatDelta, formatHouseholds, signedPct } from "./format";

describe("단지 기본정보 표시", () => {
  it("formatHouseholds", () => {
    expect(formatHouseholds(5678)).toBe("5,678세대");
    expect(formatHouseholds(null)).toBe("-");
  });
  it("complexFacts: 있는 값만, 주차는 세대당", () => {
    expect(complexFacts({ households: 210, dong_count: 6, top_floor: 10, use_date: "1998-10-30", heat_type: "개별난방", parking: 253 }))
      .toEqual(["210세대", "6개 동", "최고 10층", "1998.10 사용승인", "주차 세대당 1.20대", "개별난방"]);
    expect(complexFacts({ households: 210, dong_count: null, top_floor: 0, use_date: null, heat_type: null, parking: null }))
      .toEqual(["210세대"]);
  });
});

describe("변동 표시", () => {
  it("signedPct: 음수는 수학 기호 −, 자릿수 지정, 없으면 -", () => {
    expect(signedPct(1.234)).toBe("+1.2%");
    expect(signedPct(-0.456, 2)).toBe("−0.46%");
    expect(signedPct(0)).toBe("0.0%");
    expect(signedPct(null)).toBe("-");
    // 기존 renewal·MetricChart의 1자리, WeeklyChart의 2자리 표기와 같음
    expect(signedPct(-5)).toBe("−5.0%");
    expect(signedPct(0.62, 2)).toBe("+0.62%");
  });
  it("formatDelta·deltaTone: 0은 상승 쪽", () => {
    expect(formatDelta(3.21)).toBe("▲ +3.2%");
    expect(formatDelta(-1, "%p")).toBe("▼ −1.0%p");
    expect(formatDelta(0)).toBe("▲ +0.0%");
    expect(formatDelta(null)).toBeNull();
    expect([deltaTone(0), deltaTone(-0.1), deltaTone(null)]).toEqual(["up", "down", "muted"]);
  });
});
