// Starts the app + local Supabase double in-process for the E2E run and closes it at the end
// (Playwright's webServer option takes minutes to stop a process tree on Windows).
import { startDevServer } from '../support/dev-server.mjs';

export default async function globalSetup() {
  const server = await startDevServer({ port: 4190, fake: true, fakePort: 54340 });
  return async () => { await server.close(); };
}
