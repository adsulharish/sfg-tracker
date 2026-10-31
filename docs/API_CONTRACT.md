# SFG Transfer Tracker — API Contract & Specification

**Version:** 1.0.0  
**Status:** Canonical Source of Truth for Backend and Frontend  
**Base URL:** `/api/v1` (except `/health` and `/docs`)

---

## 1. Overview & Simulated Identity

### 1.1 Architecture & Design Principles
- Semi-finished goods (SFGs) produced by **Headers** or **Sheet Metal** departments move between **Plant 1 (P1)**, **Plant 2 (P2)**, and **Plant 3 (P3)**.
- Every state mutation writes to an append-only `TransferEvent` log in the same database transaction.
- Transfers connect conceptually to the parent build system via Job Orders (`jobOrderNo`).

### 1.2 Authentication & Simulated Identity
As specified in requirements, user and plant identity is simulated via HTTP request headers:
- `x-plant-code`: The plant code of the actor making the request (`P1`, `P2`, or `P3`). Required on all `/api/v1/*` requests.
- `x-actor-name`: Human-readable identifier of the operator/supervisor (e.g. `Alex Operator`). Required on all `/api/v1/*` requests.
- `x-idempotency-key` *(Optional on mutations)*: UUID/string client key preventing duplicate writes on retries.

> **Note:** `/health` and `/docs` do not require identity headers.

---

## 2. Standard Error Envelope & HTTP Status Codes

All non-2xx responses MUST conform to this standard JSON format:

```json
{
  "code": "ERROR_CODE_STRING",
  "message": "Human-readable description of what went wrong.",
  "details": {}
}
```

### Standard Error Codes
| HTTP Status | Error Code | Description |
|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | Schema validation failed on body, params, or query. |
| `400 Bad Request` | `SAME_PLANT_TRANSFER_PROHIBITED` | `fromPlant` and `toPlant` are identical. |
| `400 Bad Request` | `INVALID_STATUS_TRANSITION` | Transfer is not in an actionable state (e.g., trying to cancel a received transfer). |
| `401 Unauthorized` | `MISSING_IDENTITY_HEADERS` | Request missing `x-plant-code` or `x-actor-name`. |
| `403 Forbidden` | `RECEIPT_FORBIDDEN_NOT_DESTINATION` | Only destination plant (`toPlant`) can confirm receipt. |
| `403 Forbidden` | `CANCEL_FORBIDDEN_NOT_SENDER` | Only origin plant (`fromPlant`) can cancel transfer. |
| `404 Not Found` | `NOT_FOUND` | Requested transfer, plant, or job order does not exist. |
| `409 Conflict` | `IDEMPOTENCY_CONFLICT` | Key already executed with different payload. |
| `503 Service Unavailable` | `DATABASE_UNAVAILABLE` | Database health check or connection failure. |

---

## 3. Enumerations & Core Types

### Department
- `HEADERS`: Heat exchanger header manifolds and tube processing.
- `SHEET_METAL`: Stamped/formed sheet metal components, brackets, and casings.

### TransferStatus
- `IN_TRANSIT`: Dispatched by origin plant; pending receipt.
- `RECEIVED`: Received at destination plant with `qtyReceived == qtySent`.
- `PARTIAL`: Received at destination plant with `qtyReceived < qtySent`.
- `DISCREPANCY`: Received at destination plant with `qtyReceived > qtySent`.
- `CANCELLED`: Cancelled by origin plant prior to receipt.

### TransferEventType
- `SENT`: Initial dispatch event.
- `RECEIVED`: Receipt confirmed (`RECEIVED` or `PARTIAL`).
- `DISCREPANCY_FLAGGED`: Receipt confirmed with overage or dispute.
- `CANCELLED`: Transfer cancelled while `IN_TRANSIT`.

---

## 4. Endpoints Specification

### 4.1 System & Health

#### `GET /health`
Verifies service status and live PostgreSQL connectivity.

