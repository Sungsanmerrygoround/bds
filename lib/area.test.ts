import { describe, expect, it } from "vitest";
import { AREA_BAND_LABEL, bandText, bandValue, parseBand } from "./area";

describe("area", () => {
  it("parseBand: 없으면 84, all·모르는 값은 전체(null)", () => {
    expect(parseBand(undefined)).toBe(84);
    expect(parseBand(["59", "74"])).toBe(84);
    expect(parseBand("59")).toBe(59);
    expect(parseBand("all")).toBeNull();
    expect(parseBand("85")).toBeNull();
  });
  it("표시 문자열", () => {
    expect(AREA_BAND_LABEL[84]).toBe("84 (80–89㎡)");
    expect(bandValue(null)).toBe("all");
    expect(bandText(125)).toBe("125㎡");
  });
});
