import { useEffect, useRef, useState } from 'react';
import { archetypes, archetypeGroups } from '../data/archetypeData';

const ARCH_GROUP_MAP = Object.fromEntries(
  Object.entries(archetypeGroups).flatMap(([gKey, g]) =>
    g.members.map(m => [m, { key: gKey, ...g }])
  )
);

/**
 * Wraps an inline label with a hover-or-tap-revealed card showing the full
 * archetype description.
 *
 * Desktop: opens on hover (CSS `group-hover/at` pattern).
 * Touch:   opens on tap, closes on outside click. State-driven so hover and
 *          tap behaviors layer cleanly — a hover-pinned tooltip stays open
 *          if the user clicks, and a tapped tooltip stays open if the user
 *          mouses away.
 *
 * Usage:
 *   <ArchetypeTooltip archetypeKey="mobileToolbox">
 *     <span className="...">Mobile Toolbox</span>
 *   </ArchetypeTooltip>
 */
const ArchetypeTooltip = ({ archetypeKey, children, side = 'top', className = '' }) => {
  const arch = archetypes[archetypeKey];
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Close on outside-click while open. Listens for both mouse + touch.
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [open]);

  if (!arch) return <>{children}</>;
  const group = ARCH_GROUP_MAP[archetypeKey];

  const sideClass = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
  }[side] || 'bottom-full left-1/2 -translate-x-1/2 mb-2';

  // When pinned open, force visibility. Otherwise fall back to CSS group-hover.
  const tipVisClass = open
    ? 'visible opacity-100'
    : 'invisible opacity-0 group-hover/at:visible group-hover/at:opacity-100';

  return (
    <span
      ref={wrapperRef}
      className={`relative group/at inline-block ${className}`}
      onClick={(e) => {
        // Toggle on tap; stop propagation so outer card-click handlers
        // don't also fire (e.g. selecting a faction or build).
        e.stopPropagation();
        setOpen((o) => !o);
      }}
    >
      {children}
      <span
        className={`pointer-events-none absolute z-50 transition-opacity duration-150 w-72 ${tipVisClass} ${sideClass}`}
      >
        <span className="block bg-slate-900/95 backdrop-blur-sm border-2 rounded-lg shadow-2xl p-3"
              style={{ borderColor: arch.color }}>
          <span className="block text-base font-bold mb-0.5" style={{ color: arch.color }}>
            {arch.name}
          </span>
          {group && (
            <span className="block text-[10px] uppercase tracking-wide mb-2" style={{ color: group.color }}>
              {group.label}
            </span>
          )}
          <span className="block text-xs text-slate-200 leading-relaxed mb-3">
            {arch.definition}
          </span>
          {arch.strengths?.length > 0 && (
            <span className="block mb-2">
              <span className="block text-[10px] font-semibold text-emerald-400 mb-1 uppercase tracking-wide">
                Strengths
              </span>
              <span className="block text-[11px] text-slate-300 leading-relaxed">
                {arch.strengths.join(' · ')}
              </span>
            </span>
          )}
          {arch.weaknesses?.length > 0 && (
            <span className="block mb-2">
              <span className="block text-[10px] font-semibold text-rose-400 mb-1 uppercase tracking-wide">
                Weaknesses
              </span>
              <span className="block text-[11px] text-slate-300 leading-relaxed">
                {arch.weaknesses.join(' · ')}
              </span>
            </span>
          )}
          {arch.counters && (
            <span className="block text-[11px] text-slate-300 leading-relaxed mb-1">
              <span className="text-emerald-400 font-semibold">Counters: </span>
              {arch.counters}
            </span>
          )}
          {arch.weakTo && (
            <span className="block text-[11px] text-slate-300 leading-relaxed">
              <span className="text-rose-400 font-semibold">Weak to: </span>
              {arch.weakTo}
            </span>
          )}
        </span>
      </span>
    </span>
  );
};

export default ArchetypeTooltip;
