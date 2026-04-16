import type { VacationPeriod } from '../types';

interface ApiRecord {
  description: string;
  start_date: string;
  end_date: string;
  zones: string;
}

const DESCRIPTION_TO_TYPE: Record<string, string> = {
  "Vacances de Noël": 'noel',
  "Vacances d'Hiver": 'hiver',
  "Vacances de Printemps": 'printemps',
  "Vacances de la Toussaint": 'toussaint',
  "Vacances d'Été": 'ete',
  "Début des Vacances d'Été": 'ete',
};

function formatDate(isoStr: string): string {
  // The API (data.education.gouv.fr) returns dates as UTC timestamps representing
  // midnight Paris time. Because Paris is UTC+1 (winter) or UTC+2 (summer),
  // the UTC value is actually the evening of the day before (e.g. "2026-02-13T23:00:00Z"
  // for a holiday starting on Feb 14 in Paris). Adding 1 day converts the UTC date
  // back to the correct local calendar date.
  const d = new Date(isoStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export async function fetchSchoolHolidays(schoolYear: string): Promise<VacationPeriod[]> {
  // Only fetch Zone A records to avoid ambiguity with other zones.
  // group_by deduplicates records that share the same dates (multiple academies within zone A).
  const where = `annee_scolaire="${schoolYear}" AND zones="Zone A"`;
  const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?limit=100&where=${encodeURIComponent(where)}&select=description,start_date,end_date,zones&group_by=description,start_date,end_date,zones`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erreur API: ${response.status}`);

  const data = await response.json();
  const records: ApiRecord[] = data.results || [];

  const skipDescriptions = ["Pont de l'Ascension", "Début des Vacances d'Été"];

  return records
    .filter(r => !skipDescriptions.includes(r.description))
    .map(r => ({
      name: `${r.description} ${schoolYear}`,
      type: DESCRIPTION_TO_TYPE[r.description] || 'other',
      zone: 'A',
      startDate: formatDate(r.start_date),
      endDate: formatDate(r.end_date),
    }));
}

export function getSchoolYearsForYear(year: number): string[] {
  return [`${year - 1}-${year}`, `${year}-${year + 1}`];
}
