import {
  Plant,
  Transfer,
  TransferEvent,
  JobOrder,
  TransferStats,
  TransferFilters,
  ApiErrorResponse
} from './types';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000';

// In-memory or localStorage simulated identity state
let simulatedPlantCode = localStorage.getItem('sfg_simulated_plant') || 'P1';
let simulatedActorName = localStorage.getItem('sfg_simulated_actor') || 'Operator Alex';

export const setSimulatedIdentity = (plantCode: string, actorName: string) => {
  simulatedPlantCode = plantCode;
  simulatedActorName = actorName;
  localStorage.setItem('sfg_simulated_plant', plantCode);
  localStorage.setItem('sfg_simulated_actor', actorName);
};

export const getSimulatedIdentity = () => ({
  plantCode: simulatedPlantCode,
  actorName: simulatedActorName
});

async function apiRequest<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-plant-code': simulatedPlantCode,
    'x-actor-name': simulatedActorName,
    ...(options.headers as Record<string, string>)
  };

  if (options.idempotencyKey) {
    headers['x-idempotency-key'] = options.idempotencyKey;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorData: ApiErrorResponse = data || {
      code: 'UNKNOWN_ERROR',
      message: `HTTP error ${response.status}: ${response.statusText}`
    };
    throw errorData;
  }

  return data as T;
}

export const api = {
  getHealth: () =>
    apiRequest<{ status: string; db: string; timestamp: string }>('/health'),

  getPlants: () =>
    apiRequest<Plant[]>('/api/v1/plants'),

  getJobOrders: () =>
    apiRequest<JobOrder[]>('/api/v1/job-orders'),

  getJobOrder: (no: string) =>
    apiRequest<JobOrder>(`/api/v1/job-orders/${encodeURIComponent(no)}`),

  getTransfers: (filters: TransferFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.fromPlant) params.set('fromPlant', filters.fromPlant);
    if (filters.toPlant) params.set('toPlant', filters.toPlant);
    if (filters.jobOrderNo) params.set('jobOrderNo', filters.jobOrderNo);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.page) params.set('page', filters.page.toString());
    if (filters.limit) params.set('limit', filters.limit.toString());

    const queryString = params.toString();
    return apiRequest<{
      items: Transfer[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/v1/transfers${queryString ? `?${queryString}` : ''}`);
  },

  getTransfer: (no: string) =>
    apiRequest<Transfer>(`/api/v1/transfers/${encodeURIComponent(no)}`),

  getTransferTimeline: (no: string) =>
    apiRequest<TransferEvent[]>(`/api/v1/transfers/${encodeURIComponent(no)}/timeline`),

  createTransfer: (
    payload: {
      jobOrderNo: string;
      sfgCode: string;
      sfgDescription: string;
      department: 'HEADERS' | 'SHEET_METAL';
      qtySent: number;
      uom: string;
      fromPlantId: string;
      toPlantId: string;
      remarks?: string;
      externalRef?: string;
    },
    idempotencyKey?: string
  ) =>
    apiRequest<Transfer>('/api/v1/transfers', {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey
    }),

  receiveTransfer: (
    no: string,
    payload: {
      qtyReceived: number;
      remarks?: string;
    },
    idempotencyKey?: string
  ) =>
    apiRequest<Transfer>(`/api/v1/transfers/${encodeURIComponent(no)}/receive`, {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey
    }),

  cancelTransfer: (
    no: string,
    payload: {
      reason: string;
    },
    idempotencyKey?: string
  ) =>
    apiRequest<Transfer>(`/api/v1/transfers/${encodeURIComponent(no)}/cancel`, {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey
    }),

  getStats: () =>
    apiRequest<TransferStats>('/api/v1/stats')
};
