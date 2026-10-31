export type Department = 'HEADERS' | 'SHEET_METAL';

export type TransferStatus =
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'PARTIAL'
  | 'DISCREPANCY'
  | 'CANCELLED';

export type TransferEventType =
  | 'SENT'
  | 'RECEIVED'
  | 'DISCREPANCY_FLAGGED'
  | 'CANCELLED';

export interface Plant {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransferEvent {
  id: string;
  transferId: string;
  eventType: TransferEventType;
  actor: string;
  plantId: string;
  plant?: Plant;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Transfer {
  id: string;
  transferNo: string;
  jobOrderNo: string;
  sfgCode: string;
  sfgDescription: string;
  department: Department;
  qtySent: number;
  uom: string;
  fromPlantId: string;
  toPlantId: string;
  fromPlant?: Plant;
  toPlant?: Plant;
  sentBy: string;
  sentAt: string;
  status: TransferStatus;
  qtyReceived?: number | null;
  receivedBy?: string | null;
  receivedAt?: string | null;
  remarks?: string | null;
  externalRef?: string | null;
  createdAt: string;
  updatedAt: string;
  events?: TransferEvent[];
}

export interface RequiredSFG {
  sfgCode: string;
  description: string;
  department: Department;
  qtyRequired: number;
  requiredQty?: number;
  uom: string;
  producingPlant?: string;
  consumingPlant?: string;
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

export interface TransferStats {
  totalTransfers: number;
  inTransitCount: number;
  receivedCount: number;
  partialCount: number;
  discrepancyCount: number;
  cancelledCount: number;
  byDepartment: {
    HEADERS: number;
    SHEET_METAL: number;
  };
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

export interface TransferFilters {
  status?: TransferStatus;
  fromPlant?: string;
  toPlant?: string;
  jobOrderNo?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}
