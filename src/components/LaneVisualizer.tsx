import React from 'react';
import { ArrowUp, ArrowDown, AlertTriangle, Compass } from 'lucide-react';
import { HazardReport, LateralPosition } from '../types';
import { HAZARD_TYPE_LABELS, LATERAL_POSITION_LABELS, isSameDrivingDirection } from '../utils/geoAndSpeech';

interface LaneVisualizerProps {
  forwardLanes: number;
  backwardLanes: number;
  selectedForwardLanes: number[];
  selectedLateral: LateralPosition;
  onToggleForwardLane: (laneIndex: number) => void;
  onSelectLateral: (pos: LateralPosition) => void;
  onAdjustForwardLanes: (delta: number) => void;
  onAdjustBackwardLanes: (delta: number) => void;
  isMoving: boolean;
  currentHeading: number;
  currentCardinal: string;
  nearbyHazards: Array<HazardReport & { distanceMeters: number }>;
  isDark: boolean;
  fontScaleClass: string;
  onQuickCaptureFromLane?: (laneIndex: number, lateral: LateralPosition) => void;
}

export const LaneVisualizer: React.FC<LaneVisualizerProps> = ({
  forwardLanes,
  backwardLanes,
  selectedForwardLanes,
  selectedLateral,
  onToggleForwardLane,
  onSelectLateral,
  onAdjustForwardLanes,
  onAdjustBackwardLanes,
  isMoving,
  currentHeading,
  currentCardinal,
  nearbyHazards,
  isDark,
  onQuickCaptureFromLane,
}) => {
  const forwardLaneArray = Array.from({ length: forwardLanes }, (_, i) => i + 1);
  const backwardLaneArray = Array.from({ length: backwardLanes }, (_, i) => i + 1);

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        isDark
          ? 'bg-slate-900/95 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900 shadow-sm'
      } p-3 sm:p-5 flex flex-col gap-2.5 sm:gap-4`}
    >
      {/* Top Header: Lane Configuration & Direction */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-b pb-2 sm:pb-3 border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-xl font-bold tracking-tight">
            Élő Sávtükör és Oldalpozíció
          </h2>
          <p className={`hidden sm:block text-xs sm:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Érintse meg a menetirány szerinti sávot és válassza ki az úthiba pontos oldali helyzetét
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Direction Indicator */}
          <div
            className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-mono-tabular ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-amber-400'
                : 'bg-slate-100 border-slate-200 text-slate-900'
            }`}
          >
            <Compass className="w-4 h-4 shrink-0 text-amber-500" />
            <span className="font-bold">{currentHeading}°</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold">{currentCardinal}</span>
          </div>

          {/* Manual Lane Count Override Controls */}
          <div className="flex items-center gap-1.5">
            <div
              className={`flex items-center rounded-lg border p-0.5 text-xs ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
              title="Szembejövő (bal oldali) sávok száma"
            >
              <button
                type="button"
                onClick={() => onAdjustBackwardLanes(-1)}
                className="min-w-[30px] sm:min-w-[36px] min-h-[30px] sm:min-h-[36px] font-bold rounded hover:bg-slate-800/30 transition-colors"
                aria-label="Kevesebb szembejövő sáv"
              >
                -
              </button>
              <span className="px-1.5 sm:px-2 font-mono-tabular font-semibold whitespace-nowrap">
                Szembe: {backwardLanes}
              </span>
              <button
                type="button"
                onClick={() => onAdjustBackwardLanes(1)}
                className="min-w-[30px] sm:min-w-[36px] min-h-[30px] sm:min-h-[36px] font-bold rounded hover:bg-slate-800/30 transition-colors"
                aria-label="Több szembejövő sáv"
              >
                +
              </button>
            </div>

            <div
              className={`flex items-center rounded-lg border p-0.5 text-xs ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
              title="Menetirány szerinti (jobb oldali) sávok száma"
            >
              <button
                type="button"
                onClick={() => onAdjustForwardLanes(-1)}
                className="min-w-[30px] sm:min-w-[36px] min-h-[30px] sm:min-h-[36px] font-bold rounded hover:bg-slate-800/30 transition-colors"
                aria-label="Kevesebb saját sáv"
              >
                -
              </button>
              <span className="px-1.5 sm:px-2 font-mono-tabular font-semibold text-amber-500 whitespace-nowrap">
                Saját: {forwardLanes}
              </span>
              <button
                type="button"
                onClick={() => onAdjustForwardLanes(1)}
                className="min-w-[30px] sm:min-w-[36px] min-h-[30px] sm:min-h-[36px] font-bold rounded hover:bg-slate-800/30 transition-colors"
                aria-label="Több saját sáv"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Road Cross-Section Canvas (Reduced height on mobile) */}
      <div className="relative rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-900 text-white select-none shadow-inner">
        <div className="grid grid-cols-12 min-h-[148px] sm:min-h-[260px]">
          {/* Opposing Lanes (Szembejövő forgalom - Bal oldal) */}
          {backwardLanes > 0 && (
            <div
              className={`${
                backwardLanes >= 2 ? 'col-span-4' : 'col-span-3'
              } bg-slate-950/80 border-r-4 border-amber-400/90 flex divide-x divide-dashed divide-slate-700 relative`}
            >
              {backwardLaneArray.map((opLane) => {
                const opposingHazards = nearbyHazards.filter(
                  (h) => !isSameDrivingDirection(currentHeading, h.heading) && h.distanceMeters <= 350
                );

                return (
                  <div
                    key={`back-${opLane}`}
                    className="flex-1 flex flex-col items-center justify-between py-2 sm:py-4 px-1 opacity-60"
                  >
                    <span className="text-[10px] sm:text-[11px] font-mono-tabular text-slate-400 text-center">
                      Szembe #{opLane}
                    </span>
                    <ArrowDown className="w-5 h-5 sm:w-7 sm:h-7 text-slate-500 animate-pulse" />
                    {opposingHazards.length > 0 ? (
                      <div className="text-[10px] sm:text-[11px] text-slate-300 text-center font-mono-tabular px-1 py-0.5 rounded bg-slate-800">
                        {opposingHazards[0].distanceMeters}m
                      </div>
                    ) : (
                      <span className="text-[10px] sm:text-[11px] text-slate-500">Ellenirány</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Forward Lanes (Menetirány szerinti saját sávok - Jobb oldal) */}
          <div
            className={`${
              backwardLanes === 0
                ? 'col-span-12'
                : backwardLanes >= 2
                ? 'col-span-8'
                : 'col-span-9'
            } flex divide-x-2 divide-dashed divide-slate-500/80 bg-slate-800/95 relative`}
          >
            {forwardLaneArray.map((laneNum) => {
              const isSelected = selectedForwardLanes.includes(laneNum);
              const laneLabel =
                forwardLanes === 1
                  ? '1. Sáv'
                  : laneNum === 1
                  ? '1. Belső sáv'
                  : laneNum === forwardLanes
                  ? `${laneNum}. Külső sáv`
                  : `${laneNum}. Középső sáv`;

              const matchingHazards = nearbyHazards.filter(
                (h) =>
                  (!h.appliesToDirectionOnly || isSameDrivingDirection(currentHeading, h.heading)) &&
                  h.lanesAffected.includes(laneNum) &&
                  h.distanceMeters <= 400
              );

              return (
                <div
                  key={`fwd-${laneNum}`}
                  onClick={() => onToggleForwardLane(laneNum)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggleForwardLane(laneNum);
                    }
                  }}
                  className={`flex-1 flex flex-col justify-between p-2 sm:p-4 cursor-pointer transition-colors relative ${
                    isSelected
                      ? 'bg-amber-500/15 ring-2 ring-inset ring-amber-400'
                      : 'hover:bg-slate-700/50'
                  }`}
                >
                  {/* Top Lane Header */}
                  <div className="flex items-center justify-between gap-1 z-10">
                    <span
                      className={`text-xs sm:text-base font-bold tracking-tight truncate ${
                        isSelected ? 'text-amber-300' : 'text-slate-200'
                      }`}
                    >
                      {laneLabel}
                    </span>
                    <span
                      className={`text-[10px] sm:text-xs font-mono-tabular px-1.5 py-0.5 rounded font-bold shrink-0 ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {isSelected ? 'AKTÍV' : 'VÁLASZT'}
                    </span>
                  </div>

                  {/* Upcoming Hazard Alert Inside This Specific Lane */}
                  <div className="my-1 sm:my-2 flex flex-col items-center justify-center min-h-[42px] sm:min-h-[72px] z-10">
                    {matchingHazards.length > 0 ? (
                      matchingHazards.slice(0, 1).map((haz) => {
                        const meta = HAZARD_TYPE_LABELS[haz.type] || HAZARD_TYPE_LABELS.other;
                        const latAlign =
                          haz.lateralPosition === 'left_edge'
                            ? 'self-start ml-0.5'
                            : haz.lateralPosition === 'right_edge'
                            ? 'self-end mr-0.5'
                            : 'self-center';
                        return (
                          <div
                            key={haz.id}
                            className={`${latAlign} flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600/95 text-white shadow-md border border-red-300`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <div className="text-[11px] sm:text-xs font-bold leading-tight">
                              <div>
                                {meta.shortLabel} · {haz.distanceMeters}m
                              </div>
                              <div className="text-[9px] sm:text-[10px] font-normal opacity-90">
                                {LATERAL_POSITION_LABELS[haz.lateralPosition]?.short}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center opacity-40">
                        <ArrowUp
                          className={`w-6 h-6 sm:w-9 sm:h-9 text-emerald-400 ${
                            isMoving ? 'animate-bounce' : ''
                          }`}
                        />
                        <span className="text-[10px] sm:text-xs font-mono-tabular text-slate-300">
                          Tiszta ({currentCardinal})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Lateral Sub-Zone Visualizer inside Selected Lane (Bal szél / Közép / Jobb szél) */}
                  <div
                    className="grid grid-cols-3 gap-1 pt-1.5 sm:pt-2 border-t border-slate-700/80 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(
                      [
                        { id: 'left_edge', label: 'Bal' },
                        { id: 'center_lane', label: 'Közép' },
                        { id: 'right_edge', label: 'Jobb' },
                      ] as { id: LateralPosition; label: string }[]
                    ).map((sub) => {
                      const activeSub = isSelected && selectedLateral === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            if (!isSelected) onToggleForwardLane(laneNum);
                            onSelectLateral(sub.id);
                            if (onQuickCaptureFromLane) {
                              onQuickCaptureFromLane(laneNum, sub.id);
                            }
                          }}
                          className={`min-h-[34px] sm:min-h-[42px] rounded-lg text-[11px] sm:text-xs font-bold transition-colors px-1 flex flex-col items-center justify-center ${
                            activeSub
                              ? 'bg-amber-400 text-slate-950 shadow-sm'
                              : 'bg-slate-900/90 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          <span>{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lateral Position Selector Bar (Compact 3-col on mobile, detailed on desktop) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
        {(
          [
            {
              id: 'left_edge',
              shortTitle: 'Bal szél',
              title: 'Bal széle (Belső ív / Felező)',
              desc: 'A sáv bal széle vagy felezővonal mentén',
            },
            {
              id: 'center_lane',
              shortTitle: 'Sáv közepe',
              title: 'Sáv közepe (Tengely / Keréknyom)',
              desc: 'A forgalmi sáv belső vagy középvonala',
            },
            {
              id: 'right_edge',
              shortTitle: 'Jobb szél',
              title: 'Jobb széle (Padka / Vízelvezető)',
              desc: 'Az úttest jobb széle vagy útpadka mentén',
            },
          ] as { id: LateralPosition; shortTitle: string; title: string; desc: string }[]
        ).map((pos) => {
          const isSelected = selectedLateral === pos.id;
          return (
            <button
              key={pos.id}
              type="button"
              onClick={() => onSelectLateral(pos.id)}
              className={`min-h-[42px] sm:min-h-[56px] p-2 sm:p-3 rounded-xl border text-center sm:text-left transition-all flex flex-col justify-center ${
                isSelected
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                  : isDark
                  ? 'bg-slate-950/70 border-slate-800 text-slate-200 hover:border-slate-700'
                  : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <div className="sm:hidden text-xs font-extrabold leading-tight">{pos.shortTitle}</div>
              <div className="hidden sm:block text-sm sm:text-base font-bold leading-snug">{pos.title}</div>
              <div
                className={`hidden sm:block text-xs mt-0.5 ${
                  isSelected ? 'text-slate-900 font-medium' : 'text-slate-400'
                }`}
              >
                {pos.desc}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
