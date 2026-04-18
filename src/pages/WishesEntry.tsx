import { useState, useEffect, useRef } from 'react';
import { parseISO, getISOWeek } from 'date-fns';
import { usePeriod } from '../context/PeriodContext';
import { getCadres } from '../db/cadres';
import { getSlotsByPeriod } from '../db/slots';
import { getWishesByPeriod, setSlotWishes } from '../db/wishes';
import type { Cadre, Slot, DifficultyLevel } from '../types';
import { fullName, DIFFICULTY_COLORS, DIFFICULTY_LABELS } from '../types';
import { CheckSquare, Square, Save, Users, AlertCircle, Search, User } from 'lucide-react';
import { toast } from '../utils/toast';

// ─── Multi-select dropdown component ─────────────────────────────────────────

interface MultiSelectProps {
  options: Cadre[];
  selected: Set<string>;
  onChange: (id: string, checked: boolean) => void;
}

function CadreMultiSelect({ options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Determine if dropdown should open upward based on available viewport space
  function handleToggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // Dropdown height ≈ search bar (40px) + up to 8 items × 36px = ~328px, capped at 280px
      setOpenUpward(spaceBelow < 300);
    }
    if (open) setSearch('');
    setOpen(o => !o);
  }

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open]);

  const selectedList = options.filter(c => selected.has(c.id!));
  const filtered = search.trim()
    ? options.filter(c => fullName(c).toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={containerRef} className="relative min-w-[220px]">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-left hover:border-slate-300 transition-colors"
      >
        {selectedList.length === 0 ? (
          <span className="text-slate-400 flex-1">Aucun vœu</span>
        ) : (
          <span className="flex-1 flex flex-wrap gap-1">
            {selectedList.map(c => (
              <span key={c.id} className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                {fullName(c)}
              </span>
            ))}
          </span>
        )}
        <Users className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      </button>

      {open && (
        <div
          className={`absolute z-50 w-64 bg-white rounded-xl border border-slate-200 shadow-xl ${
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {/* Search input */}
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200 transition-all">
              <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-slate-400 hover:text-slate-600 text-xs leading-none"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="py-1 max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400 text-center">Aucun résultat</p>
            ) : (
              filtered.map(cadre => {
                const checked = selected.has(cadre.id!);
                return (
                  <button
                    key={cadre.id}
                    type="button"
                    onClick={() => onChange(cadre.id!, !checked)}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors ${
                      checked ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <span className="truncate">{fullName(cadre)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WishesEntry() {
  const { activePeriod } = usePeriod();
  const [cadres, setCadres] = useState<Cadre[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  // wishMap: slotId → Set<cadreId>
  const [wishMap, setWishMap] = useState<Map<string, Set<string>>>(new Map());
  const [saving, setSaving] = useState<string | null>(null); // slotId being saved
  const [savedSlots, setSavedSlots] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'astreinte' | 'permanence'>('astreinte');
  const [difficultyFilter, setDifficultyFilter] = useState<number | null>(null);
  const [cadreFilter, setCadreFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!activePeriod?.id) { setLoading(false); return; }
    Promise.all([getCadres(), getSlotsByPeriod(activePeriod.id), getWishesByPeriod(activePeriod.id)])
      .then(([c, s, wishesMap]) => {
        setCadres(c);
        setSlots(s);
        // Convert to Set<string>
        const map = new Map<string, Set<string>>();
        for (const [slotId, cadreIds] of wishesMap) {
          map.set(slotId, new Set(cadreIds));
        }
        setWishMap(map);
      })
      .catch(() => { toast.error('Impossible de charger les vœux'); })
      .finally(() => setLoading(false));
  }, [activePeriod]);

  const activeCadres = cadres.filter(c => c.active);
  const astreinteCadres = activeCadres.filter(c => c.role === 'astreinte' || c.role === 'both');
  const allCadres = activeCadres;

  function toggleWish(slotId: string, cadreId: string, checked: boolean) {
    setWishMap(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(slotId) ?? []);
      if (checked) set.add(cadreId); else set.delete(cadreId);
      next.set(slotId, set);
      return next;
    });
    // Mark as unsaved
    setSavedSlots(prev => { const n = new Set(prev); n.delete(slotId); return n; });
  }

  async function saveSlot(slotId: string) {
    setSaving(slotId);
    try {
      const cadreIds = Array.from(wishMap.get(slotId) ?? []);
      await setSlotWishes(slotId, cadreIds);
      setSavedSlots(prev => new Set([...prev, slotId]));
    } catch { /* noop */ }
    setSaving(null);
  }

  async function saveAll() {
    const slotsToSave = displaySlots;
    for (const slot of slotsToSave) {
      if (slot.id) await saveSlot(slot.id);
    }
  }

  if (loading) return <div className="animate-pulse h-96 bg-slate-100 rounded-xl" />;

  if (!activePeriod) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <p className="text-slate-400 text-sm">Aucune periode selectionnee.</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Saisie des Vœux</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            Aucun créneau généré pour cette période. Générez d'abord les créneaux.
          </p>
        </div>
      </div>
    );
  }

  const astreinteSlots = slots.filter(s => s.type === 'astreinte').sort((a, b) => a.date.localeCompare(b.date));
  const permanenceSlots = slots.filter(s => s.type === 'permanence').sort((a, b) => a.date.localeCompare(b.date));
  const tabSlots = tab === 'astreinte' ? astreinteSlots : permanenceSlots;
  const eligibleCadres = tab === 'astreinte' ? astreinteCadres : allCadres;

  // Difficulty levels present in the current tab, sorted D5 → D1
  const availableDifficulties = [...new Set(tabSlots.map(s => s.difficulty))].sort((a, b) => b - a);

  // Apply difficulty + cadre filters
  const displaySlots = tabSlots
    .filter(s => difficultyFilter === null || s.difficulty === difficultyFilter)
    .filter(s => cadreFilter === null || (wishMap.get(s.id!)?.has(cadreFilter) ?? false));

  // For a given slot, return the eligible cadres (Noël astreinte → all cadres)
  function slotEligibleCadres(slot: Slot): Cadre[] {
    if (slot.type === 'astreinte' && slot.difficulty === 5) return allCadres;
    return eligibleCadres;
  }

  const totalWishes = displaySlots.reduce((n, s) => n + (wishMap.get(s.id!)?.size ?? 0), 0);
  const slotsWithWishes = displaySlots.filter(s => (wishMap.get(s.id!)?.size ?? 0) > 0).length;

  // Wish count per cadre across ALL slots of the current tab (not filtered)
  const wishCountByCadre = eligibleCadres
    .map(c => ({
      cadre: c,
      count: tabSlots.filter(s => wishMap.get(s.id!)?.has(c.id!) ?? false).length,
    }))
    .sort((a, b) => a.count - b.count || a.cadre.name.localeCompare(b.cadre.name));
  const maxWishCount = wishCountByCadre[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Saisie des Vœux</h2>
          <p className="text-sm text-slate-500 mt-1">
            {activePeriod.label} — Pour chaque créneau, sélectionnez les cadres volontaires
          </p>
        </div>
        <button
          onClick={saveAll}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Save className="w-4 h-4" />
          Enregistrer tous
        </button>
      </div>

      {/* Tab selector + difficulty filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => { setTab('astreinte'); setDifficultyFilter(null); setCadreFilter(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'astreinte'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Astreintes ({astreinteSlots.length})
          </button>
          <button
            onClick={() => { setTab('permanence'); setDifficultyFilter(null); setCadreFilter(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'permanence'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Permanences ({permanenceSlots.length})
          </button>
        </div>

        {/* Difficulty filter chips */}
        {availableDifficulties.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 font-medium">Difficulté :</span>
            <button
              onClick={() => setDifficultyFilter(null)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                difficultyFilter === null
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}
            >
              Tous
            </button>
            {availableDifficulties.map(d => {
              const colors = DIFFICULTY_COLORS[d];
              const active = difficultyFilter === d;
              return (
                <button
                  key={d}
                  onClick={() => setDifficultyFilter(active ? null : d)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? `${colors.badge} border-current shadow-sm`
                      : `bg-white border-slate-200 text-slate-500 hover:border-slate-400`
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                  {DIFFICULTY_LABELS[d]}
                </button>
              );
            })}
          </div>
        )}

        {/* Cadre filter */}
        <div className="relative">
          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select
            value={cadreFilter ?? ''}
            onChange={e => setCadreFilter(e.target.value || null)}
            className={`pl-8 pr-3 py-1.5 text-xs font-medium bg-white border rounded-lg appearance-none cursor-pointer min-w-[160px] transition-colors ${
              cadreFilter
                ? 'border-blue-400 text-blue-700 ring-1 ring-blue-200'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <option value="">Tous les cadres</option>
            {eligibleCadres.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
              <option key={c.id} value={c.id}>
                {fullName(c)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm text-slate-500">
        <span>
          <strong className="text-slate-900">{slotsWithWishes}</strong> / {displaySlots.length} créneaux avec vœux
        </span>
        <span>
          <strong className="text-slate-900">{totalWishes}</strong> vœux au total
        </span>
      </div>

      {/* Slot list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {displaySlots.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            {cadreFilter
              ? 'Ce cadre n\'a exprimé aucun vœu sur les créneaux affichés.'
              : 'Aucun créneau de ce type dans la période.'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-56">
                  Créneau
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">
                  Difficulté
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Cadres volontaires
                  {difficultyFilter === null
                    ? ` (${eligibleCadres.length} éligibles)`
                    : ` — filtre ${DIFFICULTY_LABELS[difficultyFilter as DifficultyLevel]}`}
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displaySlots.map(slot => {
                const wishes = wishMap.get(slot.id!) ?? new Set<string>();
                const isSaved = savedSlots.has(slot.id!);
                const isSaving = saving === slot.id;
                const colors = DIFFICULTY_COLORS[slot.difficulty];
                return (
                  <tr key={slot.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900 truncate max-w-[210px]" title={slot.label}>
                        {slot.type === 'astreinte' && (
                          <span className="inline-block mr-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                            S{getISOWeek(parseISO(slot.date))}
                          </span>
                        )}
                        {slot.label}
                      </p>
                      <p className="text-xs text-slate-400">{slot.date}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        {DIFFICULTY_LABELS[slot.difficulty]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <CadreMultiSelect
                        options={slotEligibleCadres(slot)}
                        selected={wishes}
                        onChange={(id, checked) => toggleWish(slot.id!, id, checked)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => saveSlot(slot.id!)}
                        disabled={isSaving}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isSaved
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700'
                        }`}
                      >
                        <Save className="w-3 h-3" />
                        {isSaving ? '...' : isSaved ? 'Sauvé' : 'Sauver'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary table: wish count per cadre */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Récapitulatif des vœux — {tab === 'astreinte' ? 'Astreintes' : 'Permanences'} (période complète)
          </h3>
        </div>
        {wishCountByCadre.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">Aucun cadre éligible.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 w-8">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Cadre</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 text-right w-28">Vœux</th>
                <th className="px-4 py-2.5 w-48 hidden sm:table-cell" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {wishCountByCadre.map(({ cadre, count }, idx) => (
                <tr
                  key={cadre.id}
                  className={`transition-colors ${cadreFilter === cadre.id ? 'bg-blue-50' : 'hover:bg-slate-50/50'}`}
                >
                  <td className="px-4 py-2.5 text-xs text-slate-400 tabular-nums">{idx + 1}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-700 font-medium">{fullName(cadre)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className={`text-sm font-semibold ${count === 0 ? 'text-slate-300' : count === maxWishCount ? 'text-blue-600' : 'text-slate-700'}`}>
                      {count}
                    </span>
                    <span className="text-xs text-slate-400 ml-1">/ {tabSlots.length}</span>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${count === 0 ? 'bg-slate-200' : 'bg-blue-400'}`}
                        style={{ width: `${tabSlots.length > 0 ? (count / tabSlots.length) * 100 : 0}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Les vœux sont utilisés lors de la répartition automatique (étape 2 de la génération).
        Seuls les cadres ayant exprimé un vœu pour un créneau seront candidats à son attribution.
      </p>
    </div>
  );
}
