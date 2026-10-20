import "dotenv/config";
import resetAndSeed from "../tests/integration/global-setup";

// Same fresh, seeded _test database the integration suite uses.
export default async function globalSetup() {
  await resetAndSeed();
}
