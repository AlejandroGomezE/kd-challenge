// Test data only (docs/build-spec.md §4) — `.test` domains, no real people.
// Shared by the seed script and the test suites.
export const SEED_TENANTS = [
  { slug: "acme", name: "Acme Corp", project: "Acme Website Revamp" },
  { slug: "globex", name: "Globex Inc", project: "Globex Data Migration" },
] as const;

export const SEED_USERS = [
  { id: "user_ada", email: "ada@acme.test", name: "Ada (Acme admin)", memberships: [{ tenant: "acme", role: "admin" }] },
  { id: "user_ben", email: "ben@globex.test", name: "Ben (Globex editor)", memberships: [{ tenant: "globex", role: "editor" }] },
  { id: "user_vic", email: "vic@acme.test", name: "Vic (Acme viewer)", memberships: [{ tenant: "acme", role: "viewer" }] },
] as const;
