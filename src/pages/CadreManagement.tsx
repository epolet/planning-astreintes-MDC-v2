import { useState, useEffect, useCallback } from 'react';
import { getCadres, addCadre, updateCadre, deleteCadre, countSlotsByCadre, resetAllScores } from '../db/cadres';
import type { Cadre } from '../types';
import { totalAstreintes, totalPermanences, ZERO_COUNTERS, fullName } from '../types';
import { Plus, Pencil, Trash2, UserCheck, UserX, MapPin, RotateCcw, AlertTriangle } from 'lucide-react';

export default function CadreManagement() {
  const [cadres, setCadres] = useState<Cadre[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Cadre | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    prenom: '',
    role: 'both' as Cadre['role'],
    nearMuseum: true,
  });
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; slotCount: number } | null>(null);

  const refresh = useCallback(() => {
    getCadres()
      .then(setCadres)
      .catch(() => setCadres([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) {
    return <div className="animate-pulse h-96 bg-slate-100 rounded-xl" />;
  }

  function resetForm() {
    setForm({ name: '', prenom: '', role: 'both', nearMuseum: true });
    setEditing(null);
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    if (editing) {
      await updateCadre(editing.id!, {
        name: form.name,
        prenom: form.prenom,
        role: form.role,
        nearMuseum: form.nearMuseum,
      });
    } else {
      await addCadre({
        name: form.name,
        prenom: form.prenom,
        role: form.role,
        nearMuseum: form.nearMuseum,
        ...ZERO_COUNTERS,
        active: true,
      });
    }
    resetForm();
    refresh();
  }

  async function handleResetAllScores() {
    await resetAllScores();
    setShowResetDialog(false);
    refresh();
  }

  function startEdit(cadre: Cadre) {
    setForm({ name: cadre.name, prenom: cadre.prenom ?? '', role: cadre.role, nearMuseum: cadre.nearMuseum });
    setEditing(cadre);
    setShowForm(true);
  }

  async function toggleActive(cadre: Cadre) {
    await updateCadre(cadre.id!, { active: !cadre.active });
    refresh();
  }

  async function handleDeleteClick(cadre: Cadre) {
    const count = await countSlotsByCadre(cadre.id!);
    setDeleteTarget({ id: cadre.id!, name: fullName(cadre), slotCount: count });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteCadre(deleteTarget.id);
    setDeleteTarget(null);
    refresh();
  }

  const astreinteCadres = cadres.filter(c => c.role === 'astreinte' || c.role === 'both');
  const permanenceCadres = cadres.filter(c => c.role === 'permanence' || c.role === 'both');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Gestion des Cadres</h2>
          <p className="text-sm text-slate-500 mt-1">
            {astreinteCadres.length} astreinte, {permanenceCadres.length} permanence
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Ajouter un cadre
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">
            {editing ? 'Modifier le cadre' : 'Nouveau cadre'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Prénom</label>
              <input
                type="text"
                value={form.prenom}
                onChange={e => setForm({ ...form, prenom: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow"
                placeholder="Prénom"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Nom</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow"
                placeholder="Nom"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Rôle</label>
              <select
                value={form.role}
                onChange={e => {
                  const role = e.target.value as Cadre['role'];
                  setForm({ ...form, role, nearMuseum: role === 'both' });
                }}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow"
              >
                <option value="both">Astreinte &amp; permanence</option>
                <option value="permanence">Permanence</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Proximité</label>
              <label className="flex items-center gap-2.5 mt-2 cursor-not-allowed opacity-60">
                <input
                  type="checkbox"
                  checked={form.nearMuseum}
                  disabled
                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                />
                <span className="text-sm text-slate-600">
                  Moins de 30 min
                  <span className="ml-1 text-[10px] text-slate-400">(défini par le rôle)</span>
                </span>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              {editing ? 'Mettre a jour' : 'Ajouter'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nom</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Proximite</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Astr.</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Perm.</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tot.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Statut</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cadres.map(cadre => (
                <tr
                  key={cadre.id}
                  className={`hover:bg-slate-50/50 transition-colors ${!cadre.active ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{fullName(cadre)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        cadre.role === 'astreinte'
                          ? 'bg-blue-100 text-blue-700'
                          : cadre.role === 'permanence'
                            ? 'bg-teal-100 text-teal-700'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {cadre.role === 'both' ? 'Astr. & Perm.' : cadre.role === 'astreinte' ? 'Astreinte' : 'Permanence'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <MapPin className={`w-3.5 h-3.5 ${cadre.nearMuseum ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <span className="text-xs text-slate-600">
                        {cadre.nearMuseum ? '< 30 min' : '> 30 min'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600 tabular-nums">
                    {totalAstreintes(cadre)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-semibold text-teal-600 tabular-nums">
                    {totalPermanences(cadre)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-slate-800 tabular-nums">
                    {totalAstreintes(cadre) + totalPermanences(cadre)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(cadre)}
                      className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                        cadre.active
                          ? 'text-emerald-600 hover:text-emerald-700'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {cadre.active ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                      {cadre.active ? 'Actif' : 'Inactif'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => startEdit(cadre)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(cadre)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cadres.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-slate-400 text-sm">
              Aucun cadre enregistre. Cliquez sur "Ajouter un cadre" pour commencer.
            </p>
          </div>
        )}
      </div>

      {cadres.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                <RotateCcw className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Reinitialiser tous les scores</p>
                <p className="text-xs text-slate-500">Remet a zero les scores globaux de tous les cadres</p>
              </div>
            </div>
            <button
              onClick={() => setShowResetDialog(true)}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Reinitialiser
            </button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Supprimer {deleteTarget.name} ?</h3>
              {deleteTarget.slotCount > 0 ? (
                <p className="text-sm text-slate-600 mb-1">
                  Ce cadre est assigne a{' '}
                  <span className="font-semibold text-red-700">{deleteTarget.slotCount} creneau{deleteTarget.slotCount > 1 ? 'x' : ''}</span>.
                  Ces creneaux seront desassignes.
                </p>
              ) : (
                <p className="text-sm text-slate-600 mb-1">
                  Ce cadre n'a aucun creneau assigne.
                </p>
              )}
              <p className="text-sm font-semibold text-red-700 mb-6">
                Cette suppression est definitive et irreversible.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowResetDialog(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <RotateCcw className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Attention</h3>
              <p className="text-sm text-slate-600 mb-1">
                Vous allez remettre a zero tous les scores cumules de l'ensemble des cadres.
              </p>
              <p className="text-sm font-semibold text-red-700 mb-6">
                Cette modification est definitive et irreversible.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetDialog(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleResetAllScores}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Confirmer la remise a zero
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
