// Response shapes of the API (mirrors backend/src/**/dto/*-response.dto.ts). Dates arrive as
// ISO-8601 strings. Nullable fields are `null` (never missing) in responses.

// `GET /auth/me`, and what sign-in / sign-up resolve to.
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  // null for accounts created before display names existed.
  displayName: string | null;
}
