import React, { useState, useEffect } from 'react';
import { MapPin, Compass, Clock, Check, X, Trash2 } from 'lucide-react';
import { HazardReport, HazardType, LateralPosition } from '../types';
import { HAZARD_TYPE_LABELS, LATERAL_POSITION_LABELS } from '../utils/geoAndSpeech';

interface HazardCaptureModalProps {
  draft: HazardReport | null;
  isEditingExisting: boolean;
  isDark: boolean;
  onSave: (updated: HazardReport) => void;
  onDelete?: (id: string) => void;
  onCancel: () => void;
}

export const HazardCaptureModal: React.FC<HazardCaptureModalProps> = ({
  draft,
  isEditingExisting,
  isDark,
  onSave,
  onDelete,
  onCancel,
}) => {
  const [formState, setFormState] = useState<HazardReport | null>(draft);

  useEffect(() => {
    setFormState(draft);
  }, [draft]);

  if (!formState) return null;

  const availableLanes = Array.from(
    { length: Math.max(1, formState.totalLanesAtLocation) },
    (_, i) => i + 1
  );

  const toggleLane = (laneNum: number) => {
    const exists = formState.lanesAffected.includes(laneNum);
    const nextLanes = exists
      ? formState.lanesAffected.filter((l) => l !== laneNum)
      : [...formState.lanesAffected, laneNum].sort((a, b) => a - b);
    setFormState({
      ...formState,
      lanesAffected: nextLanes.length > 0 ? nextLanes : [laneNum],
    });
  };

  const formattedTime = new Date(formState.timestamp).toLocaleTimeString('hu-HU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div
        className={`w-full max-w-2xl rounded-t-3xl sm:rounded-3xl border max-h-[92vh] overflow-y-auto p-5 sm:p-6 transition-colors ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900 shadow-2xl'
        }`}
      >
        {/* Header with Locked GPS Snapshot Notice */}
        <div className="flex items-start justify-between gap-4 border-b pb-4 border-slate-200 dark:border-slate-800">
          <div>
            <div className="text-xs font-mono-tabular uppercase tracking-wider text-emerald-500 font-bold">
              {isEditingExisting
                ? 'Mentett úthiba szerkesztése'
                : 'GPS koordináta és menetirány rögzítve a gombnyomás pillanatában'}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mt-1">
              {isEditingExisting ? 'Úthiba adatainak módosítása' : 'Új úthiba részleteinek mentése'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Bezárás"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Locked GPS, Time, Direction & Address Snapshot Summary */}
        <div
          className={`mt-4 p-3.5 rounded-2xl border grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <MapPin className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <div className="text-xs text-slate-400">Rögzített GPS koordináta</div>
              <div className="font-mono-tabular font-bold">
                {formState.lat.toFixed(5)}, {formState.lng.toFixed(5)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Compass className="w-5 h-5 text-emerald-500 shrink-0" />
            <div>
              <div className="text-xs text-slate-400">Rögzített menetirány</div>
              <div className="font-mono-tabular font-bold">
                {formState.heading}° ({formState.headingCardinal} irány)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-sky-500 shrink-0" />
            <div>
              <div className="text-xs text-slate-400">Megnyomás ideje és helye</div>
              <div className="font-bold truncate">
                {formattedTime} · {formState.postcode} {formState.settlement}
              </div>
            </div>
          </div>
        </div>

        {/* Step 1: Hazard Type Selection */}
        <div className="mt-5">
          <label className="block text-sm font-bold mb-2">
            1. Milyen típusú úthibát észlelt?
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {(Object.keys(HAZARD_TYPE_LABELS) as HazardType[]).map((typeKey) => {
              const info = HAZARD_TYPE_LABELS[typeKey];
              const active = formState.type === typeKey;
              return (
                <button
                  key={typeKey}
                  type="button"
                  onClick={() => setFormState({ ...formState, type: typeKey })}
                  className={`min-h-[54px] p-3 rounded-xl border text-left transition-all flex flex-col justify-center ${
                    active
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                      : isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-700'
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-base font-bold">{info.shortLabel}</div>
                  <div
                    className={`text-xs line-clamp-1 ${
                      active ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {info.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Which Lane(s) in Current Travel Direction */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold">
              2. Melyik menetirány szerinti (jobb oldali) sávot érinti?
            </label>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Sávok száma itt:</span>
              {[1, 2, 3, 4].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() =>
                    setFormState({
                      ...formState,
                      totalLanesAtLocation: cnt,
                      lanesAffected: formState.lanesAffected.filter((l) => l <= cnt).length
                        ? formState.lanesAffected.filter((l) => l <= cnt)
                        : [1],
                    })
                  }
                  className={`w-7 h-7 rounded font-mono-tabular font-bold border ${
                    formState.totalLanesAtLocation === cnt
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {availableLanes.map((laneNum) => {
              const isSelected = formState.lanesAffected.includes(laneNum);
              const label =
                formState.totalLanesAtLocation === 1
                  ? '1. Sáv (Saját sáv)'
                  : laneNum === 1
                  ? '1. Belső sáv'
                  : laneNum === formState.totalLanesAtLocation
                  ? `${laneNum}. Külső (jobb) sáv`
                  : `${laneNum}. Középső sáv`;

              return (
                <button
                  key={laneNum}
                  type="button"
                  onClick={() => toggleLane(laneNum)}
                  className={`min-h-[52px] px-3 py-2.5 rounded-xl border font-bold text-sm sm:text-base transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                      : isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3: Lateral Position within the Lane (Bal szél / Közép / Jobb szél) */}
        <div className="mt-5">
          <label className="block text-sm font-bold mb-2">
            3. Az adott sávon / úton belül hol található? (Bal szél, Közép, Jobb szél)
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {(['left_edge', 'center_lane', 'right_edge'] as LateralPosition[]).map((latPos) => {
              const active = formState.lateralPosition === latPos;
              return (
                <button
                  key={latPos}
                  type="button"
                  onClick={() => setFormState({ ...formState, lateralPosition: latPos })}
                  className={`min-h-[52px] px-3 py-2 rounded-xl border font-bold text-sm sm:text-base transition-all ${
                    active
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                      : isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  {LATERAL_POSITION_LABELS[latPos].short}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 4: Direction Scope & Address Refinement */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Utca / Útszám és Házszám
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formState.street}
                onChange={(e) => setFormState({ ...formState, street: e.target.value })}
                placeholder="Utca vagy főút száma"
                className={`flex-1 min-h-[46px] px-3 rounded-xl border text-base font-semibold ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
              <input
                type="text"
                value={formState.houseNumber}
                onChange={(e) => setFormState({ ...formState, houseNumber: e.target.value })}
                placeholder="Hsz."
                className={`w-24 min-h-[46px] px-3 rounded-xl border text-base font-semibold ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Megjegyzés / Súlyosság
            </label>
            <input
              type="text"
              value={formState.notes}
              onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
              placeholder="Pl. mély kátyú, kiálló aknafedél..."
              className={`w-full min-h-[46px] px-3 rounded-xl border text-base ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>
        </div>

        {/* Directionality Checkbox */}
        <div className="mt-4 flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800">
          <div>
            <div className="text-sm font-bold">
              Csak a jelenlegi menetirányra ({formState.heading}° {formState.headingCardinal}) vonatkozik
            </div>
            <div className="text-xs text-slate-400">
              Bekapcsolva csak akkor riaszt, ha ebből az irányból közelít a jobb oldali sávokban
            </div>
          </div>
          <input
            type="checkbox"
            checked={formState.appliesToDirectionOnly}
            onChange={(e) =>
              setFormState({ ...formState, appliesToDirectionOnly: e.target.checked })
            }
            className="w-6 h-6 accent-amber-500 rounded cursor-pointer"
          />
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          {isEditingExisting && onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(formState.id)}
              className="min-h-[48px] px-4 rounded-xl bg-red-600/15 text-red-500 hover:bg-red-600/25 font-bold text-sm flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Törlés</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[48px] px-5 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-sm sm:text-base"
            >
              Mégse
            </button>
            <button
              type="button"
              onClick={() => onSave(formState)}
              className="min-h-[48px] px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-base flex items-center gap-2 shadow-md"
            >
              <Check className="w-5 h-5" />
              <span>Úthiba Mentése</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
