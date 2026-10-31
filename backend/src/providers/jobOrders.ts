import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export type Department = 'HEADERS' | 'SHEET_METAL';

export const sfgItemSchema = z.object({
  sfgCode: z.string().min(1),
  description: z.string().min(1),
  department: z.enum(['HEADERS', 'SHEET_METAL']),
  requiredQty: z.number().positive(),
  uom: z.string().min(1),
  producingPlant: z.enum(['P1', 'P2', 'P3']),
  consumingPlant: z.enum(['P1', 'P2', 'P3'])
});

export const jobOrderSchema = z.object({
  jobOrderNo: z.string().min(1),
  productCode: z.string().min(1),
  productName: z.string().min(1),
  status: z.string().min(1),
  plannedStart: z.string().min(1),
  sfgs: z.array(sfgItemSchema)
});

export type RequiredSFG = z.infer<typeof sfgItemSchema> & {
  qtyRequired?: number; // alias for backwards compatibility
};

export type JobOrder = z.infer<typeof jobOrderSchema> & {
  parentItemCode?: string; // alias for productCode
  parentDescription?: string; // alias for productName
  startDate?: string; // alias for plannedStart
  targetPlant?: string;
  plannedQty?: number;
  targetDate?: string;
  requiredSFGs: RequiredSFG[]; // alias for sfgs
};

export interface JobOrderProvider {
  getJobOrder(jobOrderNo: string): Promise<JobOrder | null>;
  listJobOrders(): Promise<JobOrder[]>;
  validateSfg(
    jobOrderNo: string,
    sfgCode: string
  ): Promise<{ valid: boolean; sfg?: RequiredSFG; error?: string }>;
  validateSFG(
    jobOrderNo: string,
    sfgCode: string
  ): Promise<{ valid: boolean; sfg?: RequiredSFG; error?: string }>;
  onTransferEvent(transfer: unknown, event: unknown): Promise<void>;
}

/**
 * FileJobOrderProvider:
 * Reads dummy parent build job orders from backend/data/job_orders.json
 * Validates the schema at startup with Zod.
 */
export class FileJobOrderProvider implements JobOrderProvider {
  private orders: Map<string, JobOrder> = new Map();

  constructor(filePath?: string) {
    const candidates = [
      filePath,
      path.resolve(process.cwd(), 'data/job_orders.json'),
      path.resolve(process.cwd(), 'backend/data/job_orders.json'),
      path.resolve(__dirname, '../../data/job_orders.json'),
      path.resolve(__dirname, '../data/job_orders.json'),
      path.resolve(__dirname, '../../../backend/data/job_orders.json')
    ].filter((p): p is string => Boolean(p));

    const finalPath = candidates.find((p) => fs.existsSync(p));
    if (!finalPath) {
      throw new Error(
        `Job orders data file not found at any candidate path: ${candidates.join(', ')}`
      );
    }

    this.loadAndValidate(finalPath);
  }

  private loadAndValidate(filePath: string) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Job orders data file not found at: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    const validated = z.array(jobOrderSchema).parse(parsed);

    for (const item of validated) {
      const enriched: JobOrder = {
        ...item,
        productCode: item.productCode,
        productName: item.productName,
        parentItemCode: item.productCode,
        parentDescription: item.productName,
        startDate: item.plannedStart,
        plannedStart: item.plannedStart,
        targetPlant: item.sfgs[0]?.consumingPlant || 'P3',
        plannedQty: item.sfgs[0]?.requiredQty || 25,
        targetDate: item.plannedStart,
        sfgs: item.sfgs,
        requiredSFGs: item.sfgs.map((s) => ({
          ...s,
          qtyRequired: s.requiredQty
        }))
      };
      this.orders.set(item.jobOrderNo.trim().toUpperCase(), enriched);
    }
  }

  async getJobOrder(jobOrderNo: string): Promise<JobOrder | null> {
    return this.orders.get(jobOrderNo.trim().toUpperCase()) || null;
  }

  async listJobOrders(): Promise<JobOrder[]> {
    return Array.from(this.orders.values());
  }

  async validateSfg(
    jobOrderNo: string,
    sfgCode: string
  ): Promise<{ valid: boolean; sfg?: RequiredSFG; error?: string }> {
    const order = await this.getJobOrder(jobOrderNo);
    if (!order) {
      return {
        valid: false,
        error: 'JOB_ORDER_NOT_FOUND'
      };
    }

    const sfg = order.sfgs.find(
      (item) => item.sfgCode.toUpperCase() === sfgCode.trim().toUpperCase()
    );

    if (!sfg) {
      return {
        valid: false,
        error: 'SFG_NOT_ON_JOB_ORDER'
      };
    }

    return {
      valid: true,
      sfg: {
        ...sfg,
        qtyRequired: sfg.requiredQty
      }
    };
  }

  async validateSFG(
    jobOrderNo: string,
    sfgCode: string
  ): Promise<{ valid: boolean; sfg?: RequiredSFG; error?: string }> {
    return this.validateSfg(jobOrderNo, sfgCode);
  }

  // Default no-op hook
  async onTransferEvent(_transfer: unknown, _event: unknown): Promise<void> {
    // No-op for file provider
  }
}

