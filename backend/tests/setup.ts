import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

export function getTestDatabaseUrl(): string | null {
  const base = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!base) return null;

  try {
    const url = new URL(base);
    url.searchParams.set('schema', 'test');
    url.searchParams.delete('pgbouncer');
    return url.toString();
  } catch {
    return null;
  }
}

export async function setupTestDatabase(): Promise<PrismaClient | null> {
  const testUrl = getTestDatabaseUrl();
  if (!testUrl) {
    return null;
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: testUrl
      }
    }
  });

  try {
    // 1. Create schema test
    await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS "test";');

    // 2. Set search path to test
    await prisma.$executeRawUnsafe('SET search_path TO "test", public;');

    // 3. Check if tables already exist in test schema
    const existingTables = await prisma.$queryRawUnsafe<any[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'test' AND table_name = 'transfers';`
    );

    if (existingTables.length === 0) {
      const migrationPath = path.resolve(
        __dirname,
        '../prisma/migrations/20261031120000_init_sfg_tracker/migration.sql'
      );
      const sqlContent = fs.readFileSync(migrationPath, 'utf8');

      const statements = sqlContent
        .replace(/BEGIN\s+RAISE\s+EXCEPTION[\s\S]*?END;\s*\$\$\s*LANGUAGE\s*plpgsql;/g, (match) => {
          return match.replace(/;/g, '___SEMI___');
        })
        .split(';')
        .map((s) => s.replace(/___SEMI___/g, ';').trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        try {
          await prisma.$executeRawUnsafe(statement);
        } catch (err: any) {
          if (!err.message?.includes('already exists')) {
            console.warn('Migration statement warning:', err.message);
          }
        }
      }
    }

    // 4. Seed Plants P1, P2, P3 into test schema
    const plants = [
      { code: 'P1', name: 'Plant 1 - Headers & Tube Processing' },
      { code: 'P2', name: 'Plant 2 - Sheet Metal & Stamping' },
      { code: 'P3', name: 'Plant 3 - Final Assembly & Integration' }
    ];

    for (const p of plants) {
      await prisma.plant.upsert({
        where: { code: p.code },
        update: { name: p.name },
        create: p
      });
    }

    return prisma;
  } catch (err) {
    console.error('Failed to setup test database:', err);
    await prisma.$disconnect();
    return null;
  }
}

export async function cleanTestDatabase(prisma: PrismaClient) {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "test"."transfer_events" DISABLE TRIGGER trg_prevent_transfer_event_update;'
    );
    await prisma.$executeRawUnsafe('DELETE FROM "test"."transfer_events";');
    await prisma.$executeRawUnsafe('DELETE FROM "test"."transfers";');
    await prisma.$executeRawUnsafe('DELETE FROM "test"."daily_counters";');
    await prisma.$executeRawUnsafe('DELETE FROM "test"."idempotency_keys";');
  } catch (err: any) {
    console.warn('cleanTestDatabase cleanup note:', err.message);
  } finally {
    try {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "test"."transfer_events" ENABLE TRIGGER trg_prevent_transfer_event_update;'
      );
    } catch {}
  }
}
