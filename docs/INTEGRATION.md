# SFG Transfer Tracker — ERP / SAP Integration Architecture

This document describes the architectural interface between the Upstream Parent Job Order System, the SFG Transfer Tracker prototype, and the future enterprise SAP ERP environment (S/4HANA or ECC).

---

## 1. End-to-End Information Flow

```mermaid
sequenceDiagram
    autonumber
    participant JO as Job Order System (MES / Parent Build)
    participant TT as SFG Transfer Tracker
    participant SAP as SAP ERP (S/4HANA / ECC)

    Note over JO,TT: Phase 1: Upstream Job Order Validation
    JO->>TT: Synchronize Production Orders (jobOrderNo, productCode, sfgs, requiredQty)
    TT->>TT: Validate SFG against Job Order component reservation

    Note over TT,SAP: Phase 2: Dispatch / SEND Event
    Plant A (Sender)->>TT: Initiate Transfer (fromPlant, toPlant, sfgCode, qtySent)
    TT->>SAP: Post Goods Movement (Movement Type 351: Two-Step Plant Transfer to Transit)
    SAP-->>TT: Return Material Document No (MBLNR)
    TT->>TT: Store MBLNR in Transfer.externalRef & record SENT event

    Note over TT,SAP: Phase 3: Receipt Acknowledgment
    Plant B (Receiver)->>TT: Confirm Receipt (qtyReceived, remarks)
    alt qtyReceived == qtySent (RECEIVED) or qtyReceived < qtySent (PARTIAL)
        TT->>SAP: Post Goods Receipt (Movement Type 101: Goods Receipt from Transit to Unrestricted)
        SAP-->>TT: Confirm Receipt Material Document
        TT->>TT: Record RECEIVED event
    else qtyReceived > qtySent (DISCREPANCY)
        TT->>SAP: Post GR (Movement 101) + Trigger Quality Notification (BAPI_QUALNOT_CREATE)
        SAP-->>TT: Return Notification No (QMNUM)
        TT->>TT: Record DISCREPANCY_FLAGGED event
    end

    Note over TT,SAP: Phase 4: Cancellation (if applicable)
    Plant A (Sender)->>TT: Cancel Transfer (while IN_TRANSIT)
    TT->>SAP: Post Reversal (Movement Type 352: Reversal of Stock in Transit)
    SAP-->>TT: Confirm Reversal Document
    TT->>TT: Record CANCELLED event
```

---

## 2. Field & Event Mapping

| Transfer Tracker Field / Event | Direction | Target SAP Field / Object | Purpose & Description |
|---|---|---|---|
| `jobOrderNo` | Inbound | `AFKO-AUFNR` (Production Order) | Identifies the parent finished good build order. |
| `sfgCode` | Inbound | `RESB-MATNR` (Material Number) | Validates child SFG against order reservation components. |
| `fromPlantId` / `toPlantId` | Outbound | `MSEG-WERKS` / `MSEG-UMWRK` | Supplying plant and receiving plant (`WERKS`). |
| **`externalRef`** | **Bidirectional** | **`MKPF-MBLNR` / `VBAK-VBELN`** | **Stores the SAP Material Document Number (e.g. `MBLNR-4900012345`) or Stock Transport Order (STO) Delivery Number generated during dispatch.** |
| Event: `SENT` | Outbound | Movement Type `351` / `BAPI_GOODSMVT_CREATE` | Moves stock from supplying plant unrestricted to transit. |
| Event: `RECEIVED` | Outbound | Movement Type `101` / `BAPI_GOODSMVT_CREATE` | Moves stock from transit into receiving plant unrestricted inventory. |
| Event: `DISCREPANCY_FLAGGED`| Outbound | Quality Notification (`QM01` / `BAPI_QUALNOT_CREATE`)| Triggers automated discrepancy audit and physical lot inspection. |
| Event: `CANCELLED` | Outbound | Movement Type `352` / `BAPI_GOODSMVT_CANCEL` | Reverses transit stock back to supplying plant inventory. |

---

## 3. Storage of Enterprise External References

The `Transfer` schema explicitly provides an `externalRef` field:
- **During Dispatch**: When SAP processes Movement Type 351, it returns a 10-digit material document number (`MBLNR`) and fiscal year (`MJAHR`). The Transfer Tracker persists this directly in `Transfer.externalRef` (e.g., `MBLNR:5000129841/2026`).
- **During Audit / Traceability**: Destination plants and auditors can query both the SFG Transfer Tracker history and the SAP document flow bi-directionally using `externalRef`.
