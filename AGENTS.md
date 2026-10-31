# Multi-Agent Architecture & Responsibility Guide

## Overview
The SFG Transfer Tracker prototype is being built under a modular multi-agent workflow:
- **Agent A (Backend Core & Services)**: Fastify server, database schema, transactional services, identity validation hook, idempotency middleware, API routes, and integration tests.
- **Agent B (Frontend Application)**: Vite + React 18, Tailwind CSS, TanStack Query, React Hook Form + Zod, simulated plant switching, transfer creation and acknowledgment flows.
- **Agent C (Job Order Integration Provider)**: Upstream Parent Job Order system connector in `src/providers/jobOrders.ts`.

## Backend Architecture Contract (Agent A)
1. **Business Logic Isolation**:
   - All domain logic resides in `backend/src/services/transferService.ts`.
   - Route handlers only parse input, invoke the service, and serialize responses.
2. **Transactional State Machine**:
   - All mutations affecting multiple rows (Transfer insert/update + TransferEvent insert + DailyCounter increment) MUST execute within a single `prisma.$transaction`.
   - Transfers generate formatted serials `TRF-YYYYMMDD-NNNN` using `DailyCounter`.
   - `TransferEvent` is strictly append-only, enforced by database triggers.
3. **Simulated Identity & Security**:
   - Requests parse `x-plant-code` and `x-actor-name` headers via a preHandler hook into request context (`request.identity`).
   - Unknown plant codes or missing headers reject with `MISSING_IDENTITY` (401) or `INVALID_PLANT` (400).
4. **Idempotency**:
   - Supported on all mutation endpoints via `Idempotency-Key` or `x-idempotency-key`.
   - Duplicate requests with identical request hashes replay stored responses; mismatches reject with `IDEMPOTENCY_CONFLICT` (409).
5. **Job Order Integration Stub**:
   - Interfaces imported from `src/providers/jobOrders.ts`.
   - Validates `jobOrderNo` and `sfgCode` through `JobOrderProvider.validateSFGForJobOrder(jobOrderNo, sfgCode)`.
