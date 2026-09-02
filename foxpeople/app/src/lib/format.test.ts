import { describe, it, expect } from "vitest";
import { parseNum } from "./format";
describe("parseNum", () => {
  it("liest deutsche und englische Schreibweise", () => {
    expect(parseNum("38.5")).toBe(38.5);
    expect(parseNum("38,5")).toBe(38.5);
    expect(parseNum("1.234,56")).toBe(1234.56);
    expect(parseNum("1.234")).toBe(1234);
    expect(parseNum("120000")).toBe(120000);
    expect(parseNum("0.6")).toBe(0.6);
    expect(parseNum("")).toBeNull();
  });
});
