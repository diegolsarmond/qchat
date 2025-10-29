import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("migration de credentials inclui coluna user_id", () => {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));
  assert.notEqual(files.length, 0, "deve haver arquivos de migração");

  const hasUserIdMigration = files.some((file) => {
    const content = readFileSync(join(migrationsDir, file), "utf-8");
    const normalized = content.replace(/\s+/g, " ").toLowerCase();
    return (
      normalized.includes("alter table public.credentials") &&
      normalized.includes("add column if not exists user_id uuid") &&
      normalized.includes("references auth.users(id)")
    );
  });

  assert.equal(hasUserIdMigration, true, "migração deve adicionar coluna user_id com referência a auth.users");
});
