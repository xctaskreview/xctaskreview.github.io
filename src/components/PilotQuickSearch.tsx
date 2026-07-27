import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { extractPilotDisplayName } from '../lib/igc';
import type { FlightTrack } from '../lib/types';
import { Icon } from './Icon';

export interface PilotQuickSearchEntry {
  id: string;
  label: string;
  gliderType?: string;
  color: string;
}

interface PilotQuickSearchProps {
  open: boolean;
  entries: PilotQuickSearchEntry[];
  onClose: () => void;
  onSelect: (trackId: string) => void;
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function buildPilotQuickSearchEntries(
  tracks: FlightTrack[],
  trackColors: Record<string, string>,
): PilotQuickSearchEntry[] {
  return tracks
    .map((track, index) => ({
      id: track.id,
      label: extractPilotDisplayName(track),
      gliderType: track.gliderType,
      color: trackColors[track.id] ?? `hsl(${(index * 47) % 360} 70% 45%)`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

export function PilotQuickSearch({ open, entries, onClose, onSelect }: PilotQuickSearchProps) {
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const normalized = normalizeQuery(query);
    if (!normalized) return entries;
    return entries.filter((entry) => {
      const haystack = `${entry.label} ${entry.gliderType ?? ''}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [entries, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlightIndex(0);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, entries.length]);

  useEffect(() => {
    if (!open) return;
    setHighlightIndex((current) => Math.min(current, Math.max(0, filtered.length - 1)));
  }, [open, filtered.length]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightIndex((current) => Math.min(filtered.length - 1, current + 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightIndex((current) => Math.max(0, current - 1));
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const entry = filtered[highlightIndex];
        if (entry) {
          onSelect(entry.id);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, filtered, highlightIndex, onClose, onSelect]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.querySelector<HTMLElement>(
      `[data-pilot-search-index="${highlightIndex}"]`,
    );
    item?.scrollIntoView({ block: 'nearest' });
  }, [open, highlightIndex, filtered.length]);

  if (!open) return null;

  return createPortal(
    <div className="pilot-quick-search-root" role="presentation">
      <div className="pilot-quick-search-backdrop" aria-hidden="true" onMouseDown={onClose} />
      <div className="pilot-quick-search-panel" role="dialog" aria-modal="true" aria-label="Pilot search">
        <div className="pilot-quick-search-input-row">
          <Icon icon={Search} size="sm" />
          <input
            ref={inputRef}
            type="search"
            className="pilot-quick-search-input"
            placeholder="Search pilots…"
            aria-label="Search pilots"
            aria-controls="pilot-quick-search-list"
            aria-activedescendant={
              filtered[highlightIndex] ? `pilot-quick-search-option-${highlightIndex}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ul
          id="pilot-quick-search-list"
          ref={listRef}
          className="pilot-quick-search-list"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="pilot-quick-search-empty">No matching pilots</li>
          ) : (
            filtered.map((entry, index) => (
              <li
                key={entry.id}
                id={`pilot-quick-search-option-${index}`}
                data-pilot-search-index={index}
                role="option"
                aria-selected={index === highlightIndex}
                className={`pilot-quick-search-option${index === highlightIndex ? ' highlighted' : ''}`}
                onMouseEnter={() => setHighlightIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(entry.id);
                  onClose();
                }}
              >
                <span className="pilot-quick-search-color" style={{ background: entry.color }} aria-hidden="true" />
                <span className="pilot-quick-search-label">{entry.label}</span>
                {entry.gliderType && (
                  <span className="pilot-quick-search-glider">{entry.gliderType}</span>
                )}
              </li>
            ))
          )}
        </ul>
        <p className="pilot-quick-search-hint">↑↓ to navigate · Enter to focus · Esc to close</p>
      </div>
    </div>,
    document.body,
  );
}
