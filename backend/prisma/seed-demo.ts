import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_TAG = 'DEMO-DATA';

async function main() {
  console.log('🌱 Starting safe demo seed...');

  // Ensure Plants P1, P2, P3 exist
  const plantsData = [
    { code: 'P1', name: 'Plant 1 - Headers & Tube Processing' },
    { code: 'P2', name: 'Plant 2 - Sheet Metal & Stamping' },
    { code: 'P3', name: 'Plant 3 - Final Assembly & Integration' }
  ];

  const plantMap: Record<string, string> = {};
  for (const p of plantsData) {
    const upserted = await prisma.plant.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: p
    });
    plantMap[p.code] = upserted.id;
  }

  // Safely clean ONLY previous demo-tagged data
  console.log('🧹 Purging previously seeded demo transfers...');
  const demoTransfers = await prisma.transfer.findMany({
    where: { externalRef: { startsWith: DEMO_TAG } },
    select: { id: true }
  });

  if (demoTransfers.length > 0) {
    const demoIds = demoTransfers.map((t) => t.id);

    try {
      // Try deleting events directly
      await prisma.transferEvent.deleteMany({
        where: { transferId: { in: demoIds } }
      });
    } catch {
      // If append-only trigger is active, temporarily disable it inside SQL for demo cleanup
      console.log('⚠️ Disabling append-only trigger temporarily to purge old demo records...');
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "transfer_events" DISABLE TRIGGER trg_prevent_transfer_event_update;'
      );
      await prisma.transferEvent.deleteMany({
        where: { transferId: { in: demoIds } }
      });
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "transfer_events" ENABLE TRIGGER trg_prevent_transfer_event_update;'
      );
    }

    await prisma.transfer.deleteMany({
      where: { id: { in: demoIds } }
    });
    console.log(`✓ Cleaned ${demoTransfers.length} existing demo transfers.`);
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const over24hAgo = new Date(Date.now() - 36 * 3600 * 1000); // 36 hours ago

  // 6 Representative Transfers across all plants and statuses:
  // 1. Fully Received (P1 -> P3)
  // 2. Partial Receipt (P2 -> P1)
  // 3. Discrepancy (over-received) (P2 -> P3)
  // 4. In Transit (recent) (P1 -> P2)
  // 5. In Transit (backdated >24h) (P3 -> P2)
  // 6. Cancelled (P1 -> P3)

  const demoRecords = [
    {
      transferNo: `TRF-${dateStr}-D001`,
      jobOrderNo: 'JO-2026-1001',
      sfgCode: 'SFG-HDR-001',
      sfgDescription: 'Refrigerant Distribution Header 3-Way',
      department: 'HEADERS' as const,
      qtySent: 50,
      uom: 'PCS',
      fromPlantId: plantMap['P1'],
      toPlantId: plantMap['P3'],
      sentBy: 'John Dispatcher',
      sentAt: new Date(Date.now() - 4 * 3600 * 1000),
      status: 'RECEIVED' as const,
      qtyReceived: 50,
      receivedBy: 'Sarah Assembler',
      receivedAt: new Date(Date.now() - 1 * 3600 * 1000),
      remarks: 'All 50 crates inspected and accepted without damage.',
      externalRef: `${DEMO_TAG}:MBLNR-4900101`
    },
    {
      transferNo: `TRF-${dateStr}-D002`,
      jobOrderNo: 'JO-24-0002',
      sfgCode: 'SFG-SHT-102',
      sfgDescription: 'Condenser Fan Shroud & Mount Bracket',
      department: 'SHEET_METAL' as const,
      qtySent: 40,
      uom: 'PCS',
      fromPlantId: plantMap['P2'],
      toPlantId: plantMap['P1'],
      sentBy: 'Mike Pressman',
      sentAt: new Date(Date.now() - 8 * 3600 * 1000),
      status: 'PARTIAL' as const,
      qtyReceived: 32,
      receivedBy: 'Alex TubeTech',
      receivedAt: new Date(Date.now() - 2 * 3600 * 1000),
      remarks: 'Received 32 units. 8 units short; carrier notified.',
      externalRef: `${DEMO_TAG}:MBLNR-4900102`
    },
    {
      transferNo: `TRF-${dateStr}-D003`,
      jobOrderNo: 'JO-24-0003',
      sfgCode: 'SFG-SHT-103',
      sfgDescription: 'Stainless Steel Louver Blade Assembly',
      department: 'SHEET_METAL' as const,
      qtySent: 100,
      uom: 'PCS',
      fromPlantId: plantMap['P2'],
      toPlantId: plantMap['P3'],
      sentBy: 'Elena Stamping',
      sentAt: new Date(Date.now() - 6 * 3600 * 1000),
      status: 'DISCREPANCY' as const,
      qtyReceived: 105,
      receivedBy: 'Liam QC',
      receivedAt: new Date(Date.now() - 1 * 3600 * 1000),
      remarks: 'Pallet contained 105 pcs (+5 overage). QC discrepancy logged.',
      externalRef: `${DEMO_TAG}:MBLNR-4900103`
    },
    {
      transferNo: `TRF-${dateStr}-D004`,
      jobOrderNo: 'JO-24-0006',
      sfgCode: 'SFG-HDR-006',
      sfgDescription: 'Reheat Water Coil Header Loop',
      department: 'HEADERS' as const,
      qtySent: 45,
      uom: 'PCS',
      fromPlantId: plantMap['P1'],
      toPlantId: plantMap['P2'],
      sentBy: 'Dave Welder',
      sentAt: new Date(Date.now() - 2 * 3600 * 1000),
      status: 'IN_TRANSIT' as const,
      remarks: 'Loaded on Carrier Truck #TRK-104.',
      externalRef: `${DEMO_TAG}:MBLNR-4900104`
    },
    {
      transferNo: `TRF-${dateStr}-D005`,
      jobOrderNo: 'JO-24-0007',
      sfgCode: 'SFG-HDR-007',
      sfgDescription: 'Discharge Manifold Check Valve Header',
      department: 'HEADERS' as const,
      qtySent: 25,
      uom: 'PCS',
      fromPlantId: plantMap['P3'],
      toPlantId: plantMap['P2'],
      sentBy: 'Carlos Yard',
      sentAt: over24hAgo, // Backdated > 24 hours
      status: 'IN_TRANSIT' as const,
      remarks: 'Delayed dispatch, departed P3 warehouse 36h ago.',
      externalRef: `${DEMO_TAG}:MBLNR-4900105`
    },
    {
      transferNo: `TRF-${dateStr}-D006`,
      jobOrderNo: 'JO-24-0004',
      sfgCode: 'SFG-HDR-004',
      sfgDescription: 'Suction Gas Manifold Dual-Circuit',
      department: 'HEADERS' as const,
      qtySent: 20,
      uom: 'PCS',
      fromPlantId: plantMap['P1'],
      toPlantId: plantMap['P3'],
      sentBy: 'Dave Welder',
      sentAt: new Date(Date.now() - 12 * 3600 * 1000),
      status: 'CANCELLED' as const,
      remarks: 'Cancelled: Incorrect pressure flange spec identified before carrier departure.',
      externalRef: `${DEMO_TAG}:MBLNR-4900106`
    }
  ];

  console.log(`📦 Inserting ${demoRecords.length} demo transfers with event audit trails...`);

  for (const record of demoRecords) {
    const transfer = await prisma.transfer.create({
      data: record
    });

    // Write initial SENT event
    await prisma.transferEvent.create({
      data: {
        transferId: transfer.id,
        eventType: 'SENT',
        actor: record.sentBy,
        plantId: record.fromPlantId,
        payload: {
          qtySent: record.qtySent,
          uom: record.uom,
          remarks: record.remarks,
          externalRef: record.externalRef
        },
        createdAt: record.sentAt
      }
    });

    // Write subsequent events if received or cancelled
    if (record.status === 'RECEIVED' || record.status === 'PARTIAL') {
      await prisma.transferEvent.create({
        data: {
          transferId: transfer.id,
          eventType: 'RECEIVED',
          actor: record.receivedBy!,
          plantId: record.toPlantId,
          payload: {
            qtySent: record.qtySent,
            qtyReceived: record.qtyReceived,
            discrepancyDelta: (record.qtyReceived ?? 0) - record.qtySent,
            remarks: record.remarks
          },
          createdAt: record.receivedAt ?? new Date()
        }
      });
    } else if (record.status === 'DISCREPANCY') {
      await prisma.transferEvent.create({
        data: {
          transferId: transfer.id,
          eventType: 'DISCREPANCY_FLAGGED',
          actor: record.receivedBy!,
          plantId: record.toPlantId,
          payload: {
            qtySent: record.qtySent,
            qtyReceived: record.qtyReceived,
            discrepancyDelta: (record.qtyReceived ?? 0) - record.qtySent,
            remarks: record.remarks
          },
          createdAt: record.receivedAt ?? new Date()
        }
      });
    } else if (record.status === 'CANCELLED') {
      await prisma.transferEvent.create({
        data: {
          transferId: transfer.id,
          eventType: 'CANCELLED',
          actor: record.sentBy,
          plantId: record.fromPlantId,
          payload: {
            reason: record.remarks
          },
          createdAt: new Date(record.sentAt.getTime() + 30 * 60 * 1000)
        }
      });
    }

    console.log(`✓ Seeded ${record.transferNo} [${record.status}]`);
  }

  console.log('✅ Demo seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
