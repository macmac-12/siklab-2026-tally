/** Validate a private production backup inside a disposable local database. */
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { pool, transaction, userById } from "../src/lib/server/store";
import { restoreBackup } from "../src/lib/server/backup";
async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error("Supply the private backup filename.");
  process.loadEnvFile(".env.local");
  const localUrl = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(localUrl.hostname))
    throw new Error("Backup validation requires a local database.");
  const control = new Pool({ connectionString: localUrl.toString() });
  const database = `siklab_backup_check_${process.pid}`;
  let created = false;
  try {
    await control.query(`CREATE DATABASE ${database}`);
    created = true;
    localUrl.pathname = `/${database}`;
    process.env.DATABASE_URL = localUrl.toString();
    process.env.DATA_ROOT = "";
    process.env.SUPERADMIN_EMAIL = "backup-check@siklab.test";
    process.env.SUPERADMIN_PASSWORD = randomBytes(24).toString("hex");
    const migration = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/migrate.ts"],
      { env: process.env, encoding: "utf8" },
    );
    if (migration.status)
      throw new Error("Disposable backup database migration failed.");
    const backup = JSON.parse(await readFile(filename, "utf8"));
    const owner = backup.tables.accounts.find(
      (account: { active: boolean; role: string }) =>
        account.active && account.role === "superadmin",
    );
    if (!owner) throw new Error("The backup has no active superadministrator.");
    // Match the actor identity in this disposable database without changing the backup.
    const temporaryHash = (
      await pool().query("SELECT password_hash FROM accounts LIMIT 1")
    ).rows[0].password_hash;
    await pool().query(
      "INSERT INTO accounts(id,name,email,password_hash,role,active,must_reset) VALUES($1,'Backup validation','validation@siklab.test',$2,'superadmin',true,false)",
      [owner.id, temporaryHash],
    );
    const admin = await transaction((db) => userById(db, owner.id));
    const result = await restoreBackup(admin!, { backup, preview: true });
    console.log(
      JSON.stringify({
        valid: true,
        version: backup.version,
        checksum: backup.checksum,
        counts: result.counts,
      }),
    );
  } finally {
    await pool().end();
    if (created) await control.query(`DROP DATABASE ${database} WITH (FORCE)`);
    await control.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
