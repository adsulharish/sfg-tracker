import { PrismaClient, Department, TransferStatus, TransferEventType } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { defaultJobOrderProvider, JobOrderProvider } from '../providers/jobOrders.js';

export interface CreateTransferInput {
  jobOrderNo: string;
  sfgCode: string;
  sfgDescription: string;
  department: Department;
  qtySent: number;
  uom: string;
  fromPlantId: string;
  toPlantId: string;
  remarks?: string;
  externalRef?: string;
}

export interface ConfirmReceiptInput {
  qtyReceived: number;
  remarks?: string;
}

export interface CancelTransferInput {
  reason: string;
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

export interface RequestActor {
  plantCode: string;
  actorName: string;
}

export class TransferService {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly jobOrderProvider: JobOrderProvider = defaultJobOrderProvider
  ) {}

  async createTransfer(input: CreateTransferInput, actor: RequestActor) {
    if (input.fromPlantId === input.toPlantId) {
      throw new AppError(
        'SAME_PLANT_TRANSFER_PROHIBITED',
        'Source and destination plants must be different',
        400
      );
    }

    if (input.qtySent <= 0) {
      throw new AppError('INVALID_QUANTITY', 'Quantity sent must be greater than zero', 400);
    }

    // Resolve plants by ID or Code
    const [fromPlant, toPlant] = await Promise.all([
      this.prisma.plant.findFirst({
        where: { OR: [{ id: input.fromPlantId }, { code: input.fromPlantId }] }
      }),
      this.prisma.plant.findFirst({
        where: { OR: [{ id: input.toPlantId }, { code: input.toPlantId }] }
      })
    ]);

    if (!fromPlant) {
      throw new AppError('INVALID_PLANT', `Sending plant '${input.fromPlantId}' not found`, 400);
    }
    if (!toPlant) {
      throw new AppError('INVALID_PLANT', `Receiving plant '${input.toPlantId}' not found`, 400);
    }

    // Origin plant must match simulated sender identity
    if (fromPlant.code !== actor.plantCode) {
      throw new AppError(
        'SENDER_PLANT_MISMATCH',
        `Authenticated plant '${actor.plantCode}' does not match sending plant '${fromPlant.code}'`,
        403
      );
    }

    // Validate job order & SFG child part
    const validation = await this.jobOrderProvider.validateSFG(
      input.jobOrderNo,
      input.sfgCode
    );

    if (!validation.valid) {
      if (validation.error === 'JOB_ORDER_NOT_FOUND') {
        throw new AppError(
          'JOB_ORDER_NOT_FOUND',
          `Job order '${input.jobOrderNo}' does not exist in upstream system`,
          404
        );
      }
      throw new AppError(
        'SFG_NOT_ON_JOB_ORDER',
        `SFG item '${input.sfgCode}' is not a required child component of job order '${input.jobOrderNo}'`,
        400
      );
    }

    // Format transfer number TRF-YYYYMMDD-NNNN using atomic transaction
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    return await this.prisma.$transaction(
      async (tx) => {
      // Atomic counter increment
      const counterResult = await tx.$queryRaw<{ lastSeq: number }[]>`
        INSERT INTO "daily_counters" ("id", "date", "lastSeq")
        VALUES (gen_random_uuid(), ${dateStr}, 1)
        ON CONFLICT ("date") DO UPDATE
        SET "lastSeq" = "daily_counters"."lastSeq" + 1
        RETURNING "lastSeq";
      `;

      let seq = counterResult[0]?.lastSeq ?? 1;
      let transferNo = `TRF-${dateStr}-${String(seq).padStart(4, '0')}`;

      // If transferNo already exists, automatically advance sequence until unique
      while (await tx.transfer.findUnique({ where: { transferNo } })) {
        seq++;
        transferNo = `TRF-${dateStr}-${String(seq).padStart(4, '0')}`;
        await tx.dailyCounter.update({
          where: { date: dateStr },
          data: { lastSeq: seq }
        });
      }

      // Insert Transfer
      const transfer = await tx.transfer.create({
        data: {
          transferNo,
          jobOrderNo: input.jobOrderNo,
          sfgCode: input.sfgCode,
          sfgDescription: input.sfgDescription,
          department: input.department,
          qtySent: input.qtySent,
          uom: input.uom,
          fromPlantId: fromPlant.id,
          toPlantId: toPlant.id,
          sentBy: actor.actorName,
          status: 'IN_TRANSIT',
          remarks: input.remarks,
          externalRef: input.externalRef
        },
        include: {
          fromPlant: true,
          toPlant: true
        }
      });

      // Insert TransferEvent (SENT)
      await tx.transferEvent.create({
        data: {
          transferId: transfer.id,
          eventType: 'SENT',
          actor: actor.actorName,
          plantId: fromPlant.id,
          payload: {
            qtySent: input.qtySent,
            uom: input.uom,
            externalRef: input.externalRef,
            remarks: input.remarks
          }
        }
      });

      return transfer;
    },
    { maxWait: 15000, timeout: 20000 }
  );
  }

