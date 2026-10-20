import { describe, expect, it } from "vitest";
import { parseEvdsDate } from "../src/evds.js";

describe("parseEvdsDate", () => {
  it("reads daily, monthly and quarterly formats", () => {
    expect(parseEvdsDate("05-01-2026")).toBe("2026-01-05");
    expect(parseEvdsDate("2026-9")).toBe("2026-09-01");
    expect(parseEvdsDate("2026-Q3")).toBe("2026-07-01");
    expect(parseEvdsDate("bad")).toBeNull();
  });
});
