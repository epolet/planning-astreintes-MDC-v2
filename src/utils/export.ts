import * as XLSX from 'xlsx-js-style';
import { getISOWeek } from 'date-fns';
import type { Slot, Cadre, DifficultyLevel } from '../types';
import { DIFFICULTY_LABELS, fullName, totalAstreintes, totalPermanences } from '../types';
import { getAllPeriodScores, type PerPeriodScore } from '../db/periods';
import { getWishesByPeriod } from '../db/wishes';
import { getCadres } from '../db/cadres';

/** Returns the calendar year a period belongs to, using its midpoint date.
 * Robust against semesters that start in late Dec (H1) or end in early Jan (H2). */
function periodYear(ps: PerPeriodScore): string {
  const mid = new Date((new Date(ps.startDate).getTime() + new Date(ps.endDate).getTime()) / 2);
  return String(mid.getFullYear());
}

// ── Comparative-analysis helpers (mirrors EquityRecap logic) ───────────────
type RecoSpec = { key: keyof Cadre; label: string; slotType: 'Astreinte' | 'Permanence'; poolAll: boolean };

const RECO_SPECS: RecoSpec[] = [
  { key: 'astreinteD5',  label: '🎄 Noël',          slotType: 'Astreinte',  poolAll: true  },
  { key: 'astreinteD4',  label: 'D4 (Très diff.)',   slotType: 'Astreinte',  poolAll: false },
  { key: 'astreinteD3',  label: 'D3 (Difficile)',    slotType: 'Astreinte',  poolAll: false },
  { key: 'astreinteD2',  label: 'D2 (Assez diff.)',  slotType: 'Astreinte',  poolAll: false },
  { key: 'astreinteD1',  label: 'D1 (Peu diff.)',    slotType: 'Astreinte',  poolAll: false },
  { key: 'permanenceD5', label: '🎄 Noël',           slotType: 'Permanence', poolAll: true  },
  { key: 'permanenceD4', label: 'D4 (Très diff.)',   slotType: 'Permanence', poolAll: true  },
  { key: 'permanenceD3', label: 'D3 (Difficile)',    slotType: 'Permanence', poolAll: true  },
  { key: 'permanenceD2', label: 'D2 (Assez diff.)',  slotType: 'Permanence', poolAll: true  },
  { key: 'permanenceD1', label: 'D1 (Peu diff.)',    slotType: 'Permanence', poolAll: true  },
];

type RecoItem = { label: string; slotType: string; value: number; avg: number; delta: number; rank: number; poolSize: number };

function recoLevel(delta: number, value: number): 'priority' | 'suggest' | 'normal' | 'above' {
  if (delta <= -0.6) return 'priority';   // significantly behind pool average
  if (value === 0)   return 'suggest';    // not started yet (even if everyone is at 0)
  if (delta >=  0.6) return 'above';
  return 'normal';
}

/** Compute all reco items for a cadre using cumulative counters from the cadres table
 *  (astreinteD1…D5 / permanenceD1…D5 = all published periods + current draft). */
function computeRecoItems(cadre: Cadre, activeCadres: Cadre[]): RecoItem[] {
  const astreinteCadres = activeCadres.filter(c => c.role === 'astreinte' || c.role === 'both');

  const items: RecoItem[] = [];
  for (const spec of RECO_SPECS) {
    const pool = spec.poolAll ? activeCadres : astreinteCadres;
    if (!pool.some(c => c.id === cadre.id)) continue;

    const values = pool.map(c => (c[spec.key] as number) ?? 0).sort((a, b) => a - b);
    const avg = values.reduce((s, v) => s + v, 0) / (values.length || 1);
    const value = (cadre[spec.key] as number) ?? 0;
    const delta = value - avg;
    const rank = values.filter(v => v < value).length + 1;
    items.push({ label: `${spec.slotType} ${spec.label}`, slotType: spec.slotType, value, avg: +avg.toFixed(2), delta: +delta.toFixed(2), rank, poolSize: pool.length });
  }
  return items;
}

/** Build the recommendations section for one cadre's Excel sheet, organised in 3 groups. */
function buildRecoRows(cadre: Cadre, activeCadres: Cadre[]): Record<string, unknown>[] {
  const astreinteCadres = activeCadres.filter(c => c.role === 'astreinte' || c.role === 'both');
  const isInAstrPool = astreinteCadres.some(c => c.id === cadre.id);

  const blank = (): Record<string, unknown> => ({
    'Section': '', 'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '',
    'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
    'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
  });

  const rows: Record<string, unknown>[] = [];

  rows.push({ ...blank(), 'Section': '═══ ANALYSE COMPARATIVE — CUMUL TOUTES PÉRIODES ═══' });

  // Global summary
  const allAstTotals = astreinteCadres.map(c => totalAstreintes(c)).sort((a, b) => a - b);
  const allPermTotals = activeCadres.map(c => totalPermanences(c)).sort((a, b) => a - b);
  const myAst  = totalAstreintes(cadre);
  const myPerm = totalPermanences(cadre);
  const astAvg  = allAstTotals.reduce((s, v) => s + v, 0)  / (allAstTotals.length  || 1);
  const permAvg = allPermTotals.reduce((s, v) => s + v, 0) / (allPermTotals.length || 1);
  const astRank  = allAstTotals.filter(v => v < myAst).length + 1;
  const permRank = allPermTotals.filter(v => v < myPerm).length + 1;

  if (isInAstrPool) {
    rows.push({
      ...blank(),
      'Section': `Astreintes total cumulé : ${myAst}`,
      'Période': `Rang ${astRank} / ${astreinteCadres.length}`,
      'Astr. Noël': `écart ${myAst - astAvg >= 0 ? '+' : ''}${(myAst - astAvg).toFixed(1)} vs moy.`,
    });
  }
  rows.push({
    ...blank(),
    'Section': `Permanences total cumulé : ${myPerm}`,
    'Période': `Rang ${permRank} / ${activeCadres.length}`,
    'Astr. Noël': `écart ${myPerm - permAvg >= 0 ? '+' : ''}${(myPerm - permAvg).toFixed(1)} vs moy.`,
  });

  // Column header
  rows.push({
    ...blank(),
    'Section': 'Catégorie',
    'Période': 'Type',
    'Astr. Noël': 'Valeur (cumul)',
    'Astr. D4': 'Moy. pool',
    'Astr. D3': 'Écart',
    'Astr. D2': 'Rang',
  });

  // 4 groups
  const allItems = computeRecoItems(cadre, activeCadres);
  const groups: { key: 'priority' | 'suggest' | 'normal' | 'above'; title: string }[] = [
    { key: 'priority', title: '✅ À PRIORISER (en dessous de la moyenne)' },
    { key: 'suggest',  title: '🔵 À DÉMARRER — aucun créneau pris dans cette catégorie' },
    { key: 'normal',   title: '— DANS LA MOYENNE' },
    { key: 'above',    title: '⚠️ AU-DESSUS DE LA MOYENNE' },
  ];

  for (const group of groups) {
    const items = allItems.filter(i => recoLevel(i.delta, i.value) === group.key);
    rows.push({ ...blank(), 'Section': group.title });
    if (items.length === 0) {
      rows.push({ ...blank(), 'Section': '  (aucun)' });
    } else {
      for (const item of items) {
        rows.push({
          ...blank(),
          'Section': `  ${item.label}`,
          'Période': item.slotType,
          'Astr. Noël': item.value,
          'Astr. D4': item.avg,
          'Astr. D3': item.delta,
          'Astr. D2': `${item.rank} / ${item.poolSize}`,
        });
      }
    }
  }

  rows.push({ ...blank(), 'Section': 'Seuil : écart > 0,6 par rapport à la moyenne du pool éligible · 🔵 À démarrer = valeur = 0 (aucun créneau pris dans cette catégorie)' });

  return rows;
}

