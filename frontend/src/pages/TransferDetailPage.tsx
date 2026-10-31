import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getSimulatedIdentity } from '../lib/api';
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Package,
  ArrowRight,
  ShieldAlert,
  Send,
  Calendar,
  User
} from 'lucide-react';

export const TransferDetailPage: React.FC = () => {
  const { no } = useParams<{ no: string }>();
  const queryClient = useQueryClient();
  const identity = getSimulatedIdentity();

  const [qtyReceived, setQtyReceived] = useState<string>('');
  const [receiveRemarks, setReceiveRemarks] = useState<string>('');
  const [cancelReason, setCancelReason] = useState<string>('');
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: transfer, isLoading, error } = useQuery({
    queryKey: ['transfer', no],
    queryFn: () => api.getTransfer(no!),
    enabled: !!no
  });

  const { data: timeline = [] } = useQuery({
    queryKey: ['transferTimeline', no],
    queryFn: () => api.getTransferTimeline(no!),
    enabled: !!no
  });

  // Set default qtyReceived to qtySent once transfer loads
  React.useEffect(() => {
    if (transfer && !qtyReceived) {
      setQtyReceived(String(transfer.qtySent));
    }
  }, [transfer]);

  // Mutation: Confirm Receipt
  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!transfer) return;
      const parsedQty = parseFloat(qtyReceived);
      if (isNaN(parsedQty) || parsedQty < 0) {
        throw new Error('Please enter a valid received quantity');
      }
      return await api.receiveTransfer(
        transfer.transferNo,
        {
          qtyReceived: parsedQty,
          remarks: receiveRemarks.trim() || undefined
        },
        crypto.randomUUID()
      );
    },
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['transfer', no] });
      queryClient.invalidateQueries({ queryKey: ['transferTimeline', no] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to acknowledge receipt');
    }
  });

  // Mutation: Cancel Transfer
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!transfer) return;
      if (!cancelReason.trim()) throw new Error('Cancellation reason is required');
      return await api.cancelTransfer(
        transfer.transferNo,
        {
          reason: cancelReason.trim()
        },
        crypto.randomUUID()
      );
    },
    onSuccess: () => {
      setShowCancelModal(false);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['transfer', no] });
      queryClient.invalidateQueries({ queryKey: ['transferTimeline', no] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to cancel transfer');
    }
  });

  if (isLoading) {
    return <div className="p-12 text-center text-slate-400">Loading transfer {no}...</div>;
  }

  if (error || !transfer) {
    return (
      <div className="p-8 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-800">Transfer Not Found</h2>
        <p className="text-sm text-slate-500">The transfer number '{no}' could not be located.</p>
        <Link to="/transfers" className="inline-flex items-center gap-1.5 text-sm text-blue-600 font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back to Transfers
        </Link>
      </div>
    );
  }

  const isDestination = transfer.toPlant?.code === identity.plantCode;
  const isSender = transfer.fromPlant?.code === identity.plantCode;

  // Real-time preview of receipt status
  const parsedReceivedQty = parseFloat(qtyReceived);
  const diff = !isNaN(parsedReceivedQty) ? parsedReceivedQty - transfer.qtySent : 0;
  const expectedOutcome =
    isNaN(parsedReceivedQty)
      ? null
      : parsedReceivedQty === transfer.qtySent
      ? { label: 'RECEIVED (Full Match)', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
      : parsedReceivedQty < transfer.qtySent
      ? { label: `PARTIAL (${Math.abs(diff)} short)`, color: 'bg-amber-50 text-amber-800 border-amber-200' }
      : { label: `DISCREPANCY (+${diff} overage)`, color: 'bg-rose-50 text-rose-800 border-rose-200' };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Back button */}
      <Link
        to="/transfers"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to All Transfers
      </Link>

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {transfer.transferNo}
              </span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">
                {transfer.department}
              </span>
            </div>
            <p className="text-sm text-slate-600 font-medium">
              {transfer.sfgDescription} <span className="font-mono text-xs text-slate-400">({transfer.sfgCode})</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {transfer.status === 'IN_TRANSIT' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                <Truck className="w-3.5 h-3.5" /> IN TRANSIT
              </span>
            )}
            {transfer.status === 'RECEIVED' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> FULLY RECEIVED
              </span>
            )}
            {transfer.status === 'PARTIAL' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <Clock className="w-3.5 h-3.5" /> PARTIAL RECEIPT
              </span>
            )}
            {transfer.status === 'DISCREPANCY' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <AlertTriangle className="w-3.5 h-3.5" /> DISCREPANCY
              </span>
            )}
            {transfer.status === 'CANCELLED' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                <XCircle className="w-3.5 h-3.5" /> CANCELLED
              </span>
            )}
          </div>
        </div>

        {/* Route Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-1">
          <div className="space-y-1">
            <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Route</span>
            <div className="font-semibold text-slate-800 flex items-center gap-1.5 text-sm">
              <span className="px-2 py-0.5 rounded bg-slate-100">{transfer.fromPlant?.code}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">{transfer.toPlant?.code}</span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Quantity Sent</span>
            <div className="font-bold text-slate-900 text-sm">
              {transfer.qtySent} {transfer.uom}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Job Order No</span>
            <div className="font-mono font-semibold text-slate-800 text-sm">
              {transfer.jobOrderNo}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">External Ref (SAP)</span>
            <div className="font-mono text-xs text-slate-600 truncate">
              {transfer.externalRef || '—'}
            </div>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Action Forbidden / Error</div>
            <div>{actionError}</div>
          </div>
        </div>
      )}

      {/* Action Section: Receipt or Cancellation */}
      {transfer.status === 'IN_TRANSIT' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            Transfer Action Controls
          </h2>

          {isDestination ? (
            /* Destination Plant Action: Confirm Receipt */
            <div className="space-y-4 bg-emerald-50/50 p-5 rounded-xl border border-emerald-100">
              <div className="text-xs text-emerald-800 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Active plant ({identity.plantCode}) is the designated receiving plant. Acknowledge incoming goods:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Actual Quantity Received <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={qtyReceived}
                      onChange={(e) => setQtyReceived(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">
                      {transfer.uom}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    System Classification Preview
                  </label>
                  {expectedOutcome ? (
                    <div className={`px-3 py-2 rounded-lg text-xs font-bold border ${expectedOutcome.color}`}>
                      {expectedOutcome.label}
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-slate-100 rounded-lg text-xs text-slate-400">
                      Enter quantity to preview status
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Receipt Inspection Notes / Discrepancy Reason
                </label>
                <input
                  type="text"
                  value={receiveRemarks}
                  onChange={(e) => setReceiveRemarks(e.target.value)}
                  placeholder="e.g. Received intact, crates verified against BOM."
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => receiveMutation.mutate()}
                  disabled={receiveMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md shadow-emerald-600/30 transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {receiveMutation.isPending ? 'Confirming...' : 'Acknowledge Receipt & Update Status'}
                </button>
              </div>
            </div>
          ) : isSender ? (
            /* Sending Plant Action: Cancel Option */
            <div className="space-y-3 bg-slate-50 p-5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    Active plant ({identity.plantCode}) is the sending plant.
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Transfers can be recalled or cancelled while still IN_TRANSIT prior to destination acknowledgment.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="px-3.5 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition-colors"
                >
                  Cancel Transfer
                </button>
              </div>

              {showCancelModal && (
                <div className="mt-3 p-4 bg-rose-50 rounded-lg border border-rose-200 space-y-3">
                  <div className="text-xs font-bold text-rose-900">Confirm Transfer Cancellation</div>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason for cancellation (required)"
                    className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(false)}
                      className="px-3 py-1 rounded text-xs text-slate-600 hover:bg-slate-200"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                      className="px-3.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                    >
                      {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancel'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Unrelated Plant Notice */
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                To acknowledge receipt, switch active plant to <strong>{transfer.toPlant?.code}</strong>.
                To cancel, switch active plant to <strong>{transfer.fromPlant?.code}</strong>.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Terminal Details Summary if already finished */}
      {transfer.status !== 'IN_TRANSIT' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Completion Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
            <div>
              <span className="text-slate-500">Recorded By:</span>
              <div className="font-semibold text-slate-800">{transfer.receivedBy || transfer.sentBy}</div>
            </div>
            <div>
              <span className="text-slate-500">Recorded At:</span>
              <div className="font-semibold text-slate-800">
                {transfer.receivedAt ? new Date(transfer.receivedAt).toLocaleString() : new Date(transfer.updatedAt).toLocaleString()}
              </div>
            </div>
            <div>
              <span className="text-slate-500">Remarks:</span>
              <div className="font-medium text-slate-800 italic">{transfer.remarks || 'No remarks recorded.'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Chronological Append-Only Audit Trail */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Append-Only Audit Trail
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Strictly immutable event stream protected by database triggers.
            </p>
          </div>
          <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600 font-semibold">
            {timeline.length} {timeline.length === 1 ? 'Event' : 'Events'}
          </span>
        </div>

        <div className="relative pl-6 space-y-8 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {timeline.map((evt, idx) => {
            let icon = <Send className="w-3.5 h-3.5 text-blue-600" />;
            let badgeBg = 'bg-blue-50 text-blue-800 border-blue-200';

            if (evt.eventType === 'RECEIVED') {
              icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
              badgeBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
            } else if (evt.eventType === 'DISCREPANCY_FLAGGED') {
              icon = <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />;
              badgeBg = 'bg-rose-50 text-rose-800 border-rose-200';
            } else if (evt.eventType === 'CANCELLED') {
              icon = <XCircle className="w-3.5 h-3.5 text-slate-600" />;
              badgeBg = 'bg-slate-100 text-slate-800 border-slate-200';
            }

            return (
              <div key={evt.id || idx} className="relative group">
                {/* Timeline node */}
                <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white border-2 border-slate-400 flex items-center justify-center group-hover:border-blue-600 transition-colors">
                  <div className="w-2 h-2 rounded-full bg-slate-400 group-hover:bg-blue-600" />
                </div>

                <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeBg}`}>
                        {icon}
                        {evt.eventType}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" /> {evt.actor}
                      </span>
                      <span className="text-xs font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-bold">
                        {evt.plant?.code || 'Plant'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(evt.createdAt).toLocaleString()}
                    </div>
                  </div>

                  {evt.payload && (
                    <div className="mt-2 text-xs bg-white p-2.5 rounded-lg border border-slate-200/60 font-mono text-slate-700">
                      <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Payload Snapshot:</div>
                      {JSON.stringify(evt.payload, null, 2)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
