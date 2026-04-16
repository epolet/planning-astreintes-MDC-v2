import { useState, useEffect } from 'react';
import { getVacations, addVacation, deleteVacation, getClosedDays, addClosedDay, deleteClosedDay } from '../db/config';
import { resetAllScores } from '../db/cadres';
import type { VacationPeriod, ClosedDay } from '../types';
import { Plus, Trash2, MapPin, XCircle, AlertTriangle, Download, Loader2 } from 'lucide-react';
import { fetchSchoolHolidays, getSchoolYearsForYear } from '../utils/fetchHolidays';

export default function Settings() {
  const [vacations, setVacations] = useState<VacationPeriod[] | null>(null);
  const [closedDays, setClosedDays] = useState<ClosedDay[] | null>(null);

  const [newVacation, setNewVacation] = useState({
    name: '',
    startDate: '',
    endDate: '',
    type: 'other',
    zone: 'all',
  });
  const [newClosedDay, setNewClosedDay] = useState({ date: '', reason: '' });

  const [vacationError, setVacationError] = useState<string | null>(null);
  const [fetchYear, setFetchYear] = useState(new Date().getFullYear() + 1);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);

  useEffect(() => {
    getVacations().then(setVacations).catch(() => setVacations([]));
    getClosedDays().then(setClosedDays).catch(() => setClosedDays([]));
  }, []);

  async function handleFetchHolidays() {
    setFetching(true);
    setFetchMsg(null);
    try {
      const schoolYears = getSchoolYearsForYear(fetchYear);
      let totalAdded = 0;
      // Build a local set of already-present keys so duplicates within the
      // same import run are also caught (state is not updated mid-loop).
      const seen = new Set(
        (vacations ?? []).map(v => `${v.name}|${v.startDate}|${v.endDate}`)
      );
      for (const sy of schoolYears) {
        const periods = await fetchSchoolHolidays(sy);
        const relevant = periods.filter(p => {
          const start = new Date(p.startDate);
          const end = new Date(p.endDate);
          return start.getFullYear() === fetchYear || end.getFullYear() === fetchYear;
        });
        for (const p of relevant) {
          const key = `${p.name}|${p.startDate}|${p.endDate}`;
          if (!seen.has(key)) {
            await addVacation(p);
            seen.add(key);
            totalAdded++;
          }
        }
      }
      const updated = await getVacations();
      setVacations(updated);
      setFetchMsg({
        type: 'success',
        text: totalAdded > 0
          ? `${totalAdded} periode(s) ajoutee(s) pour ${fetchYear}.`
          : `Toutes les periodes ${fetchYear} sont deja presentes.`,
      });
    } catch {
      setFetchMsg({ type: 'error', text: 'Impossible de recuperer les vacances. Verifiez votre connexion.' });
    }
    setFetching(false);
  }

  if (!vacations || !closedDays) {
    return <div className="animate-pulse h-96 bg-slate-100 rounded-xl" />;
  }

  async function handleAddVacation(e: React.FormEvent) {
    e.preventDefault();
    setVacationError(null);
    if (!newVacation.name || !newVacation.startDate || !newVacation.endDate) return;
    if (newVacation.startDate > newVacation.endDate) {
      setVacationError('La date de debut doit etre anterieure ou egale a la date de fin.');
      return;
    }
    await addVacation(newVacation as Omit<VacationPeriod, 'id'>);
    setVacations(await getVacations());
    setNewVacation({ name: '', startDate: '', endDate: '', type: 'other', zone: 'all' });
  }

  async function handleDeleteVacation(id: number) {
    await deleteVacation(id);
    setVacations(await getVacations());
  }

  async function handleAddClosedDay(e: React.FormEvent) {
    e.preventDefault();
    if (!newClosedDay.date) return;
    await addClosedDay(newClosedDay as Omit<ClosedDay, 'id'>);
    setClosedDays(await getClosedDays());
    setNewClosedDay({ date: '', reason: '' });
  }

  async function handleDeleteClosedDay(id: number) {
    await deleteClosedDay(id);
    setClosedDays(await getClosedDays());
  }

  async function handleResetAllScores() {
    await resetAllScores();
    setShowResetDialog(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Parametres</h2>
        <p className="text-sm text-slate-500 mt-1">
          Vacances scolaires et jours de fermeture
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-teal-600" />
          Periodes de Vacances Scolaires
        </h3>

        <div className="flex flex-wrap items-end gap-3 mb-5 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Recuperer automatiquement
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={2020}
                max={2035}
                value={fetchYear}
                onChange={e => setFetchYear(parseInt(e.target.value) || new Date().getFullYear())}
                className="w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                onClick={handleFetchHolidays}
                disabled={fetching}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {fetching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {fetching ? 'Chargement...' : 'Importer les vacances'}
              </button>
            </div>
          </div>
          {fetchMsg && (
            <p className={`text-xs font-medium ${fetchMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {fetchMsg.text}
            </p>
          )}
        </div>

        <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
          {vacations.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">Aucune periode configuree</p>
          )}
          {vacations.map(v => (
            <div
              key={v.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{v.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {v.startDate} → {v.endDate} | Zone: {v.zone} | Type: {v.type}
                </p>
              </div>
              <button
                onClick={() => handleDeleteVacation(v.id!)}
                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            </div>
          ))}
        </div>
        <form
          onSubmit={handleAddVacation}
          className="grid grid-cols-2 md:grid-cols-7 gap-3 pt-4 border-t border-slate-100"
        >
          <input
            type="text"
            placeholder="Nom de la periode"
            value={newVacation.name}
            onChange={e => setNewVacation({ ...newVacation, name: e.target.value })}
            className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="date"
            value={newVacation.startDate}
            onChange={e => setNewVacation({ ...newVacation, startDate: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="date"
            value={newVacation.endDate}
            onChange={e => setNewVacation({ ...newVacation, endDate: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={newVacation.type}
            onChange={e => setNewVacation({ ...newVacation, type: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="noel">Noel</option>
            <option value="hiver">Hiver</option>
            <option value="printemps">Printemps</option>
            <option value="toussaint">Toussaint</option>
            <option value="ete">Ete</option>
            <option value="other">Autre</option>
          </select>
          <select
            value={newVacation.zone}
            onChange={e => setNewVacation({ ...newVacation, zone: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Toutes zones</option>
            <option value="A">Zone A</option>
            <option value="B">Zone B</option>
            <option value="C">Zone C</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter
          </button>
        </form>
        {vacationError && (
          <p className="mt-2 text-xs font-medium text-red-600">{vacationError}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-600" />
          Jours de Fermeture du Musee
        </h3>
        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
          {closedDays.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">
              Aucun jour de fermeture configure
            </p>
          )}
          {closedDays.map(d => (
            <div
              key={d.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 group"
            >
              <span className="text-sm text-slate-700">
                {d.date} — {d.reason || 'Fermeture'}
              </span>
              <button
                onClick={() => handleDeleteClosedDay(d.id!)}
                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            </div>
          ))}
        </div>
        <form
          onSubmit={handleAddClosedDay}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-slate-100"
        >
          <input
            type="date"
            value={newClosedDay.date}
            onChange={e => setNewClosedDay({ ...newClosedDay, date: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Raison (optionnel)"
            value={newClosedDay.reason}
            onChange={e => setNewClosedDay({ ...newClosedDay, reason: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-red-200/60 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Reinitialiser tous les scores globaux</p>
              <p className="text-xs text-slate-500">
                Remet a zero les scores cumules de tous les cadres. A utiliser uniquement en debut de cycle pluriannuel.
              </p>
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

      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowResetDialog(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-7 h-7 text-red-600" />
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