// ── Styling helpers ────────────────────────────────────────────────────────────

/** Palette hex (sans #) alignée sur les couleurs Tailwind de l'appli */
const C = {
  purple50: 'F5F3FF', purple200: 'DDD6FE', purple500: '8B5CF6', purple700: '6D28D9',
  red50:    'FEF2F2', red500:    'EF4444', red600:    'DC2626',
  orange50: 'FFF7ED', orange400: 'FB923C', orange600: 'EA580C',
  amber50:  'FFFBEB', amber400:  'FBBF24', amber600:  'D97706',
  slate50:  'F8FAFC', slate100:  'F1F5F9', slate200:  'E2E8F0',
  slate300: 'CBD5E1', slate400:  '94A3B8', slate500:  '64748B', slate600:  '475569', slate900: '0F172A',
  blue50:   'EFF6FF', blue100:   'DBEAFE', blue200:   'BFDBFE', blue700:   '1D4ED8', blue800: '1E40AF',
  teal50:   'F0FDFA', teal100:   'CCFBF1', teal200:   '99F6E4', teal700:   '0F766E', teal800: '115E59',
  white: 'FFFFFF',
};

type XFill  = { patternType: 'solid'; fgColor: { rgb: string } };
type XFont  = { bold?: boolean; italic?: boolean; color?: { rgb: string }; sz?: number };
type XAlign = { horizontal?: 'left' | 'center' | 'right'; vertical?: 'top' | 'center' | 'bottom' };
type XBorder = { style: string; color: { rgb: string } };
type XStyle = { fill?: XFill; font?: XFont; alignment?: XAlign; border?: { top?: XBorder; bottom?: XBorder; left?: XBorder; right?: XBorder } };
type SCell  = { v: string | number; t: 's' | 'n'; s: XStyle };

function fill(rgb: string): XFill { return { patternType: 'solid', fgColor: { rgb } }; }
function border(rgb = C.slate200): { top: XBorder; bottom: XBorder; left: XBorder; right: XBorder } {
  const b = { style: 'thin', color: { rgb } };
  return { top: b, bottom: b, left: b, right: b };
}
function sc(v: string | number, s: XStyle): SCell { return { v, t: typeof v === 'number' ? 'n' : 's', s }; }

/** Définition d'une colonne de difficulté (astreinte ou permanence) */
type DiffCol = { label: string; hdrBg: string; hdrText: string; cellBg: string; cellText: string; key: keyof Cadre };

const AST_DIFF_COLS: DiffCol[] = [
  { label: '🎄 Noël', hdrBg: C.purple500, hdrText: C.white,  cellBg: C.purple50, cellText: C.purple700, key: 'astreinteD5' },
  { label: 'D4',      hdrBg: C.red500,    hdrText: C.white,  cellBg: C.red50,    cellText: C.red600,    key: 'astreinteD4' },
  { label: 'D3',      hdrBg: C.orange400, hdrText: C.white,  cellBg: C.orange50, cellText: C.orange600, key: 'astreinteD3' },
  { label: 'D2',      hdrBg: C.amber400,  hdrText: C.white,  cellBg: C.amber50,  cellText: C.amber600,  key: 'astreinteD2' },
  { label: 'D1',      hdrBg: C.slate400,  hdrText: C.white,  cellBg: C.slate50,  cellText: C.slate600,  key: 'astreinteD1' },
];
const PERM_DIFF_COLS: DiffCol[] = [
  { label: '🎄 Noël', hdrBg: C.purple500, hdrText: C.white,  cellBg: C.purple50, cellText: C.purple700, key: 'permanenceD5' },
  { label: 'D4',      hdrBg: C.red500,    hdrText: C.white,  cellBg: C.red50,    cellText: C.red600,    key: 'permanenceD4' },
  { label: 'D3',      hdrBg: C.orange400, hdrText: C.white,  cellBg: C.orange50, cellText: C.orange600, key: 'permanenceD3' },
  { label: 'D2',      hdrBg: C.amber400,  hdrText: C.white,  cellBg: C.amber50,  cellText: C.amber600,  key: 'permanenceD2' },
  { label: 'D1',      hdrBg: C.slate400,  hdrText: C.white,  cellBg: C.slate50,  cellText: C.slate600,  key: 'permanenceD1' },
];

