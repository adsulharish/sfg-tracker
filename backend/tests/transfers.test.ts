import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { setupTestDatabase, cleanTestDatabase } from './setup.js';
import { TransferService } from '../src/services/transferService.js';
import { buildServer } from '../src/server.js';
import { defaultJobOrderProvider } from '../src/providers/jobOrders.js';

describe('SFG Transfer Tracker Core Service & API Tests', { timeout: 30000, hookTimeout: 60000 }, () => {
  let prisma: PrismaClient | null = null;
  let service: TransferService;
  let app: any;
  let plantP1: any;
  let plantP2: any;
  let plantP3: any;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    if (prisma) {
      service = new TransferService(prisma, defaultJobOrderProvider);
      plantP1 = await prisma.plant.findUnique({ where: { code: 'P1' } });
      plantP2 = await prisma.plant.findUnique({ where: { code: 'P2' } });
      plantP3 = await prisma.plant.findUnique({ where: { code: 'P3' } });
    }
    app = await buildServer();
  });

  afterAll(async () => {
    if (prisma) {
      await cleanTestDatabase(prisma);
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    if (prisma) {
      await cleanTestDatabase(prisma);
    }
  });

  it('1. Happy path: create transfer from P1 to P3, confirm receipt at P3 -> RECEIVED', async () => {
    if (!prisma) {
      console.warn('Skipping test: No PostgreSQL DATABASE_URL configured.');
      return;
    }

    // 1. Create transfer
    const transfer = await service.createTransfer(
      {
        jobOrderNo: 'JO-2026-1001',
        sfgCode: 'SFG-HDR-001',
        sfgDescription: 'Refrigerant Distribution Header 3-Way',
        department: 'HEADERS',
        qtySent: 20,
        uom: 'PCS',
        fromPlantId: plantP1.id,
        toPlantId: plantP3.id,
        remarks: 'Test batch'
      },
      { plantCode: 'P1', actorName: 'Sender Alex' }
    );

    expect(transfer.transferNo).toMatch(/^TRF-\d{8}-\d{4}$/);
    expect(transfer.status).toBe('IN_TRANSIT');
    expect(transfer.sentBy).toBe('Sender Alex');

    // Verify SENT event was written
    const eventsBefore = await service.getTimeline(transfer.transferNo);
    expect(eventsBefore).toHaveLength(1);
    expect(eventsBefore[0].eventType).toBe('SENT');

    // 2. Destination plant confirms receipt
    const received = await service.confirmReceipt(
      transfer.transferNo,
      { qtyReceived: 20, remarks: 'Received all 20 units' },
      { plantCode: 'P3', actorName: 'Receiver Jordan' }
    );

    expect(received.status).toBe('RECEIVED');
    expect(received.qtyReceived).toBe(20);
    expect(received.receivedBy).toBe('Receiver Jordan');

    // Verify timeline has 2 events
    const timeline = await service.getTimeline(transfer.transferNo);
    expect(timeline).toHaveLength(2);
    expect(timeline[1].eventType).toBe('RECEIVED');
  });

  it('2. Partial receipt: qtyReceived < qtySent -> PARTIAL', async () => {
    if (!prisma) return;

    const transfer = await service.createTransfer(
      {
        jobOrderNo: 'JO-2026-1001',
        sfgCode: 'SFG-HDR-001',
        sfgDescription: 'Refrigerant Distribution Header 3-Way',
        department: 'HEADERS',
        qtySent: 25,
        uom: 'PCS',
        fromPlantId: plantP1.id,
        toPlantId: plantP3.id
      },
      { plantCode: 'P1', actorName: 'Alex' }
    );

    const received = await service.confirmReceipt(
      transfer.transferNo,
      { qtyReceived: 18, remarks: '7 damaged in transit' },
      { plantCode: 'P3', actorName: 'Jordan' }
    );

    expect(received.status).toBe('PARTIAL');
    expect(received.qtyReceived).toBe(18);

    const timeline = await service.getTimeline(transfer.transferNo);
    expect(timeline).toHaveLength(2);
    expect(timeline[1].eventType).toBe('RECEIVED');
    expect((timeline[1].payload as any).discrepancyDelta).toBe(-7);
  });

  it('3. Over-receipt: qtyReceived > qtySent -> DISCREPANCY & DISCREPANCY_FLAGGED', async () => {
    if (!prisma) return;

    const transfer = await service.createTransfer(
      {
        jobOrderNo: 'JO-2026-1001',
        sfgCode: 'SFG-HDR-001',
        sfgDescription: 'Refrigerant Distribution Header 3-Way',
        department: 'HEADERS',
        qtySent: 10,
        uom: 'PCS',
        fromPlantId: plantP1.id,
        toPlantId: plantP3.id
      },
      { plantCode: 'P1', actorName: 'Alex' }
    );

    const received = await service.confirmReceipt(
      transfer.transferNo,
      { qtyReceived: 12, remarks: 'Extra 2 pcs found in pallet' },
      { plantCode: 'P3', actorName: 'Jordan' }
    );

    expect(received.status).toBe('DISCREPANCY');
    expect(received.qtyReceived).toBe(12);

    const timeline = await service.getTimeline(transfer.transferNo);
    expect(timeline).toHaveLength(2);
    expect(timeline[1].eventType).toBe('DISCREPANCY_FLAGGED');
    expect((timeline[1].payload as any).discrepancyDelta).toBe(2);
  });

  it('4. Wrong-plant receipt rejected: P2 cannot receive transfer destined for P3', async () => {
    if (!prisma) return;

    const transfer = await service.createTransfer(
      {
        jobOrderNo: 'JO-2026-1001',
        sfgCode: 'SFG-HDR-001',
        sfgDescription: 'Refrigerant Distribution Header 3-Way',
        department: 'HEADERS',
        qtySent: 10,
        uom: 'PCS',
        fromPlantId: plantP1.id,
        toPlantId: plantP3.id
      },
      { plantCode: 'P1', actorName: 'Alex' }
    );

    // Operator at P2 tries to confirm receipt
    await expect(
      service.confirmReceipt(
        transfer.transferNo,
        { qtyReceived: 10 },
        { plantCode: 'P2', actorName: 'Wrong Plant Operator' }
      )
    ).rejects.toThrowError(/Only the destination plant 'P3' can confirm receipt/);
  });

  it('5. Double receipt rejected: ALREADY_RECEIVED on second attempt', async () => {
    if (!prisma) return;

    const transfer = await service.createTransfer(
      {
        jobOrderNo: 'JO-2026-1001',
        sfgCode: 'SFG-HDR-001',
        sfgDescription: 'Refrigerant Distribution Header 3-Way',
        department: 'HEADERS',
        qtySent: 10,
        uom: 'PCS',
        fromPlantId: plantP1.id,
        toPlantId: plantP3.id
      },
      { plantCode: 'P1', actorName: 'Alex' }
    );

    await service.confirmReceipt(
      transfer.transferNo,
      { qtyReceived: 10 },
      { plantCode: 'P3', actorName: 'Jordan' }
    );

    // Attempt second receipt
    await expect(
      service.confirmReceipt(
        transfer.transferNo,
        { qtyReceived: 10 },
        { plantCode: 'P3', actorName: 'Jordan' }
      )
    ).rejects.toThrowError(/has already been received/);
  });

  it('6. Cancel rules: sending plant can cancel while IN_TRANSIT, receiving plant cannot', async () => {
    if (!prisma) return;

    const transfer = await service.createTransfer(
      {
        jobOrderNo: 'JO-2026-1001',
        sfgCode: 'SFG-HDR-001',
        sfgDescription: 'Refrigerant Distribution Header 3-Way',
        department: 'HEADERS',
        qtySent: 10,
        uom: 'PCS',
        fromPlantId: plantP1.id,
        toPlantId: plantP3.id
      },
      { plantCode: 'P1', actorName: 'Alex' }
    );

    // P3 tries to cancel -> Rejected
    await expect(
      service.cancelTransfer(
        transfer.transferNo,
        { reason: 'Unauthorized cancel' },
        { plantCode: 'P3', actorName: 'Jordan' }
      )
    ).rejects.toThrowError(/Only sending plant 'P1' can cancel/);

    // P1 cancels -> Success
    const cancelled = await service.cancelTransfer(
      transfer.transferNo,
      { reason: 'Dispatched wrong revision' },
      { plantCode: 'P1', actorName: 'Alex' }
    );

    expect(cancelled.status).toBe('CANCELLED');

    // Cannot cancel again
    await expect(
      service.cancelTransfer(
        transfer.transferNo,
        { reason: 'Cancel again' },
        { plantCode: 'P1', actorName: 'Alex' }
      )
    ).rejects.toThrowError(/Only transfers currently IN_TRANSIT can be cancelled/);

    // Cannot receive cancelled transfer
    await expect(
      service.confirmReceipt(
        transfer.transferNo,
        { qtyReceived: 10 },
        { plantCode: 'P3', actorName: 'Jordan' }
      )
    ).rejects.toThrowError(/Cannot confirm receipt on a cancelled transfer/);
  });

  it('7. Idempotent replay: exact replay returns cached response, different payload conflicts', async () => {
    const key = `test-key-${Date.now()}`;
    const payload = {
      jobOrderNo: 'JO-2026-1001',
      sfgCode: 'SFG-HDR-001',
      sfgDescription: 'Refrigerant Distribution Header 3-Way',
      department: 'HEADERS',
      qtySent: 15,
      uom: 'PCS',
      fromPlantId: 'P1',
      toPlantId: 'P3'
    };

    // First request
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/transfers',
      headers: {
        'x-plant-code': 'P1',
        'x-actor-name': 'Alex',
        'idempotency-key': key,
        'content-type': 'application/json'
      },
      payload
    });

    if (prisma) {
      expect(res1.statusCode).toBe(201);
      const data1 = JSON.parse(res1.body);

      // Replay exact same request
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/transfers',
        headers: {
          'x-plant-code': 'P1',
          'x-actor-name': 'Alex',
          'idempotency-key': key,
          'content-type': 'application/json'
        },
        payload
      });

      expect(res2.statusCode).toBe(200);
      expect(res2.headers['x-idempotent-replay']).toBe('true');
      const data2 = JSON.parse(res2.body);
      expect(data2.transferNo).toBe(data1.transferNo);

      // Same key with different payload -> 409 IDEMPOTENCY_CONFLICT
      const res3 = await app.inject({
        method: 'POST',
        url: '/api/v1/transfers',
        headers: {
          'x-plant-code': 'P1',
          'x-actor-name': 'Alex',
          'idempotency-key': key,
          'content-type': 'application/json'
        },
        payload: {
          ...payload,
          qtySent: 999
        }
      });

      expect(res3.statusCode).toBe(409);
      const data3 = JSON.parse(res3.body);
      expect(data3.code).toBe('IDEMPOTENCY_CONFLICT');
    }
  });

  it('8. Concurrent transfer-number generation produces unique numbers', async () => {
    if (!prisma) return;

    const count = 3;
    const promises = Array.from({ length: count }, (_, i) =>
      service.createTransfer(
        {
          jobOrderNo: 'JO-2026-1001',
          sfgCode: 'SFG-HDR-001',
          sfgDescription: 'Refrigerant Distribution Header 3-Way',
          department: 'HEADERS',
          qtySent: 5,
          uom: 'PCS',
          fromPlantId: plantP1.id,
          toPlantId: plantP3.id,
          remarks: `Concurrent test ${i}`
        },
        { plantCode: 'P1', actorName: `Worker ${i}` }
      )
    );

    const results = await Promise.all(promises);
    const transferNumbers = results.map((t) => t.transferNo);
    const uniqueSet = new Set(transferNumbers);

    expect(results).toHaveLength(count);
    expect(uniqueSet.size).toBe(count);
  });

  it('9. Database trigger blocks UPDATE and DELETE on TransferEvent', async () => {
    if (!prisma) return;

    const transfer = await service.createTransfer(
      {
        jobOrderNo: 'JO-2026-1001',
        sfgCode: 'SFG-HDR-001',
        sfgDescription: 'Refrigerant Distribution Header 3-Way',
        department: 'HEADERS',
        qtySent: 10,
        uom: 'PCS',
        fromPlantId: plantP1.id,
        toPlantId: plantP3.id
      },
      { plantCode: 'P1', actorName: 'Alex' }
    );

    const event = await prisma.transferEvent.findFirst({
      where: { transferId: transfer.id }
    });
    expect(event).toBeDefined();

    // Direct UPDATE on transfer_events must fail via Postgres trigger
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "test"."transfer_events" SET actor = 'Malicious Update' WHERE id = '${event!.id}'`
      )
    ).rejects.toThrowError(/TransferEvent table is append-only/);

    // Direct DELETE on transfer_events must fail via Postgres trigger
    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM "test"."transfer_events" WHERE id = '${event!.id}'`
      )
    ).rejects.toThrowError(/TransferEvent table is append-only/);
  });
});
