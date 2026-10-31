import React, { useState } from 'react';
import { getSimulatedIdentity, setSimulatedIdentity } from '../lib/api';

export const IdentitySwitcher: React.FC = () => {
  const current = getSimulatedIdentity();
  const [plant, setPlant] = useState(current.plantCode);
  const [actor, setActor] = useState(current.actorName);

  const handlePlantChange = (newPlant: string) => {
    setPlant(newPlant);
    setSimulatedIdentity(newPlant, actor);
    window.location.reload();
  };

  const handleActorChange = (newActor: string) => {
    setActor(newActor);
    setSimulatedIdentity(plant, newActor);
  };

  return (
    <div className="flex items-center gap-3 bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm border border-slate-700 shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Active Plant:</span>
        <select
          value={plant}
          onChange={(e) => handlePlantChange(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-amber-400 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
        >
          <option value="P1">P1 (Headers)</option>
          <option value="P2">P2 (Sheet Metal)</option>
          <option value="P3">P3 (Assembly)</option>
        </select>
      </div>
      <div className="h-4 w-px bg-slate-700" />
      <div className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Operator:</span>
        <input
          type="text"
          value={actor}
          onChange={(e) => handleActorChange(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="Actor name"
        />
      </div>
    </div>
  );
};
