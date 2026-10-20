import { handle, json } from "@/server/http";
import { listMyTenants, requireSession } from "@/server/tenancy/tenancy.service";

export const GET = handle(async (request) => {
  const user = await requireSession(request.headers);
  return json({ tenants: await listMyTenants(user) });
});
