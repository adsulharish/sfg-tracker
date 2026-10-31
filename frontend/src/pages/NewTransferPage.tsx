import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, getSimulatedIdentity } from '../lib/api';
import { Send, AlertCircle, ArrowRight, PackageCheck } from 'lucide-react';

export const NewTransferPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const identity = getSimulatedIdentity();

  const [selectedJobOrderNo, setSelectedJobOrderNo] = useState<string>('');
  const [selectedSfgCode, setSelectedSfgCode] = useState<string>('');
  const [toPlantId, setToPlantId] = useState<string>('');
  const [qtySent, setQtySent] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [externalRef, setExternalRef] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch job orders & plants
  const { data: jobOrders = [], isLoading: joLoading } = useQuery({
    queryKey: ['jobOrders'],
    queryFn: () => api.getJobOrders()
  });

  const { data: plants = [], isLoading: plantsLoading } = useQuery({
    queryKey: ['plants'],
    queryFn: () => api.getPlants()
  });

  // Current plant object
  const currentPlant = useMemo(() => {
    return plants.find((p) => p.code === identity.plantCode);
  }, [plants, identity.plantCode]);

  // Selected job order
  const currentJobOrder = useMemo(() => {
    return jobOrders.find((jo) => jo.jobOrderNo === selectedJobOrderNo);
  }, [jobOrders, selectedJobOrderNo]);

  // Available SFGs on current job order
  const availableSfgs = useMemo(() => {
    if (!currentJobOrder) return [];
    return currentJobOrder.requiredSFGs || (currentJobOrder as any).sfgs || [];
  }, [currentJobOrder]);

  // Selected SFG
  const currentSfg = useMemo(() => {
    return availableSfgs.find((s: any) => s.sfgCode === selectedSfgCode);
  }, [availableSfgs, selectedSfgCode]);

  // When job order changes, pick the first SFG
  const handleJobOrderChange = (joNo: string) => {
    setSelectedJobOrderNo(joNo);
    const order = jobOrders.find((j) => j.jobOrderNo === joNo);
    const sfgs = order?.requiredSFGs || (order as any)?.sfgs || [];
    if (sfgs.length > 0) {
      handleSfgChange(sfgs[0].sfgCode, sfgs[0]);
    } else {
      setSelectedSfgCode('');
    }
  };

  // When SFG changes, pre-fill destination plant if available
  const handleSfgChange = (code: string, sfgOverride?: any) => {
    setSelectedSfgCode(code);
    const sfg = sfgOverride || availableSfgs.find((s: any) => s.sfgCode === code);
    if (sfg?.consumingPlant) {
      const destPlant = plants.find((p) => p.code === sfg.consumingPlant);
      if (destPlant && destPlant.id !== currentPlant?.id) {
        setToPlantId(destPlant.id);
      }
    }
    if (sfg?.requiredQty || sfg?.qtyRequired) {
      setQtySent(String(sfg.requiredQty || sfg.qtyRequired));
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentPlant) throw new Error('Source plant not identified');
      if (!toPlantId) throw new Error('Please select a destination plant');
      if (currentPlant.id === toPlantId) {
        throw new Error('Destination plant cannot be the same as sending plant');
      }
      if (!currentSfg) throw new Error('Please select an SFG child part');
      const qty = parseFloat(qtySent);
      if (isNaN(qty) || qty <= 0) throw new Error('Quantity must be greater than zero');

      const idempotencyKey = crypto.randomUUID();
      return await api.createTransfer(
        {
          jobOrderNo: selectedJobOrderNo,
          sfgCode: currentSfg.sfgCode,
          sfgDescription: currentSfg.description,
          department: currentSfg.department,
          qtySent: qty,
          uom: currentSfg.uom,
          fromPlantId: currentPlant.id,
          toPlantId,
          remarks: remarks.trim() || undefined,
          externalRef: externalRef.trim() || undefined
        },
        idempotencyKey
      );
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      navigate(`/transfers/${created.transferNo}`);
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to initiate transfer');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    createMutation.mutate();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Send className="w-6 h-6 text-blue-600" />
          Dispatch Semi-Finished Goods (SFG)
        </h1>
        <p className="text-sm text-slate-500">
          Initiate an inter-plant transfer linked to an upstream Parent Job Order.
        </p>
      </div>

      {formError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Dispatch Error</div>
            <div>{formError}</div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        {/* Origin & Destination Plants */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200/80">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Origin Plant (Dispatched By)
            </label>
            <div className="px-3.5 py-2.5 bg-slate-200/70 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 flex items-center justify-between">
              <span>{currentPlant ? `[${currentPlant.code}] ${currentPlant.name}` : `Plant ${identity.plantCode}`}</span>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-normal">Active</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Locked to current active plant header ({identity.actorName})</p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Destination Plant <span className="text-rose-500">*</span>
            </label>
            <select
              value={toPlantId}
              onChange={(e) => setToPlantId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select Destination Plant --</option>
              {plants
                .filter((p) => p.code !== identity.plantCode)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name}
                  </option>
                ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Must be different from origin plant</p>
          </div>
        </div>

        {/* Job Order & SFG Selection */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
            Job Order & Component Specifications
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Parent Job Order No <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedJobOrderNo}
                onChange={(e) => handleJobOrderChange(e.target.value)}
                required
                disabled={joLoading}
                className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Choose Job Order --</option>
                {jobOrders.map((jo) => (
                  <option key={jo.jobOrderNo} value={jo.jobOrderNo}>
                    {jo.jobOrderNo} — {(jo as any).productName || jo.parentDescription}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Required Child SFG Part <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedSfgCode}
                onChange={(e) => handleSfgChange(e.target.value)}
                required
                disabled={!selectedJobOrderNo || availableSfgs.length === 0}
                className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
              >
                {availableSfgs.length === 0 && <option value="">Select a job order first</option>}
                {availableSfgs.map((sfg: any) => (
                  <option key={sfg.sfgCode} value={sfg.sfgCode}>
                    [{sfg.sfgCode}] {sfg.description} ({sfg.department})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {currentSfg && (
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 text-xs text-blue-900 flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-semibold text-sm flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-blue-600" />
                  {currentSfg.description}
                </div>
                <div className="text-slate-600 flex gap-4">
                  <span>Department: <strong>{currentSfg.department}</strong></span>
                  <span>Required Qty: <strong>{currentSfg.requiredQty || (currentSfg as any).qtyRequired} {currentSfg.uom}</strong></span>
                  {(currentSfg as any).consumingPlant && (
                    <span>Consuming Plant: <strong>{(currentSfg as any).consumingPlant}</strong></span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quantities & Reference */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Quantity Sent <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={qtySent}
                onChange={(e) => setQtySent(e.target.value)}
                placeholder="0"
                className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">
                {currentSfg?.uom || 'PCS'}
              </span>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              External Document / Carrier Ref <span className="text-slate-400 font-normal">(Optional, e.g. Waybill / SAP MBLNR)</span>
            </label>
            <input
              type="text"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder="WAYBILL-2026-9921 or MBLNR-4900101"
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Dispatch Remarks / Pallet Notes <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <textarea
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. Pallet 1 of 2. Passed dimensional and visual inspection."
            className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/transfers')}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || plantsLoading}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-md shadow-blue-600/30 transition-all disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
          >
            {createMutation.isPending ? 'Dispatching...' : 'Confirm & Dispatch Transfer'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
