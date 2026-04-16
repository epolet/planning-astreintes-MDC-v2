// Central mapping between SQLite snake_case rows and camelCase app objects.
// All server routes import from here — one place to update if the schema changes.

export function cadreToApp(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.nom,
    prenom: (row.prenom as string) ?? '',
    role: (row.role as string).toLowerCase(),
    nearMuseum: row.distance_moins_30min === 1,
    astreinteD1: (row.astreinte_d1 as number) ?? 0,
    astreinteD2: (row.astreinte_d2 as number) ?? 0,
    astreinteD3: (row.astreinte_d3 as number) ?? 0,
    astreinteD4: (row.astreinte_d4 as number) ?? 0,
    astreinteD5: (row.astreinte_d5 as number) ?? 0,
    permanenceD1: (row.permanence_d1 as number) ?? 0,
    permanenceD2: (row.permanence_d2 as number) ?? 0,
    permanenceD3: (row.permanence_d3 as number) ?? 0,
    permanenceD4: (row.permanence_d4 as number) ?? 0,
    permanenceD5: (row.permanence_d5 as number) ?? 0,
    active: row.actif === 1,
  };
}

export const cadreRoleToDb: Record<string, string> = {
  astreinte: 'Astreinte',
  permanence: 'Permanence',
  both: 'Both',
};

// Expects a row from: SELECT s.*, c.nom AS cadre_nom FROM slots s LEFT JOIN cadres c ON ...
export function slotToApp(row: Record<string, unknown>) {
  return {
    id: row.id,
    date: row.date,
    type: (row.type as string).toLowerCase(),
    difficulty: row.difficulte,
    cadreId: row.cadre_id ?? null,
    cadreName: (row.cadre_nom as string) ?? '',
    status: row.statut === 'manuel' ? 'manual' : 'auto',
    label: (row.label as string) ?? '',
    periodId: row.period_id ?? null,
  };
}

export function slotTypeToDb(type: string): string {
  return type === 'astreinte' ? 'Astreinte' : 'Permanence';
}

export function slotStatusToDb(status: string): string {
  return status === 'manual' ? 'manuel' : 'automatise';
}

export function periodToApp(row: Record<string, unknown>) {
  return {
    id: row.id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    zone: row.zone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function periodScoreToApp(row: Record<string, unknown>) {
  return {
    id: row.id,
    cadreId: row.cadre_id,
    periodId: row.period_id,
    astreinteD1: (row.astreinte_d1 as number) ?? 0,
    astreinteD2: (row.astreinte_d2 as number) ?? 0,
    astreinteD3: (row.astreinte_d3 as number) ?? 0,
    astreinteD4: (row.astreinte_d4 as number) ?? 0,
    astreinteD5: (row.astreinte_d5 as number) ?? 0,
    permanenceD1: (row.permanence_d1 as number) ?? 0,
    permanenceD2: (row.permanence_d2 as number) ?? 0,
    permanenceD3: (row.permanence_d3 as number) ?? 0,
    permanenceD4: (row.permanence_d4 as number) ?? 0,
    permanenceD5: (row.permanence_d5 as number) ?? 0,
  };
}

export function vacationToApp(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    zone: row.zone,
    type: row.type,
  };
}

export function closedDayToApp(row: Record<string, unknown>) {
  return {
    id: row.id,
    date: row.date,
    reason: row.reason,
  };
}
