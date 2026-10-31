import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, getSimulatedIdentity } from '../lib/api';
import {
  Truck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Box
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const currentIdentity = getSimulatedIdentity();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
    refetchInterval: 10000
  });

  const { data: inTransitTransfers, isLoading: transfersLoading } = useQuery({
    queryKey: ['inTransitTransfers'],
    queryFn: () => api.getTransfers({ status: 'IN_TRANSIT', limit: 10 }),
    refetchInterval: 10000
  });

  const isDelayed = (sentAt: string) => {
    const diffHours = (Date.now() - new Date(sentAt).getTime()) / (1000 * 3600);
    return diffHours > 24;
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-850 to-blue-950 p-6 sm:p-8 rounded-2xl text-white shadow-lg border border-slate-800">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-semibold tracking-wide border border-blue-500/20">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
            Live Production Plant Monitor
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Inter-Plant SFG Transfer Tracker
          </h1>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            Multi-facility tracking for Headers and Sheet Metal child parts between Plant 1, Plant 2, and Plant 3.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <button
            onClick={() => refetchStats()}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            title="Refresh KPIs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            to="/transfers/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm shadow-md shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>+ Dispatch New SFG</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">In Transit</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-3">
            {statsLoading ? '--' : stats?.inTransitCount ?? 0}
          </p>
          <div className="mt-2 text-xs text-blue-600 font-medium flex items-center gap-1">
            <span>Awaiting receipt</span>
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Received</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-emerald-600 mt-3">
            {statsLoading ? '--' : stats?.receivedCount ?? 0}
          </p>
          <div className="mt-2 text-xs text-slate-500 font-medium">100% matched qty</div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Partial</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-amber-600 mt-3">
            {statsLoading ? '--' : stats?.partialCount ?? 0}
          </p>
          <div className="mt-2 text-xs text-slate-500 font-medium">Received short qty</div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-rose-300 transition-all">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Discrepancy</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-rose-600 mt-3">
            {statsLoading ? '--' : stats?.discrepancyCount ?? 0}
          </p>
          <div className="mt-2 text-xs text-rose-600 font-medium">Over-receipt / dispute</div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Volume</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-800 mt-3">
            {statsLoading ? '--' : stats?.totalTransfers ?? 0}
          </p>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
            <span>HDR: {stats?.byDepartment?.HEADERS ?? 0}</span>
            <span>&bull;</span>
            <span>SHT: {stats?.byDepartment?.SHEET_METAL ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Active In-Transit Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-600" />
              Active In-Transit Shipments
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Goods dispatched and currently moving between factory plants
            </p>
          </div>
          <Link
            to="/transfers"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 self-start sm:self-auto"
          >
            <span>View All Transfers</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {transfersLoading ? (
          <div className="p-12 text-center text-slate-400">Loading shipments...</div>
        ) : inTransitTransfers?.items?.length === 0 ? (
          <div className="p-12 text-center">
            <Box className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">No shipments currently in transit</p>
            <p className="text-xs text-slate-400 mt-1">All dispatched goods have been received or cancelled.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs text-slate-500 uppercase font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3.5 px-6">Transfer #</th>
                  <th className="py-3.5 px-6">Job Order / SFG</th>
                  <th className="py-3.5 px-6">Route</th>
                  <th className="py-3.5 px-6">Quantity</th>
                  <th className="py-3.5 px-6">Dispatched</th>
                  <th className="py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inTransitTransfers?.items?.map((item) => {
                  const delayed = isDelayed(item.sentAt);
                  const canReceive = item.toPlant?.code === currentIdentity.plantCode;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-6 font-mono font-semibold text-blue-600">
                        <Link to={`/transfers/${item.transferNo}`} className="hover:underline">
                          {item.transferNo}
                        </Link>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-medium text-slate-900">{item.sfgDescription}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                            {item.sfgCode}
                          </span>
                          <span>&bull;</span>
                          <span className="font-mono">{item.jobOrderNo}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-1.5 font-medium text-xs">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                            {item.fromPlant?.code}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">
                            {item.toPlant?.code}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-medium text-slate-800">
                        {item.qtySent} {item.uom}
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-xs text-slate-600">
                          {new Date(item.sentAt).toLocaleDateString()} {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {delayed && (
                          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>In transit &gt;24h</span>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <Link
                          to={`/transfers/${item.transferNo}`}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors ${
                            canReceive
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {canReceive ? 'Acknowledge Receipt' : 'View Details'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