- **Headers:** None required
- **Response `200 OK`:**
```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-10-31T15:00:00.000Z"
}
```
- **Response `503 Service Unavailable`:**
```json
{
  "status": "error",
  "db": "disconnected",
  "error": "Connection to database failed: ECONNREFUSED",
  "timestamp": "2026-10-31T15:00:00.000Z"
}
```

---

### 4.2 Plants

#### `GET /api/v1/plants`
Retrieves list of active manufacturing plants (seed: P1, P2, P3).

- **Headers:**
  - `x-plant-code: P1`
  - `x-actor-name: Alex`
- **Response `200 OK`:**
```json
[
  {
    "id": "11111111-1111-1111-1111-111111111111",
    "code": "P1",
    "name": "Plant 1 - Headers & Tube Processing",
    "createdAt": "2026-10-31T12:00:00.000Z",
    "updatedAt": "2026-10-31T12:00:00.000Z"
  },
  {
    "id": "22222222-2222-2222-2222-222222222222",
    "code": "P2",
    "name": "Plant 2 - Sheet Metal & Stamping",
    "createdAt": "2026-10-31T12:00:00.000Z",
    "updatedAt": "2026-10-31T12:00:00.000Z"
  },
  {
    "id": "33333333-3333-3333-3333-333333333333",
    "code": "P3",
    "name": "Plant 3 - Final Assembly & Integration",
    "createdAt": "2026-10-31T12:00:00.000Z",
    "updatedAt": "2026-10-31T12:00:00.000Z"
  }
]
```

---

### 4.3 Job Orders (Upstream Parent Build Connection)

#### `GET /api/v1/job-orders`
List available upstream parent job orders with required SFG child components.

- **Headers:**
  - `x-plant-code: P1`
  - `x-actor-name: Alex`
- **Response `200 OK`:**
```json
[
  {
    "jobOrderNo": "JO-2026-1001",
    "parentItemCode": "FG-HVAC-X500",
    "parentDescription": "Commercial HVAC Air Handler Unit X500",
    "targetPlant": "P3",
    "plannedQty": 25,
    "startDate": "2026-10-15T08:00:00.000Z",
    "targetDate": "2026-11-15T17:00:00.000Z",
    "status": "RELEASED",
    "requiredSFGs": [
      {
        "sfgCode": "SFG-HDR-001",
        "description": "Refrigerant Distribution Header 3-Way",
        "department": "HEADERS",
        "qtyRequired": 50,
        "uom": "PCS"
      },
      {
        "sfgCode": "SFG-SHT-101",
        "description": "Outer Galvanized Enclosure Side Panel",
        "department": "SHEET_METAL",
        "qtyRequired": 50,
        "uom": "PCS"
      }
    ]
  }
]
```

#### `GET /api/v1/job-orders/:no`
Get details of a specific job order.

- **Parameters:** `no` (e.g. `JO-2026-1001`)
- **Headers:**
  - `x-plant-code: P1`
  - `x-actor-name: Alex`
- **Response `200 OK`:**
```json
{
  "jobOrderNo": "JO-2026-1001",
  "parentItemCode": "FG-HVAC-X500",
  "parentDescription": "Commercial HVAC Air Handler Unit X500",
  "targetPlant": "P3",
  "plannedQty": 25,
  "startDate": "2026-10-15T08:00:00.000Z",
  "targetDate": "2026-11-15T17:00:00.000Z",
  "status": "RELEASED",
  "requiredSFGs": [
    {
      "sfgCode": "SFG-HDR-001",
      "description": "Refrigerant Distribution Header 3-Way",
      "department": "HEADERS",
      "qtyRequired": 50,
      "uom": "PCS"
    }
  ]
}
```
- **Response `404 Not Found`:**
```json
{
  "code": "NOT_FOUND",
  "message": "Job order 'JO-9999' not found."
}
```

---

### 4.4 Transfers

#### `POST /api/v1/transfers`
Initiates an inter-plant SFG transfer (logs SEND).

