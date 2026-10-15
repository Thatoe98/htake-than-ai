import { describe, expect, it } from "vitest";
import { isUuid } from "./ids";

describe("isUuid", () => {
  it("accepts a uuid", () => {
    expect(isUuid("3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b")).toBe(true);
  });
  it.each(["", "abc", "3f2b8c1e5a4d4e6f9b7a1c2d3e4f5a6b", "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'; drop"])(
    "rejects %j",
    (s) => expect(isUuid(s)).toBe(false),
  );
});