/** Construit la feuille "Récap Équité" avec mise en forme couleur */
function buildEquitySheet(rawCadres: Cadre[]): XLSX.WorkSheet {
  const activeCadres       = rawCadres.filter(c => c.active);
  const astreinteCadres    = activeCadres.filter(c => c.role === 'astreinte' || c.role === 'both');
  const permOnlyCadres     = activeCadres.filter(c => c.role === 'permanence');

  const wScore = (c: Cadre, prefix: 'astreinte' | 'permanence') =>
    [1,2,3,4,5].reduce((s, d) => s + ((c[`${prefix}D${d}` as keyof Cadre] as number) ?? 0) * d, 0);

  const sortedAst = [...astreinteCadres].sort(
    (a, b) => totalAstreintes(b) - totalAstreintes(a) || wScore(b, 'astreinte') - wScore(a, 'astreinte'));
  const sortedNoelOnly = [...permOnlyCadres].sort((a, b) => b.astreinteD5 - a.astreinteD5);
  const sortedPerm = [...activeCadres].sort(
    (a, b) => totalPermanences(b) - totalPermanences(a) || wScore(b, 'permanence') - wScore(a, 'permanence'));

  const aoa: (SCell | string)[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  let r = 0;

  const NCOLS = 7; // Cadre + 5 diff + Total

  const titleStyle: XStyle = { fill: fill(C.slate900), font: { bold: true, color: { rgb: C.white }, sz: 13 }, alignment: { horizontal: 'center' } };
  const emptyRow = () => Array(NCOLS).fill(sc('', {}));

  function sectionHeader(label: string, bg: string, textColor: string, borderColor: string): SCell[] {
    const s: XStyle = { fill: fill(bg), font: { bold: true, color: { rgb: textColor }, sz: 11 }, alignment: { horizontal: 'center' }, border: border(borderColor) };
    return [sc(label, s), ...Array(NCOLS - 1).fill(sc('', s))];
  }

  function subHeaders(cols: DiffCol[], totalBg: string, totalText: string): SCell[] {
    return [
      sc('Cadre', { fill: fill(C.slate100), font: { bold: true, color: { rgb: C.slate500 } }, border: border() }),
      ...cols.map(col => sc(col.label, { fill: fill(col.hdrBg), font: { bold: true, color: { rgb: col.hdrText } }, alignment: { horizontal: 'center' }, border: border() })),
      sc('Total', { fill: fill(totalBg), font: { bold: true, color: { rgb: totalText } }, alignment: { horizontal: 'center' }, border: border(totalBg) }),
    ];
  }

  function dataRow(cadre: Cadre, cols: DiffCol[], totalVal: number, totalBg: string, totalText: string, rowIdx: number): SCell[] {
    const rowBg = rowIdx % 2 === 0 ? C.white : C.slate50;
    return [
      sc(cadre.name, { fill: fill(rowBg), font: { color: { rgb: C.slate900 } }, border: border() }),
      ...cols.map(col => {
        const val = (cadre[col.key] as number) ?? 0;
        return sc(val, { fill: fill(col.cellBg), font: val > 0 ? { bold: true, color: { rgb: col.cellText } } : { color: { rgb: C.slate300 } }, alignment: { horizontal: 'center' }, border: border() });
      }),
      sc(totalVal, { fill: fill(totalBg), font: { bold: true, color: { rgb: totalText } }, alignment: { horizontal: 'center' }, border: border(totalBg) }),
    ];
  }

  // Title
  aoa.push([sc('RÉCAPITULATIF ÉQUITÉ — Compteurs cumulatifs (toutes périodes publiées + brouillon en cours)', titleStyle), ...Array(NCOLS - 1).fill(sc('', titleStyle))]);
  merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } }); r++;
  aoa.push(emptyRow()); r++;

  // ── Astreintes ──────────────────────────────────────────────────────────────
  aoa.push(sectionHeader('📅 ASTREINTES (semaines)', C.blue50, C.blue700, C.blue200));
  merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } }); r++;
  aoa.push(subHeaders(AST_DIFF_COLS, C.blue100, C.blue800)); r++;

  sortedAst.forEach((cadre, i) => { aoa.push(dataRow(cadre, AST_DIFF_COLS, totalAstreintes(cadre), C.blue100, C.blue800, i)); r++; });

  if (sortedNoelOnly.length > 0) {
    const noelHdrStyle: XStyle = { fill: fill(C.purple50), font: { bold: true, color: { rgb: C.purple700 } }, border: border(C.purple200) };
    aoa.push([sc('🎄 Noël uniquement — hors pool astreinte classique', noelHdrStyle), ...Array(NCOLS - 1).fill(sc('', noelHdrStyle))]);
    merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } }); r++;
    sortedNoelOnly.forEach(cadre => {
      aoa.push([
        sc(cadre.name, { fill: fill(C.purple50), font: { italic: true, color: { rgb: C.slate600 } }, border: border() }),
        sc(cadre.astreinteD5, { fill: fill(C.purple50), font: cadre.astreinteD5 > 0 ? { bold: true, color: { rgb: C.purple700 } } : { color: { rgb: C.slate300 } }, alignment: { horizontal: 'center' }, border: border() }),
        ...Array(4).fill(sc('—', { fill: fill(C.white), font: { color: { rgb: C.slate300 } }, alignment: { horizontal: 'center' }, border: border() })),
        sc(cadre.astreinteD5, { fill: fill(C.purple50), font: { bold: true, color: { rgb: C.purple700 } }, alignment: { horizontal: 'center' }, border: border() }),
      ]); r++;
    });
  }

  aoa.push(emptyRow()); r++;

  // ── Permanences ─────────────────────────────────────────────────────────────
  aoa.push(sectionHeader('🗓 PERMANENCES (jours)', C.teal50, C.teal700, C.teal200));
  merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } }); r++;
  aoa.push(subHeaders(PERM_DIFF_COLS, C.teal100, C.teal800)); r++;

  sortedPerm.forEach((cadre, i) => { aoa.push(dataRow(cadre, PERM_DIFF_COLS, totalPermanences(cadre), C.teal100, C.teal800, i)); r++; });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ width: 22 }, { width: 10 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }];
  ws['!merges'] = merges;
  return ws;
}

// ── Per-column diff color schema (index = col offset from 2 in cadre sheets) ──
const DIFF_COL = [
  { bg: C.purple50, text: C.purple700, hdrBg: C.purple500 }, // D5 / Noël
  { bg: C.red50,    text: C.red600,    hdrBg: C.red500    }, // D4
  { bg: C.orange50, text: C.orange600, hdrBg: C.orange400 }, // D3
  { bg: C.amber50,  text: C.amber600,  hdrBg: C.amber400  }, // D2
  { bg: C.slate50,  text: C.slate600,  hdrBg: C.slate400  }, // D1
  { bg: C.blue100,  text: C.blue800,   hdrBg: C.blue700   }, // Astr Total
  { bg: C.purple50, text: C.purple700, hdrBg: C.purple500 }, // D5 (perm)
  { bg: C.red50,    text: C.red600,    hdrBg: C.red500    }, // D4
  { bg: C.orange50, text: C.orange600, hdrBg: C.orange400 }, // D3
  { bg: C.amber50,  text: C.amber600,  hdrBg: C.amber400  }, // D2
  { bg: C.slate50,  text: C.slate600,  hdrBg: C.slate400  }, // D1
  { bg: C.teal100,  text: C.teal800,   hdrBg: C.teal700   }, // Perm Total
];

