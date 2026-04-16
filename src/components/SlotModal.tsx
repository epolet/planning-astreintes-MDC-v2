import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { getCadres } from '../db/cadres';
import { updateSlotWithScores, deleteSlot } from '../db/slots';
import type { Slot, Cadre, DifficultyLevel } from '../types';
import { DIFFICULTY_COLORS, DIFFICULTY_LABELS, totalAstreintes, totalPermanences } from '../types';

interface Props {
  slot: Slot | null;
  onClose: () => void;
  periodId: string | null;
  onDelete?: () => void;
}

export default function SlotModal({ slot, onClose, periodId, onDelete }: Props) {
  const [cadreId, setCadreId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(1);
  const [cadres, setCadres] = useState<Cadre[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getCadres().then(setCadres).catch(() => {});
  }, []);

  useEffect(() => {
    if (slot) {
      setCadreId(slot.cadreId);
      setDifficulty(slot.difficulty);
    }
  }, [slot]);

  if (!slot) return null;

  const activeCadres = cadres.filter(c => c.active);
  // For Noël astreinte slots (D5), all cadres are eligible — no role restriction
  const isNoelAstreinte = slot.type === 'astreinte' && slot.difficulty === 5;
  const primaryCadres = isNoelAstreinte
    ? activeCadres
    : activeCadres.filter(c => {
        if (slot.type === 'astreinte') return c.role === 'astreinte' || c.role === 'both';
        return c.role === 'permanence' || c.role === 'both';
      });
  const otherCadres = isNoelAstreinte ? [] : activeCadres.filter(c => !primaryCadres.includes(c));

  async function handleSave() {
    if (!slot?.id) return;
    await updateSlotWithScores(slot.id, { cadreId, difficulty, periodId });
    onClose();
  }

  async function handleDelete() {
    if (!slot?.id) return;
    await deleteSlot(slot.id);
    onDelete ? onDelete() : onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Modifier le creneau</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Creneau</p>
            <p className="text-sm text-slate-900">{slot.label}</p>
            <span
              className={`inline-block mt-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                slot.type === 'astreinte' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'
              }`}
            >
              {slot.type === 'astreinte' ? 'Astreinte' : 'Permanence'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              Niveau de difficulte
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {([1, 2, 3, 4, 5] as DifficultyLevel[]).map(level => (
                <button
                  key={level}
                  onClick={() => setDifficulty(level)}
                  className={`px-1.5 py-2 rounded-lg text-xs font-medium border-2 transition-all text-center ${
                    difficulty === level
                      ? `${DIFFICULTY_COLORS[level].badge} ${DIFFICULTY_COLORS[level].border} ring-2 ${DIFFICULTY_COLORS[level].ring} ring-offset-1`
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {level === 5 ? '🎄 Noël' : `Niv. ${level}`}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {DIFFICULTY_LABELS[difficulty]} — {difficulty === 5 ? 'Période de Noël' : difficulty === 4 ? '15 août / vacances difficiles' : difficulty === 3 ? 'Début/fin petites vacances' : difficulty === 2 ? 'Pont ou juillet/août' : 'Week-end normal'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              Assignation
            </label>
            <select
              value={cadreId || ''}
              onChange={e => setCadreId(e.target.value || null)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow"
            >
              <option value="">Non assigne</option>
              {primaryCadres.length > 0 && (
                <optgroup label={isNoelAstreinte ? 'Tous les cadres (Noël)' : slot.type === 'astreinte' ? 'Cadres Astreinte' : 'Cadres Permanence'}>
                  {primaryCadres
                    .sort((a, b) => (totalAstreintes(a) + totalPermanences(a)) - (totalAstreintes(b) + totalPermanences(b)))
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} (A:{totalAstreintes(c)} P:{totalPermanences(c)})
                      </option>
                    ))}
                </optgroup>
              )}
              {otherCadres.length > 0 && (
                <optgroup label="Autres cadres">
                  {otherCadres.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {confirmDelete ? (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-red-100 bg-red-50">
            <p className="text-sm text-red-700 font-medium">Supprimer ce créneau définitivement ?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
              >
                Enregistrer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
