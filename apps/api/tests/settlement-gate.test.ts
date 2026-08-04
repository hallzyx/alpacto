import { describe, expect, it } from "vitest";
import { isSettlementAllowed } from "@alpacto/domain";

describe("settlement gate", () => {
  it("allows pass and warning", () => {
    expect(isSettlementAllowed("pass")).toBe(true);
    expect(isSettlementAllowed("warning")).toBe(true);
  });

  it("blocks review_required and unreadable", () => {
    expect(isSettlementAllowed("review_required")).toBe(false);
    expect(isSettlementAllowed("unreadable")).toBe(false);
    expect(isSettlementAllowed(null)).toBe(false);
  });
});
