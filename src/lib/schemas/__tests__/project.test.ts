import { describe, expect, it } from "vitest";
import { projectNameSchema } from "../project";

describe("projectNameSchema", () => {
  it("trims and accepts 1-80 characters", () => {
    expect(projectNameSchema.parse({ name: "  Launch  " })).toEqual({ name: "Launch" });
    expect(projectNameSchema.safeParse({ name: "x".repeat(80) }).success).toBe(true);
  });

  it.each([[""], ["   "], ["x".repeat(81)], [42], [null]])("rejects %j", (name) => {
    expect(projectNameSchema.safeParse({ name }).success).toBe(false);
  });

  it("rejects unknown keys such as a client-supplied tenantId", () => {
    expect(projectNameSchema.safeParse({ name: "Ok", tenantId: "t1" }).success).toBe(false);
  });
});