  async confirmReceipt(
    transferNo: string,
    input: ConfirmReceiptInput,
    actor: RequestActor
  ) {
    if (input.qtyReceived < 0) {
      throw new AppError('INVALID_QUANTITY', 'Received quantity cannot be negative', 400);
    }

    const transfer = await this.prisma.transfer.findUnique({
      where: { transferNo },
      include: { fromPlant: true, toPlant: true }
    });

    if (!transfer) {
      throw new AppError('NOT_FOUND', `Transfer '${transferNo}' not found`, 404);
    }

    if (transfer.status === 'CANCELLED') {
      throw new AppError('NOT_ACTIONABLE', 'Cannot confirm receipt on a cancelled transfer', 400);
    }

    if (
      transfer.status === 'RECEIVED' ||
      transfer.status === 'PARTIAL' ||
      transfer.status === 'DISCREPANCY'
    ) {
      throw new AppError(
        'ALREADY_RECEIVED',
        `Transfer '${transferNo}' has already been received (status: ${transfer.status})`,
        400
      );
    }

    // Only destination plant can confirm receipt
    if (transfer.toPlant.code !== actor.plantCode) {
      throw new AppError(
        'WRONG_RECEIVING_PLANT',
        `Only the destination plant '${transfer.toPlant.code}' can confirm receipt; request originated from '${actor.plantCode}'`,
        403
      );
    }

    // Business rule for status & event type
    let newStatus: TransferStatus;
    let eventType: TransferEventType;

    if (input.qtyReceived === transfer.qtySent) {
      newStatus = 'RECEIVED';
      eventType = 'RECEIVED';
    } else if (input.qtyReceived < transfer.qtySent) {
      newStatus = 'PARTIAL';
      eventType = 'RECEIVED';
    } else {
      newStatus = 'DISCREPANCY';
      eventType = 'DISCREPANCY_FLAGGED';
    }

    const discrepancyDelta = input.qtyReceived - transfer.qtySent;

    return await this.prisma.$transaction(async (tx) => {
      const updated = await tx.transfer.update({
        where: { id: transfer.id },
        data: {
          status: newStatus,
          qtyReceived: input.qtyReceived,
          receivedBy: actor.actorName,
          receivedAt: new Date(),
          remarks: input.remarks ?? transfer.remarks
        },
        include: {
          fromPlant: true,
          toPlant: true
        }
      });

      await tx.transferEvent.create({
        data: {
          transferId: transfer.id,
          eventType,
          actor: actor.actorName,
          plantId: transfer.toPlantId,
          payload: {
            qtySent: transfer.qtySent,
            qtyReceived: input.qtyReceived,
            discrepancyDelta,
            status: newStatus,
            remarks: input.remarks
          }
        }
      });

      return updated;
    },
    { maxWait: 15000, timeout: 20000 }
  );
  }

