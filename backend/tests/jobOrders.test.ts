import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  FileJobOrderProvider,
  SapJobOrderProvider,
  createJobOrderProvider
} from '../src/providers/jobOrders.js';

describe('JobOrderProvider Implementations', () => {
  const dataPath = path.resolve(__dirname, '../data/job_orders.json');

  describe('FileJobOrderProvider', () => {
    it('should successfully load and validate all job orders from json at startup', async () => {
      const provider = new FileJobOrderProvider(dataPath);
      const orders = await provider.listJobOrders();

      expect(orders.length).toBeGreaterThanOrEqual(8);
      expect(orders[0]).toHaveProperty('jobOrderNo');
      expect(orders[0]).toHaveProperty('productCode');
      expect(orders[0]).toHaveProperty('productName');
      expect(orders[0]).toHaveProperty('sfgs');
      expect(orders[0].sfgs.length).toBeGreaterThan(0);
    });

    it('should retrieve a single job order by jobOrderNo case-insensitively', async () => {
      const provider = new FileJobOrderProvider(dataPath);
      const order = await provider.getJobOrder('jo-2026-1001');

      expect(order).not.toBeNull();
      expect(order?.jobOrderNo).toBe('JO-2026-1001');
      expect(order?.productCode).toBe('FG-HVAC-X500');

      const missing = await provider.getJobOrder('NON-EXISTENT-JO');
      expect(missing).toBeNull();
    });

    it('should validate valid SFG child part belonging to the job order', async () => {
      const provider = new FileJobOrderProvider(dataPath);

      const result = await provider.validateSfg('JO-2026-1001', 'SFG-HDR-001');
      expect(result.valid).toBe(true);
      expect(result.sfg).toBeDefined();
      expect(result.sfg?.sfgCode).toBe('SFG-HDR-001');
      expect(result.sfg?.department).toBe('HEADERS');
      expect(result.sfg?.requiredQty).toBe(50);
    });

    it('should reject invalid SFG not belonging to the job order', async () => {
      const provider = new FileJobOrderProvider(dataPath);

      const result = await provider.validateSfg('JO-2026-1001', 'SFG-HDR-999');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SFG_NOT_ON_JOB_ORDER');
    });

    it('should reject validation when job order does not exist', async () => {
      const provider = new FileJobOrderProvider(dataPath);

      const result = await provider.validateSfg('UNKNOWN-JO', 'SFG-HDR-001');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('JOB_ORDER_NOT_FOUND');
    });

    it('should execute onTransferEvent hook as a no-op without error', async () => {
      const provider = new FileJobOrderProvider(dataPath);
      await expect(provider.onTransferEvent({}, {})).resolves.toBeUndefined();
    });

    it('should cover transfers across all plant pairs (P1->P2, P1->P3, P2->P1, P2->P3, P3->P1, P3->P2)', async () => {
      const provider = new FileJobOrderProvider(dataPath);
      const orders = await provider.listJobOrders();

      const pairs = new Set<string>();
      for (const order of orders) {
        for (const sfg of order.sfgs) {
          pairs.add(`${sfg.producingPlant}->${sfg.consumingPlant}`);
        }
      }

      expect(pairs.has('P1->P2')).toBe(true);
      expect(pairs.has('P1->P3')).toBe(true);
      expect(pairs.has('P2->P1')).toBe(true);
      expect(pairs.has('P2->P3')).toBe(true);
      expect(pairs.has('P3->P1')).toBe(true);
      expect(pairs.has('P3->P2')).toBe(true);
    });

    it('should fail validation with descriptive Zod error when JSON schema is violated', () => {
      const tempPath = path.resolve(__dirname, '../data/temp_invalid.json');
      fs.writeFileSync(
        tempPath,
        JSON.stringify([
          {
            jobOrderNo: 'BAD-JO',
            // missing productCode, productName, status, sfgs
          }
        ])
      );

      try {
        expect(() => new FileJobOrderProvider(tempPath)).toThrow();
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    });
  });

  describe('SapJobOrderProvider (Skeleton)', () => {
    const sapProvider = new SapJobOrderProvider();

    it('should throw not implemented on getJobOrder with SAP guidance', async () => {
      await expect(sapProvider.getJobOrder('JO-123')).rejects.toThrowError(
        /not implemented/i
      );
    });

    it('should throw not implemented on listJobOrders with SAP guidance', async () => {
      await expect(sapProvider.listJobOrders()).rejects.toThrowError(
        /not implemented/i
      );
    });

    it('should throw not implemented on validateSfg with SAP guidance', async () => {
      await expect(sapProvider.validateSfg('JO-123', 'SFG-1')).rejects.toThrowError(
        /not implemented/i
      );
    });

    it('should throw not implemented on onTransferEvent with SAP guidance', async () => {
      await expect(sapProvider.onTransferEvent({}, {})).rejects.toThrowError(
        /not implemented/i
      );
    });
  });

  describe('createJobOrderProvider Factory', () => {
    it('should instantiate FileJobOrderProvider when providerType is file or undefined', () => {
      const provider1 = createJobOrderProvider('file');
      expect(provider1).toBeInstanceOf(FileJobOrderProvider);

      const provider2 = createJobOrderProvider(undefined);
      expect(provider2).toBeInstanceOf(FileJobOrderProvider);
    });

    it('should instantiate SapJobOrderProvider when providerType is sap', () => {
      const provider = createJobOrderProvider('sap');
      expect(provider).toBeInstanceOf(SapJobOrderProvider);
    });
  });
});
