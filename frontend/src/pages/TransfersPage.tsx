import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, getSimulatedIdentity } from '../lib/api';
import { TransferStatus } from '../lib/types';
import {
  Filter,
  Search,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Truck,
  RotateCcw
} from 'lucide-react';

export const TransfersPage: React.FC = () => {
  const identity = getSimulatedIdentity();

  const [status, setStatus] = useState<TransferStatus | ''>('');
  const [fromPlant, setFromPlant] = useState<string>('');
  const [toPlant, setToPlant] = useState<string>('');
  const [jobOrderNo, setJobOrderNo] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const { data: transfersData, isLoading } = useQuery({
    queryKey: ['transfers', status, fromPlant, toPlant, jobOrderNo, page],
    queryFn: () =>
      api.getTransfers({
        status: status || undefined,
        fromPlant: fromPlant || undefined,
        toPlant: toPlant || undefined,
        jobOrderNo: jobOrderNo || undefined,
        page,
        limit: 15
      })
  });

  const { data: plants = [] } = useQuery({
    queryKey: ['plants'],
    queryFn: () => api.getPlants()
  });

  const clearFilters = () => {
    setStatus('');
    setFromPlant('');
    setToPlant('');
    setJobOrderNo('');
    setPage(1);
  };

  const getStatusBadge = (status: TransferStatus) => {
    switch (status) {
      case 'IN_TRANSIT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Truck className="w-3 h-3 text-blue-500" />
            In Transit
          </span>
        );
      case 'RECEIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            Received
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-500" />
            Partial Receipt
          </span>
        );
      case 'DISCREPANCY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-500" />
            Discrepancy
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <XCircle className="w-3 h-3 text-slate-400" />
            Cancelled
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inter-Plant Transfers</h1>
          <p className="text-sm text-slate-500">
            Track and audit semi-finished goods movements between manufacturing facilities.
          </p>
        </div>
        <Link
          to="/transfers/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm shadow-sm transition-colors self-start sm:self-auto"
        >
          <span>+ Dispatch SFG</span>
        </Link>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter Criteria
          </span>
          <button
            onClick={clearFilters}
            className="text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1 normal-case font-medium text-xs"
          >
            <RotateCcw className="w-3 h-3" /> Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as TransferStatus | '');
                setPage(1);
              }}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="IN_TRANSIT">In Transit</option>
              <option value="RECEIVED">Received</option>
              <option value="PARTIAL">Partial Receipt</option>
              <option value="DISCREPANCY">Discrepancy</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Origin Plant</label>
            <select
              value={fromPlant}
              onChange={(e) => {
                setFromPlant(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Origin Plants</option>
              {plants.map((p) => (
                <option key={p.id} value={p.code}>
                  [{p.code}] {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Destination Plant</label>
            <select
              value={toPlant}
              onChange={(e) => {
                setToPlant(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Destination Plants</option>
              {plants.map((p) => (
                <option key={p.id} value={p.code}>
                  [{p.code}] {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Job Order Search</label>
            <div className="relative">
              <input
                type="text"
                value={jobOrderNo}
                onChange={(e) => {
                  setJobOrderNo(e.target.value);
                  setPage(1);
                }}
                placeholder="e.g. JO-2026..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading transfers...</div>
        ) : transfersData?.items?.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No transfers found matching filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-6">Transfer #</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Job Order / SFG</th>
                  <th className="py-3 px-6">Route</th>
                  <th className="py-3 px-6">Sent / Rcvd</th>
                  <th className="py-3 px-6">Timestamp</th>
                  <th className="py-3 px-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfersData?.items?.map((item) => {
                  const canReceive =
                    item.status === 'IN_TRANSIT' &&
                    item.toPlant?.code === identity.plantCode;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-6 font-mono font-semibold text-blue-600">
                        <Link to={`/transfers/${item.transferNo}`} className="hover:underline">
                          {item.transferNo}
                        </Link>
                      </td>
                      <td className="py-3.5 px-6">{getStatusBadge(item.status)}</td>
                      <td className="py-3.5 px-6">
                        <div className="font-medium text-slate-900 text-xs">{item.sfgDescription}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {item.sfgCode} &bull; {item.jobOrderNo}
                        </div>
                      </td>
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {item.fromPlant?.code}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                            {item.toPlant?.code}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-xs">
                        <span className="font-semibold text-slate-800">{item.qtySent}</span>
                        {item.qtyReceived !== null && item.qtyReceived !== undefined && (
                          <span className="text-slate-500"> / {item.qtyReceived}</span>
                        )}{' '}
                        <span className="text-slate-400 font-normal">{item.uom}</span>
                      </td>
                      <td className="py-3.5 px-6 text-xs text-slate-500">
                        {new Date(item.sentAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <Link
                          to={`/transfers/${item.transferNo}`}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${
                            canReceive
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                          }`}
                        >
                          {canReceive ? 'Receive' : 'View'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {transfersData && transfersData.totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing page <strong>{transfersData.page}</strong> of <strong>{transfersData.totalPages}</strong> ({transfersData.total} transfers)
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= transfersData.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