  async cancelTransfer(
    transferNo: string,
    input: CancelTransferInput,
    actor: RequestActor
  ) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { transferNo },
      include: { fromPlant: true, toPlant: true }
    });

    if (!transfer) {
      throw new AppError('NOT_FOUND', `Transfer '${transferNo}' not found`, 404);
    }

    if (transfer.status !== 'IN_TRANSIT') {
      throw new AppError(
        'NOT_CANCELLABLE',
        `Only transfers currently IN_TRANSIT can be cancelled; status is ${transfer.status}`,
        400
      );
    }

    // Only sending plant can cancel
    if (transfer.fromPlant.code !== actor.plantCode) {
      throw new AppError(
        'CANCEL_FORBIDDEN_NOT_SENDER',
        `Only sending plant '${transfer.fromPlant.code}' can cancel this transfer; request came from '${actor.plantCode}'`,
        403
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      const updated = await tx.transfer.update({
        where: { id: transfer.id },
        data: {
          status: 'CANCELLED',
          remarks: input.reason
        },
        include: {
          fromPlant: true,
          toPlant: true
        }
      });

      await tx.transferEvent.create({
        data: {
          transferId: transfer.id,
          eventType: 'CANCELLED',
          actor: actor.actorName,
          plantId: transfer.fromPlantId,
          payload: {
            reason: input.reason
          }
        }
      });

      return updated;
    });
  }

  async getTransfer(transferNo: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { transferNo },
      include: {
        fromPlant: true,
        toPlant: true,
        events: {
          orderBy: { createdAt: 'asc' },
          include: { plant: true }
        }
      }
    });

    if (!transfer) {
      throw new AppError('NOT_FOUND', `Transfer '${transferNo}' not found`, 404);
    }

    return transfer;
  }

  async listTransfers(filters: TransferFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.jobOrderNo) {
      where.jobOrderNo = { contains: filters.jobOrderNo, mode: 'insensitive' };
    }

    if (filters.fromPlant) {
      where.fromPlant = {
        OR: [{ id: filters.fromPlant }, { code: filters.fromPlant }]
      };
    }

    if (filters.toPlant) {
      where.toPlant = {
        OR: [{ id: filters.toPlant }, { code: filters.toPlant }]
      };
    }

    if (filters.dateFrom || filters.dateTo) {
      where.sentAt = {};
      if (filters.dateFrom) {
        (where.sentAt as Record<string, unknown>).gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        (where.sentAt as Record<string, unknown>).lte = new Date(filters.dateTo);
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sentAt: 'desc' },
        include: {
          fromPlant: true,
          toPlant: true
        }
      }),
      this.prisma.transfer.count({ where })
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getTimeline(transferNo: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { transferNo },
      select: { id: true }
    });

    if (!transfer) {
      throw new AppError('NOT_FOUND', `Transfer '${transferNo}' not found`, 404);
    }

    return await this.prisma.transferEvent.findMany({
      where: { transferId: transfer.id },
      orderBy: { createdAt: 'asc' },
      include: {
        plant: true
      }
    });
  }

  async getStats() {
    const [
      totalTransfers,
      inTransitCount,
      receivedCount,
      partialCount,
      discrepancyCount,
      cancelledCount,
      headersCount,
      sheetMetalCount
    ] = await Promise.all([
      this.prisma.transfer.count(),
      this.prisma.transfer.count({ where: { status: 'IN_TRANSIT' } }),
      this.prisma.transfer.count({ where: { status: 'RECEIVED' } }),
      this.prisma.transfer.count({ where: { status: 'PARTIAL' } }),
      this.prisma.transfer.count({ where: { status: 'DISCREPANCY' } }),
      this.prisma.transfer.count({ where: { status: 'CANCELLED' } }),
      this.prisma.transfer.count({ where: { department: 'HEADERS' } }),
      this.prisma.transfer.count({ where: { department: 'SHEET_METAL' } })
    ]);

    return {
      totalTransfers,
      inTransitCount,
      receivedCount,
      partialCount,
      discrepancyCount,
      cancelledCount,
      byDepartment: {
        HEADERS: headersCount,
        SHEET_METAL: sheetMetalCount
      }
    };
  }
}

export const transferService = new TransferService();
