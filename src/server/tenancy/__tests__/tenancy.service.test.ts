import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("../membership.repository", () => ({ findMembershipBySlug: vi.fn(), listMembershipsForUser: vi.fn() }));

const { auth } = await import("../../auth");
const { findMembershipBySlug } = await import("../membership.repository");
const { requireMembership, requireSession } = await import("../tenancy.service");

const user = { id: "u1", email: "u1@acme.test", name: "U1" };
const tenant = { id: "t1", slug: "acme", name: "Acme Corp" };

describe("requireSession", () => {
  it("throws UNAUTHENTICATED without a session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(requireSession(new Headers())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("requireMembership", () => {
  beforeEach(() => vi.mocked(findMembershipBySlug).mockReset());

  it("is NOT_FOUND for a non-member (same as an unknown tenant)", async () => {
    vi.mocked(findMembershipBySlug).mockResolvedValue(null);
    await expect(requireMembership(user, "globex")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([
    ["viewer", "viewer", true],
    ["viewer", "editor", false],
    ["editor", "editor", true],
    ["admin", "editor", true],
  ] as const)("role %s with minRole %s → allowed: %s", async (role, minRole, allowed) => {
    vi.mocked(findMembershipBySlug).mockResolvedValue({ role, tenant });
    const result = requireMembership(user, "acme", minRole);
    if (allowed) await expect(result).resolves.toMatchObject({ tenantId: "t1", role, userId: "u1" });
    else await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