- **Business Rules:**
  - `fromPlantId` != `toPlantId`
  - Increments `DailyCounter` for date `YYYYMMDD` inside the same transaction to produce format `TRF-YYYYMMDD-NNNN`.
  - Initial status: `IN_TRANSIT`.
  - Writes a `TransferEvent` with `eventType: SENT` in the same transaction.
  - `sentBy` populated from `x-actor-name`.
  - `fromPlantId` validated against `x-plant-code` of sender.
- **Headers:**
  - `x-plant-code: P1`
  - `x-actor-name: Alex Operator`
  - `x-idempotency-key: 7a827cf0-fdf3-4c90-9515-b7e1933e08f5` *(optional)*
- **Request Body:**
```json
{
  "jobOrderNo": "JO-2026-1001",
  "sfgCode": "SFG-HDR-001",
  "sfgDescription": "Refrigerant Distribution Header 3-Way",
  "department": "HEADERS",
  "qtySent": 25,
  "uom": "PCS",
  "fromPlantId": "11111111-1111-1111-1111-111111111111",
  "toPlantId": "33333333-3333-3333-3333-333333333333",
  "remarks": "Batch #B44 inspected. Pallet 2 of 4.",
  "externalRef": "WAYBILL-88392"
}
```
- **Response `201 Created`:**
```json
{
  "id": "e422f24d-616a-493f-8c31-90a6125026df",
  "transferNo": "TRF-20261031-0001",
  "jobOrderNo": "JO-2026-1001",
  "sfgCode": "SFG-HDR-001",
  "sfgDescription": "Refrigerant Distribution Header 3-Way",
  "department": "HEADERS",
  "qtySent": 25,
  "uom": "PCS",
  "fromPlantId": "11111111-1111-1111-1111-111111111111",
  "toPlantId": "33333333-3333-3333-3333-333333333333",
  "sentBy": "Alex Operator",
  "sentAt": "2026-10-31T15:30:00.000Z",
  "status": "IN_TRANSIT",
  "qtyReceived": null,
  "receivedBy": null,
  "receivedAt": null,
  "remarks": "Batch #B44 inspected. Pallet 2 of 4.",
  "externalRef": "WAYBILL-88392",
  "createdAt": "2026-10-31T15:30:00.000Z",
  "updatedAt": "2026-10-31T15:30:00.000Z"
}
```

---

#### `POST /api/v1/transfers/:no/receive`
Acknowledge receipt of a transfer at the destination plant.

- **Business Rules:**
  - Transfer must be currently in `IN_TRANSIT`.
  - Only the destination plant (`toPlant`) can confirm receipt (`x-plant-code` must match `toPlant.code`).
  - Status calculation:
    - If `qtyReceived == qtySent` &rarr; Status becomes `RECEIVED` (writes event `RECEIVED`).
    - If `qtyReceived < qtySent` &rarr; Status becomes `PARTIAL` (writes event `RECEIVED`).
    - If `qtyReceived > qtySent` &rarr; Status becomes `DISCREPANCY` (writes event `DISCREPANCY_FLAGGED`).
  - Writes a `TransferEvent` inside the same transaction.
- **Headers:**
  - `x-plant-code: P3`
  - `x-actor-name: Jordan Receiver`
  - `x-idempotency-key: 92fa9422-b91c-42cb-bcf9-548bb017d291` *(optional)*
- **Request Body:**
```json
{
  "qtyReceived": 25,
  "remarks": "All 25 pcs received in intact crates."
}
```
- **Response `200 OK`:**
```json
{
  "id": "e422f24d-616a-493f-8c31-90a6125026df",
  "transferNo": "TRF-20261031-0001",
  "jobOrderNo": "JO-2026-1001",
  "sfgCode": "SFG-HDR-001",
  "sfgDescription": "Refrigerant Distribution Header 3-Way",
  "department": "HEADERS",
  "qtySent": 25,
  "uom": "PCS",
  "fromPlantId": "11111111-1111-1111-1111-111111111111",
  "toPlantId": "33333333-3333-3333-3333-333333333333",
  "sentBy": "Alex Operator",
  "sentAt": "2026-10-31T15:30:00.000Z",
  "status": "RECEIVED",
  "qtyReceived": 25,
  "receivedBy": "Jordan Receiver",
  "receivedAt": "2026-10-31T16:15:00.000Z",
  "remarks": "All 25 pcs received in intact crates.",
  "externalRef": "WAYBILL-88392",
  "createdAt": "2026-10-31T15:30:00.000Z",
  "updatedAt": "2026-10-31T16:15:00.000Z"
}
```

