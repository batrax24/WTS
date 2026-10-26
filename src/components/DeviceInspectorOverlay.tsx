import React from 'react';
import { DEVICE_HOTSPOTS } from '../simulation/scenarioData';
import { InspectorPreset } from '../three/disasterScene';
import { Eye, Hand, Image as ImageIcon, Layers } from 'lucide-react';

interface DeviceInspectorOverlayProps {
  selectedPartId: string;
  preset: InspectorPreset;
  onSelectPreset: (preset: InspectorPreset) => void;
  onSelectPart: (partId: string) => void;
  onOpenSchematic: () => void;
}

export const DeviceInspectorOverlay: React.FC<DeviceInspectorOverlayProps> = ({
  selectedPartId,
  preset,
  onSelectPreset,
  onSelectPart,
  onOpenSchematic,
}) => {
  const activeHotspot =
    DEVICE_HOTSPOTS.find((h) => h.id === selectedPartId) ?? DEVICE_HOTSPOTS[3];

  const handleChipClick = (id: string) => {
    onSelectPart(id);
    const item = DEVICE_HOTSPOTS.find((h) => h.id === id);
    if (!item) return;
    if (item.viewSide === 'espalda' && preset !== 'chaleco_espalda') {
      onSelectPreset('chaleco_espalda');
    } else if (
      item.viewSide === 'frente' &&
      preset === 'chaleco_espalda'
    ) {
      onSelectPreset('chaleco_frente');
    } else if (item.viewSide === 'receptor' && preset === 'chaleco_frente') {
      onSelectPreset('ambos');
    }
  };

  return (
    <div className="w-full max-w-[365px] rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-2xl p-3.5 text-slate-100 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 text-sky-400 font-black text-xs uppercase tracking-wider">
          <Layers size={15} />
          <span>Inspector Técnico 3D WTS</span>
        </div>
        <button
          type="button"
          onClick={onOpenSchematic}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold flex items-center gap-1 text-sky-200"
        >
          <ImageIcon size={12} />
          <span>Ver Boceto Original</span>
        </button>
      </div>

      {/* View Angle Presets */}
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            { id: 'ambos', label: 'Ambos Dispositivos' },
            { id: 'chaleco_frente', label: 'Chaleco (Frente)' },
            { id: 'chaleco_espalda', label: 'Chaleco (Espalda)' },
            { id: 'receptor', label: 'Receptor 433 MHz' },
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectPreset(p.id)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 transition ${
              preset === p.id
                ? 'bg-sky-500 text-slate-950 border-sky-300 shadow'
                : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Eye size={12} />
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {/* Clickable Part Chips */}
      <div className="space-y-1">
        <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
          <Hand size={11} />
          <span>Toca en el modelo 3D o elige un componente:</span>
        </div>
        <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
          {DEVICE_HOTSPOTS.map((h) => {
            const selected = h.id === activeHotspot.id;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => handleChipClick(h.id)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                  selected
                    ? 'bg-amber-400 text-slate-950 border-amber-200'
                    : 'bg-slate-800/75 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                {h.title.split('•')[0].trim()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Hotspot Technical Card */}
      <div className="rounded-xl bg-slate-950/85 border border-sky-500/40 p-3 space-y-1.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
          {activeHotspot.device === 'chaleco'
            ? `Arnés Pectoral · Vista ${activeHotspot.viewSide}`
            : 'Receptor del Rescatista'}
        </div>
        <h3 className="text-sm font-black text-white leading-snug">
          {activeHotspot.title}
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          {activeHotspot.description}
        </p>
        <div className="pt-1.5 border-t border-slate-800 text-[11px] text-sky-300 font-medium">
          <span className="font-extrabold">Rol WTS: </span>
          {activeHotspot.wtsRole}
        </div>
      </div>
    </div>
  );
};