/**
 * SapJobOrderProvider (SKELETON):
 * Architectural skeleton illustrating planned enterprise SAP integration.
 * In production, this connector interfaces with SAP S/4HANA or SAP ECC via OData / RFC BAPIs.
 */
export class SapJobOrderProvider implements JobOrderProvider {
  /**
   * Retrieves SAP Production Order header and item details.
   * Maps to:
   * - SAP Object: Production Order (`AUFNR`) / Process Order (`AFKO`, `AFPO`)
   * - Standard BAPI: `BAPI_PRODORD_GET_DETAIL`
   * - OData API: `API_PRODUCTION_ORDER_2_SRV/A_ProductionOrder`
   */
  async getJobOrder(_jobOrderNo: string): Promise<JobOrder | null> {
    throw new Error('SapJobOrderProvider.getJobOrder is not implemented. Production target requires SAP RFC/OData connector.');
  }

  /**
   * Queries released or active Production Orders across manufacturing plants.
   * Maps to:
   * - SAP Object: Production Orders filtered by Plant (`WERKS`) and Status (`STAT` = I0002 RELEASED)
   * - Standard BAPI: `BAPI_PRODORD_GET_LIST`
   * - OData API: `API_PRODUCTION_ORDER_2_SRV/A_ProductionOrder?$filter=ProductionPlant eq '1000' and OrderIsReleased eq true`
   */
  async listJobOrders(): Promise<JobOrder[]> {
    throw new Error('SapJobOrderProvider.listJobOrders is not implemented. Production target requires SAP RFC/OData connector.');
  }

  /**
   * Validates SFG child material against Production Order Reservation / Component BOM.
   * Maps to:
   * - SAP Object: Order Reservation Items (`RESB`) where `RESB-AUFNR` = jobOrderNo and `RESB-MATNR` = sfgCode
   * - Confirms requirement quantity (`RESB-BDMNG`) and unit of measure (`RESB-MEINS`)
   */
  async validateSfg(
    _jobOrderNo: string,
    _sfgCode: string
  ): Promise<{ valid: boolean; sfg?: RequiredSFG; error?: string }> {
    throw new Error('SapJobOrderProvider.validateSfg is not implemented. Production target requires SAP RFC/OData connector.');
  }

  async validateSFG(
    jobOrderNo: string,
    sfgCode: string
  ): Promise<{ valid: boolean; sfg?: RequiredSFG; error?: string }> {
    return this.validateSfg(jobOrderNo, sfgCode);
  }

  /**
   * Synchronizes SFG Transfer Tracker events to SAP Material Documents and Stock Transport Orders.
   * Maps to:
   * 1. SENT Event:
   *    - Stock Transfer from Supplying Plant to In-Transit Stock.
   *    - Movement Type 351 (Transfer from unrestricted to stock in transit) or Outbound Delivery for STO (`VL01N`).
   *    - BAPI: `BAPI_GOODSMVT_CREATE` with code `GM_Code 04`.
   *    - The returned SAP Material Document Number (`MBLNR`) is stored in Transfer.externalRef.
   * 2. RECEIVED Event:
   *    - Goods Receipt from In-Transit Stock to Receiving Plant unrestricted inventory.
   *    - Movement Type 101 (Goods receipt for Stock Transport Order).
   *    - BAPI: `BAPI_GOODSMVT_CREATE` with code `GM_Code 01`.
   * 3. DISCREPANCY Event:
   *    - Flags overage or shortage on receipt.
   *    - Creates Quality Notification (`QM01`) via `BAPI_QUALNOT_CREATE`.
   * 4. CANCELLED Event:
   *    - Reverses goods movement prior to destination receipt.
   *    - Movement Type 352 (Reversal of stock transfer to transit).
   *    - BAPI: `BAPI_GOODSMVT_CANCEL`.
   */
  async onTransferEvent(_transfer: unknown, _event: unknown): Promise<void> {
    throw new Error('SapJobOrderProvider.onTransferEvent is not implemented. Production target requires SAP RFC/OData connector.');
  }
}

/**
 * Provider factory chosen by environment variable JOB_ORDER_PROVIDER=file|sap
 */
export function createJobOrderProvider(
  providerType: string = process.env.JOB_ORDER_PROVIDER || 'file'
): JobOrderProvider {
  switch (providerType.toLowerCase()) {
    case 'sap':
      return new SapJobOrderProvider();
    case 'file':
    default:
      return new FileJobOrderProvider();
  }
}

export const defaultJobOrderProvider = createJobOrderProvider();
