/** Run explicitly with .env.cloud.local after db:migrate, never during a build. */
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

async function main() {
const connectionString = process.env.ADMIN_DATABASE_URL;
if (!connectionString || !new URL(connectionString).hostname.endsWith(".pooler.supabase.com"))
  throw new Error("An explicit Supabase administrative connection is required.");
const db = new Client({connectionString});
await db.connect();
try {
  await db.query("BEGIN");
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tableowner=current_user")).rows;
  if (!tables.some(t => t.tablename === "maintenance_operations")) throw new Error("Run all migrations first.");
  for (const {tablename} of tables) {
    const name = '"' + String(tablename).replaceAll('"', '""') + '"';
    await db.query(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`);
    await db.query(`REVOKE ALL ON public.${name} FROM PUBLIC, anon, authenticated, service_role`);
    if (tablename !== "migrations") {
      await db.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${name} TO siklab_app`);
      await db.query(`DROP POLICY IF EXISTS siklab_server ON public.${name}`);
      await db.query(`CREATE POLICY siklab_server ON public.${name} FOR ALL TO siklab_app USING (true) WITH CHECK (true)`);
    }
  }
  await db.query("ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role");
  await db.query("COMMIT");
  console.log(`Restricted server access configured for ${tables.length} application tables.`);
} catch(error) { await db.query("ROLLBACK"); throw error; }
finally {await db.end();}

const storage = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: {persistSession:false,autoRefreshToken:false},
}).storage;
const name = process.env.BACKUP_STORAGE_BUCKET || "siklab-private-backups";
const existing = await storage.getBucket(name);
const settings = {public:false,fileSizeLimit:25_000_000,allowedMimeTypes:["application/json"]};
const result = existing.data ? await storage.updateBucket(name, settings) : await storage.createBucket(name, settings);
if(result.error) throw new Error(`Private bucket setup failed: ${result.error.message}`);
console.log("Private JSON backup storage configured (25 MB maximum).");
}
main().catch(error=>{console.error(error instanceof Error ? error.message : "Cloud configuration failed.");process.exitCode=1;});