/** Applique la mise en forme complète aux feuilles individuelles par cadre */
function styleCadreSheet(ws: XLSX.WorkSheet): void {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);

  const getVal = (r: number, c: number): string => String(ws[XLSX.utils.encode_cell({ r, c })]?.v ?? '');
  const set = (r: number, c: number, s: XStyle) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!ws[ref]) ws[ref] = { v: '', t: 's' };
    ws[ref].s = s;
  };
  const setRow = (r: number, s: XStyle, ncols = 14) => { for (let c = 0; c < ncols; c++) set(r, c, s); };

  const colHdrStyle = (i: number): XStyle => {
    const dc = DIFF_COL[i - 2];
    return {
      fill: fill(dc ? dc.hdrBg : C.slate100),
      font: { bold: true, color: { rgb: dc ? C.white : C.slate500 }, sz: 10 },
      alignment: { horizontal: i > 1 ? 'center' : 'left', vertical: 'center' },
      border: border(),
    };
  };

  type Sect = 'HISTORY' | 'ANALYSIS' | 'SLOTS';
  let sect: Sect = 'HISTORY';

  for (let r = 0; r <= range.e.r; r++) {
    const col0 = getVal(r, 0);

    // ── json_to_sheet header row (column keys) ────────────────────────────
    if (r === 0) {
      for (let c = 0; c <= Math.min(range.e.c, 13); c++) set(r, c, colHdrStyle(c));
      continue;
    }

    // ── Section tracker ────────────────────────────────────────────────────
    if (col0.includes('HISTORIQUE'))           sect = 'HISTORY';
    else if (col0.includes('ANALYSE'))         sect = 'ANALYSIS';
    else if (col0.includes('CRÉNEAUX'))        sect = 'SLOTS';

    // ── Big section header (═══) ──────────────────────────────────────────
    if (col0.includes('═══')) {
      setRow(r, { fill: fill(C.slate900), font: { bold: true, color: { rgb: C.white }, sz: 11 }, alignment: { horizontal: 'left' } });
      continue;
    }

    // ── Blank row ─────────────────────────────────────────────────────────
    if (!col0) { setRow(r, { fill: fill(C.white) }); continue; }

    // ═══════════════════ HISTORY SECTION ═════════════════════════════════
    if (sect === 'HISTORY') {
      if (col0 === 'Période') {
        for (let c = 0; c <= 13; c++) set(r, c, colHdrStyle(c));
        continue;
      }
      if (col0 === 'TOTAL CUMULÉ') {
        for (let c = 0; c <= 13; c++) {
          const dc = DIFF_COL[c - 2];
          set(r, c, {
            fill: fill(dc ? dc.bg : C.slate200),
            font: { bold: true, color: { rgb: dc ? dc.text : C.slate900 } },
            alignment: { horizontal: c > 0 ? 'center' : 'left', vertical: 'center' },
            border: border(C.slate400),
          });
        }
        continue;
      }
      if (col0.startsWith('──')) {
        for (let c = 0; c <= 13; c++) {
          const dc = DIFF_COL[c - 2];
          set(r, c, {
            fill: fill(dc ? dc.bg : C.slate100),
            font: { bold: true, italic: true, color: { rgb: dc ? dc.text : C.slate600 } },
            alignment: { horizontal: c > 0 ? 'center' : 'left', vertical: 'center' },
            border: border(C.slate300),
          });
        }
        continue;
      }
      // Regular period data row
      const isDraft = col0.includes('(en cours)');
      for (let c = 0; c <= 13; c++) {
        const dc = DIFF_COL[c - 2];
        const val = ws[XLSX.utils.encode_cell({ r, c })]?.v;
        set(r, c, {
          fill: fill(isDraft ? C.amber50 : (dc ? dc.bg : C.white)),
          font: {
            color: { rgb: dc ? dc.text : C.slate900 },
            bold: c > 1 && typeof val === 'number' && val > 0,
          },
          alignment: { horizontal: c > 1 ? 'center' : 'left', vertical: 'center' },
          border: border(),
        });
      }
      continue;
    }

    // ═══════════════════ ANALYSIS SECTION ════════════════════════════════
    if (sect === 'ANALYSIS') {
      if (col0.startsWith('Astreintes total') || col0.startsWith('Permanences total')) {
        const isAst = col0.startsWith('Astreintes');
        setRow(r, { fill: fill(isAst ? C.blue50 : C.teal50), font: { bold: true, color: { rgb: isAst ? C.blue700 : C.teal700 } }, border: border() });
        continue;
      }
      if (col0 === 'Catégorie') {
        setRow(r, { fill: fill(C.slate100), font: { bold: true, color: { rgb: C.slate500 } }, border: border() });
        continue;
      }
      if (col0.startsWith('✅')) {
        setRow(r, { fill: fill('F0FDF4'), font: { bold: true, color: { rgb: '15803D' } } }); continue;
      }
      if (col0.startsWith('🔵')) {
        setRow(r, { fill: fill(C.blue50), font: { bold: true, color: { rgb: C.blue700 } } }); continue;
      }
      if (col0.startsWith('⚠️')) {
        setRow(r, { fill: fill(C.red50), font: { bold: true, color: { rgb: 'B91C1C' } } }); continue;
      }
      if (col0.startsWith('—')) {
        setRow(r, { fill: fill(C.slate50), font: { bold: true, color: { rgb: C.slate600 } } }); continue;
      }
      // Indented reco items / notes / (aucun)
      setRow(r, { fill: fill(C.white), font: { color: { rgb: C.slate600 } }, border: border() });
      continue;
    }

    // ═══════════════════ SLOTS SECTION ═══════════════════════════════════
    if (sect === 'SLOTS') {
      if (col0.startsWith('-- ')) {
        const isAst = col0.includes('ASTREINTE');
        setRow(r, {
          fill: fill(isAst ? C.blue50 : C.teal50),
          font: { bold: true, color: { rgb: isAst ? C.blue700 : C.teal700 } },
          border: border(isAst ? C.blue200 : C.teal200),
        });
        continue;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(col0)) {
        const diff = (ws[XLSX.utils.encode_cell({ r, c: 2 })]?.v as number) ?? 1;
        const dc = DIFF_COL[5 - diff]; // diff5→idx0(purple)…diff1→idx4(slate)
        set(r, 0, { fill: fill(dc.bg), font: { bold: true, color: { rgb: dc.text } }, border: border() });
        set(r, 1, { fill: fill(dc.bg), font: { color: { rgb: dc.text } }, border: border() });
        set(r, 2, { fill: fill(dc.bg), font: { bold: true, color: { rgb: dc.text } }, alignment: { horizontal: 'center' }, border: border() });
        set(r, 3, { fill: fill(C.white), font: { color: { rgb: C.slate600 } }, border: border() });
        for (let c = 4; c <= 13; c++) set(r, c, { fill: fill(C.white), border: border() });
        continue;
      }
      setRow(r, { fill: fill(C.white), font: { color: { rgb: C.slate900 } } });
    }
  }
}

/** Applique une mise en forme colorée aux feuilles tabulaires simples (json_to_sheet).
 *  colRules : pour chaque colonne (par index), règle de style sur la valeur de la cellule. */
function styleSimpleSheet(
  ws: XLSX.WorkSheet,
  colRules: ((val: unknown, rowBg: string) => XStyle)[],
  opts: { headerBg?: string; headerText?: string; altRow?: boolean } = {}
): void {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const { headerBg = C.slate900, headerText = C.white, altRow = true } = opts;

  for (let r = range.s.r; r <= range.e.r; r++) {
    const isHeader = r === 0;
    const rowBg = altRow && !isHeader ? ((r % 2 === 0) ? C.white : C.slate50) : C.white;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { v: '', t: 's' };

      if (isHeader) {
        ws[ref].s = {
          fill: fill(headerBg),
          font: { bold: true, color: { rgb: headerText } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: border(headerBg),
        };
        continue;
      }

      const rule = colRules[c];
      ws[ref].s = rule ? rule(ws[ref].v, rowBg) : { fill: fill(rowBg), border: border() };
    }
  }
}

/** Règle standard : fond alterné + bordure, texte slate */
const ruleDefault = (_: unknown, rowBg: string): XStyle =>
  ({ fill: fill(rowBg), font: { color: { rgb: C.slate900 } }, border: border() });

/** Règle : colorie selon le type Astreinte/Permanence */
const ruleType = (val: unknown, rowBg: string): XStyle => {
  if (val === 'Astreinte') return { fill: fill(C.blue50), font: { bold: true, color: { rgb: C.blue700 } }, alignment: { horizontal: 'center' }, border: border(C.blue200) };
  if (val === 'Permanence') return { fill: fill(C.teal50), font: { bold: true, color: { rgb: C.teal700 } }, alignment: { horizontal: 'center' }, border: border(C.teal200) };
  return ruleDefault(val, rowBg);
};

/** Règle : colorie selon le label de difficulté */
const ruleDiff = (val: unknown, rowBg: string): XStyle => {
  const dc =
    String(val).includes('Noël') || String(val).includes('D5') ? DIFF_COL[0] :
    String(val).includes('D4')   ? DIFF_COL[1] :
    String(val).includes('D3')   ? DIFF_COL[2] :
    String(val).includes('D2')   ? DIFF_COL[3] :
    String(val).includes('D1')   ? DIFF_COL[4] : null;
  if (!dc) return ruleDefault(val, rowBg);
  return { fill: fill(dc.bg), font: { bold: true, color: { rgb: dc.text } }, alignment: { horizontal: 'center' }, border: border() };
};

/** Règle : met en évidence si valeur > 0 */
const ruleHighlightPos = (val: unknown, rowBg: string): XStyle => {
  if (typeof val === 'number' && val > 0)
    return { fill: fill(C.blue50), font: { bold: true, color: { rgb: C.blue700 } }, alignment: { horizontal: 'center' }, border: border() };
  return { fill: fill(rowBg), font: { color: { rgb: C.slate400 } }, alignment: { horizontal: 'center' }, border: border() };
};

/** Règle : total Astreintes (bleu) */
const ruleTotalAst = (_: unknown, __: string): XStyle =>
  ({ fill: fill(C.blue100), font: { bold: true, color: { rgb: C.blue800 } }, alignment: { horizontal: 'center' }, border: border(C.blue200) });