---

#### `POST /api/v1/transfers/:no/cancel`
Cancel an in-transit transfer by the sending plant.

- **Business Rules:**
  - Transfer must be currently in `IN_TRANSIT`.
  - Only the sending plant (`fromPlant`) can cancel (`x-plant-code` must match `fromPlant.code`).
  - Status becomes `CANCELLED`.
  - Writes a `TransferEvent` with `eventType: CANCELLED` in the same transaction.
- **Headers:**
  - `x-plant-code: P1`
  - `x-actor-name: Alex Operator`
- **Request Body:**
```json
{
  "reason": "Dispatch cancelled due to wrong header specification loaded onto carrier."
}
```
- **Response `200 OK`:**
```json
{
  "id": "e422f24d-616a-493f-8c31-90a6125026df",
  "transferNo": "TRF-20261031-0001",
  "status": "CANCELLED",
  "remarks": "Dispatch cancelled due to wrong header specification loaded onto carrier.",
  "updatedAt": "2026-10-31T15:45:00.000Z"
}
```

---

#### `GET /api/v1/transfers`
Search and filter transfers.

- **Query Parameters:**
  - `status`: `IN_TRANSIT` | `RECEIVED` | `PARTIAL` | `DISCREPANCY` | `CANCELLED` *(optional)*
  - `fromPlant`: Plant code or ID *(optional)*
  - `toPlant`: Plant code or ID *(optional)*
  - `jobOrderNo`: Exact or partial search *(optional)*
  - `dateFrom`: ISO 8601 date string *(optional)*
  - `dateTo`: ISO 8601 date string *(optional)*
  - `page`: Integer (default `1`)
  - `limit`: Integer (default `20`, max `100`)
- **Headers:**
  - `x-plant-code: P1`
  - `x-actor-name: Alex`
