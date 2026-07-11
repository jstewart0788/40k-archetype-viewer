import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import HELP_CONTENT from '../data/helpContent.jsx';

const POPOVER_WIDTH = 320;
const VIEWPORT_MARGIN = 8;
const ESTIMATED_HEIGHT = 200;
const HOVER_CLOSE_DELAY_MS = 150;

/**
 * Inline `i` icon that opens a popover with a focused excerpt of the
 * relevant docs section. Reuses the same hover-or-tap state model as
 * ArchetypeTooltip so the two affordances feel like one system.
 *
 * Renders the popover via a portal to document.body and positions it
 * with getBoundingClientRect, so a popover near the viewport edge gets
 * clamped to stay on-screen instead of overflowing — fixed-translate
 * centering can't cope with icons close to the right edge of the page.
 *
 * Desktop: opens on hover (with a small close-delay so the cursor can
 *          travel from icon to popover content).
 * Touch:   opens on tap, closes on outside click.
 */
const InfoPopover = ({ topic, className = '' }) => {
  const entry = HELP_CONTENT[topic];
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);

  // Position the popover relative to the trigger, clamped to viewport.
  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: center on trigger, then clamp to viewport.
    let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, vw - POPOVER_WIDTH - VIEWPORT_MARGIN)
    );

    // Vertical: prefer below, flip above if it wouldn't fit and there's
    // room above. Uses estimated height since the popover hasn't laid
    // out yet on first open; once mounted, a follow-up recompute uses
    // the actual height.
    const below = rect.bottom + VIEWPORT_MARGIN;
    const fitBelow = below + ESTIMATED_HEIGHT <= vh - VIEWPORT_MARGIN;
    const fitAbove = rect.top - ESTIMATED_HEIGHT - VIEWPORT_MARGIN >= 0;
    let top;
    let placement = 'below';
    if (fitBelow || !fitAbove) {
      top = below;
    } else {
      // Flip above. We don't know exact height; subtract estimate and
      // let the post-mount recompute correct it if it's off.
      top = rect.top - VIEWPORT_MARGIN;
      placement = 'above';
    }

    setCoords({ left, top, placement });
  };

  // Recompute on open and on viewport changes while open.
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handle = () => updatePosition();
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true); // capture for nested scrollers
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [open]);

  // Once mounted, refine vertical position using the popover's real height
  // (the first paint used ESTIMATED_HEIGHT). Only matters for the
  // flip-above case, where the top edge depends on actual height.
  useEffect(() => {
    if (!open || !coords || coords.placement !== 'above') return;
    const el = popoverRef.current;
    if (!el) return;
    const realHeight = el.offsetHeight;
    if (realHeight && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const refinedTop = rect.top - realHeight - VIEWPORT_MARGIN;
      if (Math.abs(refinedTop - coords.top) > 2) {
        setCoords((c) => (c ? { ...c, top: refinedTop } : c));
      }
    }
    // We deliberately want this to run once per open, not chase its own update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coords?.placement]);

  // Outside-click closes (touch + mouse).
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      const t = triggerRef.current;
      const p = popoverRef.current;
      if (t && t.contains(e.target)) return;
      if (p && p.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [open]);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  };
  const handleEnter = () => {
    cancelClose();
    setOpen(true);
  };

  if (!entry) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`About ${entry.title}`}
        onMouseEnter={handleEnter}
        onMouseLeave={scheduleClose}
        onFocus={handleEnter}
        onBlur={scheduleClose}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full border border-slate-500/60 text-slate-400 text-[11px] font-serif italic font-semibold leading-none hover:border-purple-400 hover:text-purple-300 transition-colors align-middle ${className}`}
      >
        i
      </button>
      {open && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          onMouseEnter={handleEnter}
          onMouseLeave={scheduleClose}
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            width: POPOVER_WIDTH,
            zIndex: 1000,
          }}
        >
          <div className="bg-slate-900/95 backdrop-blur-sm border border-purple-500/50 rounded-lg shadow-2xl p-4 text-left">
            <div className="text-sm font-semibold text-white mb-2">
              {entry.title}
            </div>
            <div className="text-xs text-slate-200 leading-relaxed font-normal">
              {entry.body}
            </div>
            <Link
              to={`/docs#${entry.docsAnchor}`}
              className="block mt-3 text-xs text-purple-400 hover:text-purple-300 font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              Read full docs →
            </Link>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default InfoPopover;