/** Règle : total Permanences (teal) */
const ruleTotalPerm = (_: unknown, __: string): XStyle =>
  ({ fill: fill(C.teal100), font: { bold: true, color: { rgb: C.teal800 } }, alignment: { horizontal: 'center' }, border: border(C.teal200) });

/** Règle : colorie les cellules numériques par difficulté (pour stats d'équité) */
const ruleDiffNum = (colIdx: number) => (val: unknown, rowBg: string): XStyle => {
  const dc = DIFF_COL[colIdx];
  if (!dc) return ruleDefault(val, rowBg);
  const isNonZero = typeof val === 'number' && val > 0;
  return {
    fill: fill(dc.bg),
    font: { bold: isNonZero, color: { rgb: isNonZero ? dc.text : C.slate300 } },
    alignment: { horizontal: 'center' },
    border: border(),
  };
};

/** Construit la feuille "Nb de vœux" : deux tableaux côte à côte (astreintes | permanences) */
function buildWishCountSheet(
  slots: Slot[],
  rawCadres: Cadre[],
  wishMap: Map<string, string[]>
): XLSX.WorkSheet {
  const activeCadres    = rawCadres.filter(c => c.active);
  const astreinteCadres = activeCadres.filter(c => c.role === 'astreinte' || c.role === 'both');

  const astreinteSlots   = slots.filter(s => s.type === 'astreinte');
  const permanenceSlots  = slots.filter(s => s.type === 'permanence');

  const countFor = (cadreId: string, slotList: Slot[]) =>
    slotList.filter(s => (wishMap.get(s.id!) ?? []).includes(cadreId)).length;

  // Sorted ascending (lowest wish count first)
  const astrRows = astreinteCadres
    .map(c => ({ cadre: c, count: countFor(c.id!, astreinteSlots) }))
    .sort((a, b) => a.count - b.count || a.cadre.name.localeCompare(b.cadre.name));

  const permRows = activeCadres
    .map(c => ({ cadre: c, count: countFor(c.id!, permanenceSlots) }))
    .sort((a, b) => a.count - b.count || a.cadre.name.localeCompare(b.cadre.name));

  const maxAstr = astrRows[astrRows.length - 1]?.count ?? 0;
  const maxPerm = permRows[permRows.length - 1]?.count ?? 0;

  const aoa: (SCell | string)[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];

  const empty = () => sc('', {});

  // ── Row 0: section titles ──────────────────────────────────────────────────
  const hdrAst:  XStyle = { fill: fill(C.blue700),  font: { bold: true, color: { rgb: C.white }, sz: 11 }, alignment: { horizontal: 'center', vertical: 'center' } };
  const hdrPerm: XStyle = { fill: fill(C.teal700),  font: { bold: true, color: { rgb: C.white }, sz: 11 }, alignment: { horizontal: 'center', vertical: 'center' } };

  aoa.push([
    sc(`📅 ASTREINTES (${astreinteSlots.length} créneaux)`, hdrAst), sc('', hdrAst),
    empty(),
    sc(`🗓 PERMANENCES (${permanenceSlots.length} créneaux)`, hdrPerm), sc('', hdrPerm),
  ]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } });
  merges.push({ s: { r: 0, c: 3 }, e: { r: 0, c: 4 } });

  // ── Row 1: column headers ──────────────────────────────────────────────────
  const colHdr = (align: 'left' | 'center' = 'left'): XStyle => ({
    fill: fill(C.slate100), font: { bold: true, color: { rgb: C.slate500 } },
    alignment: { horizontal: align }, border: border(),
  });
  aoa.push([
    sc('Cadre', colHdr()),          sc('Nb de vœux', colHdr('center')),
    empty(),
    sc('Cadre', colHdr()),          sc('Nb de vœux', colHdr('center')),
  ]);

  // ── Data rows ──────────────────────────────────────────────────────────────
  const maxLen = Math.max(astrRows.length, permRows.length);

  for (let i = 0; i < maxLen; i++) {
    const aItem = astrRows[i];
    const pItem = permRows[i];
    const rowBg = i % 2 === 0 ? C.white : C.slate50;

    const nameCell = (label: string): SCell =>
      sc(label, { fill: fill(rowBg), font: { color: { rgb: C.slate900 } }, border: border() });

    const numCell = (count: number, isAst: boolean): SCell => {
      if (count === 0) return sc(count, { fill: fill(rowBg), font: { color: { rgb: C.slate300 } }, alignment: { horizontal: 'center' }, border: border() });
      if (count === (isAst ? maxAstr : maxPerm) && count > 0)
        return sc(count, { fill: fill(isAst ? C.blue50 : C.teal50), font: { bold: true, color: { rgb: isAst ? C.blue700 : C.teal700 } }, alignment: { horizontal: 'center' }, border: border() });
      return sc(count, { fill: fill(rowBg), font: { color: { rgb: C.slate600 } }, alignment: { horizontal: 'center' }, border: border() });
    };

    aoa.push([
      aItem ? nameCell(fullName(aItem.cadre)) : sc('', { fill: fill(rowBg) }),
      aItem ? numCell(aItem.count, true)       : sc('', { fill: fill(rowBg) }),
      empty(),
      pItem ? nameCell(fullName(pItem.cadre))  : sc('', { fill: fill(rowBg) }),
      pItem ? numCell(pItem.count, false)       : sc('', { fill: fill(rowBg) }),
    ]);
  }

  // ── Total row ──────────────────────────────────────────────────────────────
  const totalAstCount  = astrRows.reduce((s, x) => s + x.count, 0);
  const totalPermCount = permRows.reduce((s, x) => s + x.count, 0);
  const totAst:  XStyle = { fill: fill(C.blue100),  font: { bold: true, color: { rgb: C.blue800  } }, alignment: { horizontal: 'center' }, border: border(C.blue200)  };
  const totPerm: XStyle = { fill: fill(C.teal100),  font: { bold: true, color: { rgb: C.teal800  } }, alignment: { horizontal: 'center' }, border: border(C.teal200)  };
  aoa.push([
    sc('Total', { ...totAst,  alignment: { horizontal: 'left' } }),
    sc(totalAstCount,  totAst),
    empty(),
    sc('Total', { ...totPerm, alignment: { horizontal: 'left' } }),
    sc(totalPermCount, totPerm),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']   = [{ width: 22 }, { width: 12 }, { width: 3 }, { width: 22 }, { width: 12 }];
  ws['!merges'] = merges;
  return ws;
}

export async function exportToExcel(slots: Slot[], cadres: Cadre[], periodId?: string) {
  const wb = XLSX.utils.book_new();

  // Fetch fresh cadres to guarantee clean IDs (the `cadres` param coming from
  // Dashboard merges PeriodScore counters via spread, which overwrites cadre.id).
  let rawCadres: Cadre[] = cadres;
  try { rawCadres = await getCadres(); } catch { /* fall back */ }

  // ── Sheet 1: Planning chronologique ──────────────────────────────────────────
  const planningData = slots
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({
      Date: s.date,
      Type: s.type === 'astreinte' ? 'Astreinte' : 'Permanence',
      'Difficulté': DIFFICULTY_LABELS[s.difficulty as DifficultyLevel],
      'Niveau': s.difficulty,
      'Assigné à': s.cadreName || 'Non assigné',
      Statut: s.status === 'auto' ? 'Automatique' : 'Manuel',
      'Détail': s.label,
    }));

  const ws1 = XLSX.utils.json_to_sheet(planningData);
  ws1['!cols'] = [
    { width: 12 }, { width: 14 }, { width: 18 }, { width: 8 },
    { width: 20 }, { width: 14 }, { width: 40 },
  ];
  const colRulesChron: ((val: unknown, rowBg: string) => XStyle)[] = [
    ruleDefault,   // 0: Date
    ruleType,      // 1: Type
    ruleDiff,      // 2: Difficulté (label)
    (val, rowBg) => {  // 3: Niveau (1-5)
      const n = typeof val === 'number' ? val : 0;
      const dc = n >= 1 && n <= 5 ? DIFF_COL[5 - n] : null;
      if (!dc) return ruleDefault(val, rowBg);
      return { fill: fill(dc.bg), font: { bold: true, color: { rgb: dc.text } }, alignment: { horizontal: 'center' }, border: border() };
    },
    ruleDefault,   // 4: Assigné à
    (val, rowBg) =>  // 5: Statut
      val === 'Manuel'
        ? { fill: fill(C.amber50), font: { bold: true, color: { rgb: C.amber600 } }, alignment: { horizontal: 'center' }, border: border(C.amber400) }
        : { fill: fill(rowBg), font: { color: { rgb: C.slate400 } }, alignment: { horizontal: 'center' }, border: border() },
    ruleDefault,   // 6: Détail
  ];
  styleSimpleSheet(ws1, colRulesChron);
  XLSX.utils.book_append_sheet(wb, ws1, 'Planning Chronologique');

  // ── Sheet 2: Planning condensé ────────────────────────────────────────────────
  // One row per astreinte week: Semaine | Du (lun.) | Au (dim.) | Astreinte |
  //   Perm. Samedi | Perm. Dimanche | Perm. Jour férié | Note
  {
    const fmtDate = (iso: string) => {
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    };

    // Helper: ISO monday of the week containing a given date string
    const mondayOf = (iso: string): string => {
      const d = new Date(iso + 'T12:00:00');
      const dow = d.getDay(); // 0=Sun … 6=Sat
      d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      return d.toISOString().slice(0, 10);
    };

    const aSlots = slots
      .filter(s => s.type === 'astreinte')
      .sort((a, b) => a.date.localeCompare(b.date));

    // Group permanence slots by their week's Monday
    const permByMonday = new Map<string, Slot[]>();
    for (const s of slots.filter(sl => sl.type === 'permanence')) {
      const mon = mondayOf(s.date);
      const arr = permByMonday.get(mon) ?? [];
      arr.push(s);
      permByMonday.set(mon, arr);
    }

    const condensedRows = aSlots.map((aSlot) => {
      // Sunday = Monday + 6 days
      const monDate = new Date(aSlot.date + 'T12:00:00');
      const sunDate = new Date(monDate);
      sunDate.setDate(sunDate.getDate() + 6);
      const sunIso = sunDate.toISOString().slice(0, 10);

      const weekPerms = permByMonday.get(aSlot.date) ?? [];

      const satSlot  = weekPerms.find(s => new Date(s.date + 'T12:00:00').getDay() === 6);
      const sunSlot  = weekPerms.find(s => new Date(s.date + 'T12:00:00').getDay() === 0);
      // Holiday = permanence on a weekday (Mon–Fri), may be several in a week
      const holSlots = weekPerms.filter(s => {
        const dow = new Date(s.date + 'T12:00:00').getDay();
        return dow !== 0 && dow !== 6;
      });

      // Build a readable note: extract holiday name from label "(Nom du Férié)"
      const holNote = holSlots.map(s => {
        const match = s.label.match(/\(([^)]+)\)/);
        return match ? `${fmtDate(s.date)} — ${match[1]}` : `${fmtDate(s.date)} — ${s.label}`;
      }).join(' ; ');

      // Multiple holiday permanences in one week (rare but possible — e.g. 8 mai + lundi Pentecôte)
      const holNames = holSlots.map(s => s.cadreName || '(non assigné)').join(' / ');

      return {
        'Semaine':               getISOWeek(monDate),
        'Du':                    fmtDate(aSlot.date),
        'Au':                    fmtDate(sunIso),
        'Astreinte':             aSlot.cadreName || '',
        'Permanence Samedi':     satSlot  ? (satSlot.cadreName  || '(non assigné)') : '',
        'Permanence Dimanche':   sunSlot  ? (sunSlot.cadreName  || '(non assigné)') : '',
        'Permanence Jour férié': holSlots.length > 0 ? holNames : '',
        'Note':                  holNote,
      };
    });

    if (condensedRows.length > 0) {
      const wsC = XLSX.utils.json_to_sheet(condensedRows);
      wsC['!cols'] = [
        { width: 10 }, { width: 13 }, { width: 13 }, { width: 20 },
        { width: 20 }, { width: 22 }, { width: 24 }, { width: 45 },
      ];
      const ruleAssigned = (isAst: boolean) => (val: unknown, rowBg: string): XStyle => {
        const isEmpty = !val || val === '' || val === '(non assigné)';
        if (isEmpty) return { fill: fill(rowBg), font: { italic: true, color: { rgb: C.slate400 } }, border: border() };
        return isAst
          ? { fill: fill(C.blue50), font: { bold: true, color: { rgb: C.blue700 } }, border: border(C.blue200) }
          : { fill: fill(C.teal50), font: { bold: true, color: { rgb: C.teal700 } }, border: border(C.teal200) };
      };
      const colRulesCond: ((val: unknown, rowBg: string) => XStyle)[] = [
        (_, rowBg) => ({ fill: fill(rowBg), font: { bold: true, color: { rgb: C.slate600 } }, alignment: { horizontal: 'center' }, border: border() }),
        ruleDefault,       // Du
        ruleDefault,       // Au
        ruleAssigned(true),  // Astreinte
        ruleAssigned(false), // Perm Samedi
        ruleAssigned(false), // Perm Dimanche
        ruleAssigned(false), // Perm Jour férié
        ruleDefault,       // Note
      ];
      styleSimpleSheet(wsC, colRulesCond);
      XLSX.utils.book_append_sheet(wb, wsC, 'Planning condensé');
    }
  }

  // ── Sheet 3: Statistiques d'équité ───────────────────────────────────────────
  // Use `cadres` (param) for counters since Dashboard enriches them with period scores,
  // but fall back to rawCadres if needed.
  const statsData = (cadres.length > 0 ? cadres : rawCadres)
    .filter(c => c.active)
    .map(c => ({
      Nom: c.name,
      'Rôle': c.role === 'astreinte' ? 'Astreinte' : c.role === 'permanence' ? 'Permanence' : 'Les deux',
      'Proximité < 30min': c.nearMuseum ? 'Oui' : 'Non',
      'Astr. Noël (D5)': c.astreinteD5,
      'Astr. D4 (Très diff.)': c.astreinteD4,
      'Astr. D3 (Difficile)': c.astreinteD3,
      'Astr. D2 (Assez diff.)': c.astreinteD2,
      'Astr. D1 (Peu diff.)': c.astreinteD1,
      'Astr. Total': totalAstreintes(c),
      'Perm. Noël (D5)': c.permanenceD5,
      'Perm. D4 (Très diff.)': c.permanenceD4,
      'Perm. D3 (Difficile)': c.permanenceD3,
      'Perm. D2 (Assez diff.)': c.permanenceD2,
      'Perm. D1 (Peu diff.)': c.permanenceD1,
      'Perm. Total': totalPermanences(c),
    }))
    .sort((a, b) => (b['Astr. Total'] + b['Perm. Total']) - (a['Astr. Total'] + a['Perm. Total']));

  const ws2 = XLSX.utils.json_to_sheet(statsData);
  ws2['!cols'] = [
    { width: 20 }, { width: 14 }, { width: 18 },
    { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 12 },
    { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 12 },
  ];
  const ruleRoleCell = (val: unknown, rowBg: string): XStyle => {
    if (val === 'Les deux') return { fill: fill(C.blue50), font: { bold: true, color: { rgb: C.blue700 } }, alignment: { horizontal: 'center' }, border: border(C.blue200) };
    return ruleType(val, rowBg);
  };
  const colRulesStats: ((val: unknown, rowBg: string) => XStyle)[] = [
    ruleDefault,      // 0: Nom
    ruleRoleCell,     // 1: Rôle
    ruleDefault,      // 2: Proximité
    ruleDiffNum(0),   // 3: Astr. Noël (D5)
    ruleDiffNum(1),   // 4: Astr. D4
    ruleDiffNum(2),   // 5: Astr. D3
    ruleDiffNum(3),   // 6: Astr. D2
    ruleDiffNum(4),   // 7: Astr. D1
    ruleTotalAst,     // 8: Astr. Total
    ruleDiffNum(6),   // 9:  Perm. Noël (D5)  — same palette as astr D5
    ruleDiffNum(7),   // 10: Perm. D4
    ruleDiffNum(8),   // 11: Perm. D3
    ruleDiffNum(9),   // 12: Perm. D2
    ruleDiffNum(10),  // 13: Perm. D1
    ruleTotalPerm,    // 14: Perm. Total
  ];
  styleSimpleSheet(ws2, colRulesStats, { headerBg: C.slate900, headerText: C.white });
  XLSX.utils.book_append_sheet(wb, ws2, "Statistiques d'Équité");

  // ── Sheet: Récap Équité (tableaux astreintes + permanences avec mise en forme) ─
  const wsEquity = buildEquitySheet(rawCadres);
  XLSX.utils.book_append_sheet(wb, wsEquity, 'Récap Équité');

  // ── Sheet 4: Vœux par créneau ────────────────────────────────────────────────
  if (periodId) {
    let wishMap: Map<string, string[]> = new Map();
    try {
      wishMap = await getWishesByPeriod(periodId);
    } catch {
      // non-blocking
    }

    const cadreById = new Map(rawCadres.map(c => [c.id!, fullName(c)]));

    const wishesData = slots
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(s => {
        const cadreIds = wishMap.get(s.id!) ?? [];
        const names = cadreIds.map(id => cadreById.get(id) ?? id).join(', ');
        return {
          'Date': s.date,
          'Type': s.type === 'astreinte' ? 'Astreinte' : 'Permanence',
          'Difficulté': DIFFICULTY_LABELS[s.difficulty as DifficultyLevel],
          'Détail': s.label,
          'Assigné à': s.cadreName || 'Non assigné',
          'Nb vœux': cadreIds.length,
          'Cadres volontaires': names || '—',
        };
      });

    if (wishesData.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(wishesData);
      ws3['!cols'] = [
        { width: 12 }, { width: 14 }, { width: 18 }, { width: 40 },
        { width: 20 }, { width: 10 }, { width: 60 },
      ];
      const colRulesWishes: ((val: unknown, rowBg: string) => XStyle)[] = [
        ruleDefault,      // 0: Date
        ruleType,         // 1: Type
        ruleDiff,         // 2: Difficulté
        ruleDefault,      // 3: Détail
        ruleDefault,      // 4: Assigné à
        ruleHighlightPos, // 5: Nb vœux
        ruleDefault,      // 6: Cadres volontaires
      ];
      styleSimpleSheet(ws3, colRulesWishes);
      XLSX.utils.book_append_sheet(wb, ws3, 'Détail des vœux');

      // ── Sheet: Nb de vœux par cadre ─────────────────────────────────────────
      const wsWishCount = buildWishCountSheet(slots, rawCadres, wishMap);
      XLSX.utils.book_append_sheet(wb, wsWishCount, 'Nb de vœux');
    }
  }

  // ── Fetch historical period scores ────────────────────────────────────────────
  let allPeriodScores: PerPeriodScore[] = [];
  try {
    allPeriodScores = await getAllPeriodScores();
  } catch {
    // non-blocking — historical data will just be absent
  }

  // Group by cadreId
  const scoresByCadre = new Map<string, PerPeriodScore[]>();
  for (const ps of allPeriodScores) {
    const arr = scoresByCadre.get(ps.cadreId) ?? [];
    arr.push(ps);
    scoresByCadre.set(ps.cadreId, arr);
  }

  // ── Per-cadre sheets ──────────────────────────────────────────────────────────
  const activeCadres = rawCadres.filter(c => c.active);

  for (const cadre of activeCadres) {
    const cadreSlots = slots
      .filter(s => s.cadreId === cadre.id)
      .sort((a, b) => a.date.localeCompare(b.date));

    const periodScores = (scoresByCadre.get(cadre.id!) ?? []).sort((a, b) =>
      a.startDate.localeCompare(b.startDate)
    );

    const sheetData: Record<string, unknown>[] = [];

    // ── Section 1: Historique des compteurs par période ──────────────────────
    sheetData.push({
      'Section': '═══ HISTORIQUE DES COMPTEURS PAR PÉRIODE ═══',
      'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
      'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
    });

    // Header row
    sheetData.push({
      'Section': 'Période',
      'Période': '',
      'Astr. Noël': 'Astr. Noël (D5)',
      'Astr. D4': 'Astr. D4',
      'Astr. D3': 'Astr. D3',
      'Astr. D2': 'Astr. D2',
      'Astr. D1': 'Astr. D1',
      'Astr. Total': 'Astr. Total',
      'Perm. Noël': 'Perm. Noël (D5)',
      'Perm. D4': 'Perm. D4',
      'Perm. D3': 'Perm. D3',
      'Perm. D2': 'Perm. D2',
      'Perm. D1': 'Perm. D1',
      'Perm. Total': 'Perm. Total',
    });

    // Group periods by end year (a semester starting Dec 29, 2025 belongs to 2026)
    const byYear = new Map<string, typeof periodScores>();
    for (const ps of periodScores) {
      const yr = periodYear(ps);
      const arr = byYear.get(yr) ?? [];
      arr.push(ps);
      byYear.set(yr, arr);
    }

    let cumA5 = 0, cumA4 = 0, cumA3 = 0, cumA2 = 0, cumA1 = 0;
    let cumP5 = 0, cumP4 = 0, cumP3 = 0, cumP2 = 0, cumP1 = 0;

    for (const [year, yearScores] of [...byYear.entries()].sort()) {
      let yrA5=0,yrA4=0,yrA3=0,yrA2=0,yrA1=0;
      let yrP5=0,yrP4=0,yrP3=0,yrP2=0,yrP1=0;

      for (const ps of yearScores) {
        cumA5 += ps.astreinteD5; cumA4 += ps.astreinteD4; cumA3 += ps.astreinteD3;
        cumA2 += ps.astreinteD2; cumA1 += ps.astreinteD1;
        cumP5 += ps.permanenceD5; cumP4 += ps.permanenceD4; cumP3 += ps.permanenceD3;
        cumP2 += ps.permanenceD2; cumP1 += ps.permanenceD1;
        yrA5 += ps.astreinteD5; yrA4 += ps.astreinteD4; yrA3 += ps.astreinteD3;
        yrA2 += ps.astreinteD2; yrA1 += ps.astreinteD1;
        yrP5 += ps.permanenceD5; yrP4 += ps.permanenceD4; yrP3 += ps.permanenceD3;
        yrP2 += ps.permanenceD2; yrP1 += ps.permanenceD1;

        sheetData.push({
          'Section': ps.periodLabel + (ps.periodStatus === 'draft' ? ' (en cours)' : ''),
          'Période': '',
          'Astr. Noël': ps.astreinteD5,
          'Astr. D4': ps.astreinteD4,
          'Astr. D3': ps.astreinteD3,
          'Astr. D2': ps.astreinteD2,
          'Astr. D1': ps.astreinteD1,
          'Astr. Total': ps.astreinteD5 + ps.astreinteD4 + ps.astreinteD3 + ps.astreinteD2 + ps.astreinteD1,
          'Perm. Noël': ps.permanenceD5,
          'Perm. D4': ps.permanenceD4,
          'Perm. D3': ps.permanenceD3,
          'Perm. D2': ps.permanenceD2,
          'Perm. D1': ps.permanenceD1,
          'Perm. Total': ps.permanenceD5 + ps.permanenceD4 + ps.permanenceD3 + ps.permanenceD2 + ps.permanenceD1,
        });
      }

      // Year subtotal
      sheetData.push({
        'Section': `── Total ${year}`,
        'Période': '',
        'Astr. Noël': yrA5, 'Astr. D4': yrA4, 'Astr. D3': yrA3, 'Astr. D2': yrA2, 'Astr. D1': yrA1,
        'Astr. Total': yrA5+yrA4+yrA3+yrA2+yrA1,
        'Perm. Noël': yrP5, 'Perm. D4': yrP4, 'Perm. D3': yrP3, 'Perm. D2': yrP2, 'Perm. D1': yrP1,
        'Perm. Total': yrP5+yrP4+yrP3+yrP2+yrP1,
      });
    }

    // Cumulative row
    sheetData.push({
      'Section': 'TOTAL CUMULÉ',
      'Période': '',
      'Astr. Noël': cumA5,
      'Astr. D4': cumA4,
      'Astr. D3': cumA3,
      'Astr. D2': cumA2,
      'Astr. D1': cumA1,
      'Astr. Total': cumA5 + cumA4 + cumA3 + cumA2 + cumA1,
      'Perm. Noël': cumP5,
      'Perm. D4': cumP4,
      'Perm. D3': cumP3,
      'Perm. D2': cumP2,
      'Perm. D1': cumP1,
      'Perm. Total': cumP5 + cumP4 + cumP3 + cumP2 + cumP1,
    });

    // Blank separator
    sheetData.push({
      'Section': '', 'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '',
      'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
      'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
    });

    // ── Section 2: Analyse comparative ──────────────────────────────────────
    for (const row of buildRecoRows(cadre, activeCadres)) {
      sheetData.push(row);
    }

    // Blank separator
    sheetData.push({
      'Section': '', 'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '',
      'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
      'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
    });

    // ── Section 3: Slots du planning courant ─────────────────────────────────
    if (cadreSlots.length > 0) {
      sheetData.push({
        'Section': '═══ CRÉNEAUX ASSIGNÉS ═══',
        'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
        'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
      });

      const astreinteSlots = cadreSlots.filter(s => s.type === 'astreinte');
      const permanenceSlots = cadreSlots.filter(s => s.type === 'permanence');

      if (astreinteSlots.length > 0) {
        sheetData.push({ 'Section': '-- ASTREINTES --', 'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '', 'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '' });
        for (const s of astreinteSlots) {
          sheetData.push({
            'Section': s.date,
            'Période': DIFFICULTY_LABELS[s.difficulty as DifficultyLevel],
            'Astr. Noël': s.difficulty,
            'Astr. D4': s.label,
            'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
            'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
          });
        }
      }

      if (permanenceSlots.length > 0) {
        sheetData.push({ 'Section': '-- PERMANENCES --', 'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '', 'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '' });
        for (const s of permanenceSlots) {
          sheetData.push({
            'Section': s.date,
            'Période': DIFFICULTY_LABELS[s.difficulty as DifficultyLevel],
            'Astr. Noël': s.difficulty,
            'Astr. D4': s.label,
            'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
            'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
          });
        }
      }
    }

    if (sheetData.length === 0) continue;

    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [
      { width: 28 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 14 }, { width: 14 }, { width: 12 },
      { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 },
    ];

    styleCadreSheet(ws);
    const cadreFullName = cadre.prenom ? `${cadre.prenom} ${cadre.name}` : cadre.name;
    const sheetName = cadreFullName.substring(0, 31).replace(/[\\/*?[\]:]/g, '');
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // ── Sheet: Résumé annuel ──────────────────────────────────────────────────
  if (allPeriodScores.length > 0) {
    // Group by end year (same logic as EquityRecap)
    const allYears = [...new Set(allPeriodScores.map(ps => periodYear(ps)))].sort();

    const annualData = rawCadres.filter(c => c.active).map(c => {
      const row: Record<string, unknown> = { 'Cadre': fullName(c) };
      let totalAst = 0, totalPerm = 0;
      for (const yr of allYears) {
        const yearScores = allPeriodScores.filter(ps => ps.cadreId === c.id! && periodYear(ps) === yr);
        const hasDraft = yearScores.some(ps => ps.periodStatus === 'draft');
        const label = hasDraft ? `${yr} (en cours)` : yr;
        const ast = yearScores.reduce((s, ps) => s + ps.astreinteD1 + ps.astreinteD2 + ps.astreinteD3 + ps.astreinteD4 + ps.astreinteD5, 0);
        const perm = yearScores.reduce((s, ps) => s + ps.permanenceD1 + ps.permanenceD2 + ps.permanenceD3 + ps.permanenceD4 + ps.permanenceD5, 0);
        row[`${label} — Ast.`] = ast || 0;
        row[`${label} — Perm.`] = perm || 0;
        totalAst += ast;
        totalPerm += perm;
      }
      row['Cumul Ast.'] = totalAst;
      row['Cumul Perm.'] = totalPerm;
      return row;
    }).sort((a, b) => ((b['Cumul Ast.'] as number) + (b['Cumul Perm.'] as number)) - ((a['Cumul Ast.'] as number) + (a['Cumul Perm.'] as number)));

    const wsAnnual = XLSX.utils.json_to_sheet(annualData);
    const numCols = 1 + allYears.length * 2 + 2;
    wsAnnual['!cols'] = [{ width: 22 }, ...Array(numCols - 1).fill({ width: 16 })];
    // Build colRules dynamically: Cadre | (Ast. Perm.)×years | Cumul Ast. | Cumul Perm.
    const colRulesAnnual: ((val: unknown, rowBg: string) => XStyle)[] = [ruleDefault];
    for (let i = 0; i < allYears.length; i++) {
      colRulesAnnual.push((_v, _bg) => ({ fill: fill(C.blue50), font: { color: { rgb: C.blue700 } }, alignment: { horizontal: 'center' }, border: border() }));
      colRulesAnnual.push((_v, _bg) => ({ fill: fill(C.teal50), font: { color: { rgb: C.teal700 } }, alignment: { horizontal: 'center' }, border: border() }));
    }
    colRulesAnnual.push(ruleTotalAst);
    colRulesAnnual.push(ruleTotalPerm);
    styleSimpleSheet(wsAnnual, colRulesAnnual);
    XLSX.utils.book_append_sheet(wb, wsAnnual, 'Résumé annuel');
  }

  XLSX.writeFile(wb, 'planning-astreintes-permanences.xlsx');
}