- **Response `200 OK`:**
```json
{
  "items": [
    {
      "id": "e422f24d-616a-493f-8c31-90a6125026df",
      "transferNo": "TRF-20261031-0001",
      "jobOrderNo": "JO-2026-1001",
      "sfgCode": "SFG-HDR-001",
      "sfgDescription": "Refrigerant Distribution Header 3-Way",
      "department": "HEADERS",
      "qtySent": 25,
      "uom": "PCS",
      "fromPlant": {
        "id": "11111111-1111-1111-1111-111111111111",
        "code": "P1",
        "name": "Plant 1 - Headers & Tube Processing"
      },
      "toPlant": {
        "id": "33333333-3333-3333-3333-333333333333",
        "code": "P3",
        "name": "Plant 3 - Final Assembly & Integration"
      },
      "sentBy": "Alex Operator",
      "sentAt": "2026-10-31T15:30:00.000Z",
      "status": "RECEIVED",
      "qtyReceived": 25,
      "receivedBy": "Jordan Receiver",
      "receivedAt": "2026-10-31T16:15:00.000Z",
      "remarks": "All 25 pcs received in intact crates.",
      "externalRef": "WAYBILL-88392",
      "createdAt": "2026-10-31T15:30:00.000Z",
      "updatedAt": "2026-10-31T16:15:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

#### `GET /api/v1/transfers/:no`
Get single transfer details by `transferNo`.

- **Headers:**
  - `x-plant-code: P1`
  - `x-actor-name: Alex`
- **Response `200 OK`:**
```json
{
  "id": "e422f24d-616a-493f-8c31-90a6125026df",
  "transferNo": "TRF-20261031-0001",
  "jobOrderNo": "JO-2026-1001",
  "sfgCode": "SFG-HDR-001",
  "sfgDescription": "Refrigerant Distribution Header 3-Way",
  "department": "HEADERS",
  "qtySent": 25,
  "uom": "PCS",
  "fromPlant": {
    "id": "11111111-1111-1111-1111-111111111111",
    "code": "P1",
    "name": "Plant 1 - Headers & Tube Processing"
  },
  "toPlant": {
    "id": "33333333-3333-3333-3333-333333333333",
    "code": "P3",
    "name": "Plant 3 - Final Assembly & Integration"
  },
  "sentBy": "Alex Operator",
  "sentAt": "2026-10-31T15:30:00.000Z",
  "status": "RECEIVED",
  "qtyReceived": 25,
  "receivedBy": "Jordan Receiver",
  "receivedAt": "2026-10-31T16:15:00.000Z",
  "remarks": "All 25 pcs received in intact crates.",
  "externalRef": "WAYBILL-88392",
  "createdAt": "2026-10-31T15:30:00.000Z",
  "updatedAt": "2026-10-31T16:15:00.000Z"
}
```
- **Response `404 Not Found`:**
```json
{
  "code": "NOT_FOUND",
  "message": "Transfer 'TRF-20261031-9999' not found."
}
```

---

#### `GET /api/v1/transfers/:no/timeline`
Retrieves chronological append-only audit trail events for a transfer.

- **Headers:**
  - `x-plant-code: P1`
  - `x-actor-name: Alex`
- **Response `200 OK`:**
```json
[
  {
    "id": "90e2b145-66ec-4cbb-a320-cbf65be1eb01",
    "transferId": "e422f24d-616a-493f-8c31-90a6125026df",
    "eventType": "SENT",
    "actor": "Alex Operator",
    "plantId": "11111111-1111-1111-1111-111111111111",
    "plant": {
      "code": "P1",
      "name": "Plant 1 - Headers & Tube Processing"
    },
    "payload": {
      "qtySent": 25,
      "uom": "PCS",
      "externalRef": "WAYBILL-88392"
    },
    "createdAt": "2026-10-31T15:30:00.000Z"
  },
  {
    "id": "18cf85d3-8208-410a-8bf8-dfef6cba186e",
    "transferId": "e422f24d-616a-493f-8c31-90a6125026df",
    "eventType": "RECEIVED",
    "actor": "Jordan Receiver",
    "plantId": "33333333-3333-3333-3333-333333333333",
    "plant": {
      "code": "P3",
      "name": "Plant 3 - Final Assembly & Integration"
    },
    "payload": {
      "qtyReceived": 25,
      "discrepancyDelta": 0,
      "remarks": "All 25 pcs received in intact crates."
    },
    "createdAt": "2026-10-31T16:15:00.000Z"
  }
]
```

---

### 4.5 Operational KPI Stats

#### `GET /api/v1/stats`
Get live counts by status and department.

- **Headers:**
  - `x-plant-code: P1`
  - `x-actor-name: Alex`
- **Response `200 OK`:**
```json
{
  "totalTransfers": 42,
  "inTransitCount": 5,
  "receivedCount": 32,
  "partialCount": 3,
  "discrepancyCount": 1,
  "cancelledCount": 1,
  "byDepartment": {
    "HEADERS": 26,
    "SHEET_METAL": 16
  }
}
```

---

## 5. Scalability to SAP Integration (Future Phase)

Although no SAP integration is implemented in this prototype, the architecture guarantees seamless migration:
1. `Transfer.externalRef` maps directly to SAP Material Document numbers / Outbound Delivery numbers (`VBELN` / `MBLNR`).
2. `Transfer.sfgCode` maps to SAP Material Number (`MATNR`).
3. `Transfer.jobOrderNo` maps to SAP Production Order (`AUFNR`).
4. Append-only `TransferEvent` triggers can be forwarded via transactional outbox or webhooks to SAP BAPI/OData endpoints (`BAPI_GOODSMVT_CREATE` - movement type 301 / 303 / 305 for two-step plant-to-plant transfers).
