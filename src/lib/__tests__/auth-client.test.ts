import { describe, expect, it } from "vitest";
import { authClient } from "../auth-client";

describe("authClient", () => {
  it("exposes email sign-in and sign-out", () => {
    expect(typeof authClient.signIn.email).toBe("function");
    expect(typeof authClient.signOut).toBe("function");
  });
});
