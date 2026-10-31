import jobOrdersData from './jobOrderData.json';

export interface RequiredSFG {
  sfgCode: string;
  description: string;
  department: 'HEADERS' | 'SHEET_METAL';
  qtyRequired: number;
  uom: string;
}

export interface JobOrder {
  jobOrderNo: string;
  parentItemCode: string;
  parentDescription: string;
  targetPlant: string;
  plannedQty: number;
  startDate: string;
  targetDate: string;
  status: string;
  requiredSFGs: RequiredSFG[];
}

export interface JobOrderProvider {
  listJobOrders(): Promise<JobOrder[]>;
  getJobOrder(jobOrderNo: string): Promise<JobOrder | null>;
}

export class DummyJobOrderProvider implements JobOrderProvider {
  private readonly data: JobOrder[] = jobOrdersData as JobOrder[];

  async listJobOrders(): Promise<JobOrder[]> {
    return this.data;
  }

  async getJobOrder(jobOrderNo: string): Promise<JobOrder | null> {
    const found = this.data.find(
      (jo) => jo.jobOrderNo.toUpperCase() === jobOrderNo.trim().toUpperCase()
    );
    return found || null;
  }
}

export const jobOrderProvider = new DummyJobOrderProvider();
