import { useState, useEffect, useCallback } from 'react';
import {
  getCadres, addCadre, updateCadre, archiveCadre, countSlotsByCadre, resetAllScores,
  getArchivedCadres, restoreCadre,
} from '../db/cadres';
import type { Cadre } from '../types';
import { totalAstreintes, totalPermanences, ZERO_COUNTERS, fullName } from '../types';
import {
  Plus, Pencil, Archive, UserCheck, UserX, MapPin, RotateCcw, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';

export default function CadreManagement() {
  const [cadres, setCadres] = useState<Cadre[]>([]);
  const [archivedCadres, setArchivedCadres] = useState<Cadre[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Cadre | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({
    name: '',
    prenom: '',
    role: 'both' as Cadre['role'],
    nearMuseum: true,
  });
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string; slotCount: number } | null>(null);

  const refresh = useCallback(() => {
    Promise.all([getCadres(), getArchivedCadres()])
      .then(([active, archived]) => { setCadres(active); setArchivedCadres(archived); })
      .catch(() => { setCadres([]); setArchivedCadres([]); })
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

  async function handleArchiveClick(cadre: Cadre) {
    const count = await countSlotsByCadre(cadre.id!);
    setArchiveTarget({ id: cadre.id!, name: fullName(cadre), slotCount: count });
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    await archiveCadre(archiveTarget.id);
    setArchiveTarget(null);
    refresh();
  }

  async function handleRestore(cadre: Cadre) {
    await restoreCadre(cadre.id!);
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
            {archivedCadres.length > 0 && (
              <span className="ml-2 text-slate-400">· {archivedCadres.length} archivé{archivedCadres.length > 1 ? 's' : ''}</span>
            )}
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
              {editing ? 'Mettre à jour' : 'Ajouter'}
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

      {/* ── Active cadres table ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nom</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rôle</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Proximité</th>
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
                        title="Modifier"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <button
                        onClick={() => handleArchiveClick(cadre)}
                        className="p-1.5 rounded-lg hover:bg-amber-50 transition-colors"
                        title="Archiver (départ)"
                      >
                        <Archive className="w-3.5 h-3.5 text-amber-500" />
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
              Aucun cadre actif. Cliquez sur "Ajouter un cadre" pour commencer.
            </p>
          </div>
        )}
      </div>

      {/* ── Archived cadres section ── */}
      {archivedCadres.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-600 hover:bg-slate-50/60 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-slate-400" />
              Cadres archivés ({archivedCadres.length})
            </span>
            {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showArchived && (
            <div className="border-t border-slate-100 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nom</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rôle</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Départ</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {archivedCadres.map(cadre => (
                    <tr key={cadre.id} className="opacity-60 hover:opacity-80 transition-opacity">
                      <td className="px-4 py-3 text-sm font-medium text-slate-700">{fullName(cadre)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                          {cadre.role === 'both' ? 'Astr. & Perm.' : cadre.role === 'astreinte' ? 'Astreinte' : 'Permanence'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {cadre.quitLe ? new Date(cadre.quitLe).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRestore(cadre)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          title="Restaurer ce cadre"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restaurer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-5 py-3 text-[11px] text-slate-400 border-t border-slate-50">
                Les créneaux passés restent associés à ces cadres pour l'historique.
                Ils n'apparaissent pas dans les exports Excel.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Reset scores ── */}
      {cadres.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                <RotateCcw className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Réinitialiser tous les scores</p>
                <p className="text-xs text-slate-500">Remet à zéro les scores globaux de tous les cadres</p>
              </div>
            </div>
            <button
              onClick={() => setShowResetDialog(true)}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      {/* ── Archive confirmation dialog ── */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setArchiveTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-7 h-7 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Archiver {archiveTarget.name} ?</h3>
              <p className="text-sm text-slate-600 mb-2">
                Ce cadre ne figurera plus dans la liste active ni dans les exports Excel.
              </p>
              {archiveTarget.slotCount > 0 && (
                <p className="text-sm text-slate-500 mb-2">
                  Ses <span className="font-semibold">{archiveTarget.slotCount} créneaux</span> passés
                  restent visibles dans l'historique des périodes.
                </p>
              )}
              <p className="text-xs text-slate-400 mb-6">
                Vous pourrez le restaurer depuis la section "Cadres archivés".
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setArchiveTarget(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmArchive}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
                >
                  Archiver
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset scores dialog ── */}
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
                Vous allez remettre à zéro tous les scores cumulés de l'ensemble des cadres.
              </p>
              <p className="text-sm font-semibold text-red-700 mb-6">
                Cette modification est définitive et irréversible.
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
                  Confirmer la remise à zéro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
