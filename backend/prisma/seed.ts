import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const plants = [
  { code: 'P1', name: 'Plant 1 - Headers & Tube Processing' },
  { code: 'P2', name: 'Plant 2 - Sheet Metal & Stamping' },
  { code: 'P3', name: 'Plant 3 - Final Assembly & Integration' }
];

async function main() {
  console.log('🌱 Starting plant seeding...');
  for (const plant of plants) {
    const upserted = await prisma.plant.upsert({
      where: { code: plant.code },
      update: { name: plant.name },
      create: plant
    });
    console.log(`✓ Upserted plant: [${upserted.code}] ${upserted.name} (${upserted.id})`);
  }
  console.log('✅ Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
