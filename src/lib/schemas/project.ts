import { z } from "zod";

export const PROJECT_NAME_MAX = 80;

// Shared by the client forms and the route handlers; the server is authoritative.
// .strict(): an unknown key (e.g. a client-supplied tenantId) is a 400, never silently honoured.
export const projectNameSchema = z
  .object({
    name: z
      .string({ error: "Name is required" })
      .trim()
      .min(1, "Name is required")
      .max(PROJECT_NAME_MAX, `Name must be at most ${PROJECT_NAME_MAX} characters`),
  })
  .strict();

export type ProjectNameInput = z.infer<typeof projectNameSchema>;
