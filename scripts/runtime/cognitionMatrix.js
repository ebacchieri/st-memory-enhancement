// Cognition Matrix computation
import { BASE, EDITOR, USER } from '../../core/manager.js';

// Influence weights: +1 enhance/contributes; -1 impairs.
// Derived from assets/CircuitsDefinition.txt, kept internal.
const CIRCUITS = [
    'Desire to Acquire',
    'Desire to Bond',
    'Desire to Learn',
    'Desire to Defend',
    'Desire to Feel',
    'Need to Survive',
    'Need for Food',
    'Need for Water',
    'Need for Sex (Lust)',
    'Empathy',
    'Compassion',
    'Emotional Contagion',
    'Reward and Motivation',
    'F.F.F.F. (Fight)',
    'F.F.F.F. (Flight)',
    'F.F.F.F. (Freeze)',
    'F.F.F.F. (Fawn)',
    'Pain',
    'Pleasure',
    'Electrochemistry'
];

// Descriptions used when auto-seeding missing circuit rows (kept in sync with core/table/sheet.js)
const CIRCUIT_INFO = new Map([
    ['Desire to Acquire', 'The drive to accumulate and possess things, whether tangible or intangible.'],
    ['Desire to Bond', 'The need to be loved and valued in relationships with others.'],
    ['Desire to Learn', 'The pursuit of knowledge and understanding, driven by curiosity.'],
    ['Desire to Defend', 'The instinct to protect oneself, loved ones, and property.'],
    ['Desire to Feel', 'The longing for emotional experiences, both pleasant and exciting.'],
    ['Need to Survive', 'Self-preservation instinct; contributes to itself and F.F.F.F.; impairs other desires.'],
    ['Need for Food', 'Hunger; impairs Empathy, Compassion, Desire to Acquire, and Desire to Learn.'],
    ['Need for Water', 'Thirst; the strongest need; impairs everything else.'],
    ['Need for Sex (Lust)', 'Second strongest need; enhances Desire to Bond and Desire to Feel.'],
    ['Empathy', 'Understand and share feelings; enhances Lust.'],
    ['Compassion', 'Desire to help in response to others’ suffering; enhances Empathy.'],
    ['Emotional Contagion', 'Automatic tendency to “catch” emotions; enhances Compassion.'],
    ['Reward and Motivation', 'Drives behavior via anticipated and received pleasure; contributes to itself and all circuits.'],
    ['F.F.F.F. (Fight)', 'Aggressive response to threat; impairs Empathy and Compassion.'],
    ['F.F.F.F. (Flight)', 'Escape response; impairs Compassion.'],
    ['F.F.F.F. (Freeze)', 'Paralysis in face of danger; impairs Empathy.'],
    ['F.F.F.F. (Fawn)', 'Appeasement response; impairs Desire to Bond and Desire to Feel.'],
    ['Pain', 'Protective signal; impairs everything else.'],
    ['Pleasure', 'Positive experience; enhances every desire and need for sex.'],
    ['Electrochemistry', 'Other neuro-factors/drugs/emotions; can enhance or impair everything.'],
]);

function idxByName(name) { return CIRCUITS.indexOf(name); }

// Build influence map
function buildInfluence() {
    const N = CIRCUITS.length;
    const map = Array.from({ length: N }, () => new Map());
    const add = (from, to, w) => {
        const i = idxByName(from); if (i < 0) return;
        const j = idxByName(to); if (j < 0) return;
        map[i].set(j, (map[i].get(j) ?? 0) + w);
    };

    // Helpers
    const allOthers = (from) => CIRCUITS.filter(n => n !== from);
    const desires = ['Desire to Acquire','Desire to Bond','Desire to Learn','Desire to Defend','Desire to Feel'];

    // Need to Survive -> contributes to itself and FFFF; impairs other desires
    add('Need to Survive', 'Need to Survive', +1);
    ['F.F.F.F. (Fight)','F.F.F.F. (Flight)','F.F.F.F. (Freeze)','F.F.F.F. (Fawn)'].forEach(t => add('Need to Survive', t, +1));
    desires.forEach(t => add('Need to Survive', t, -1));
    // Need for Food -> impairs Empathy, Compassion, Desire to Acquire, Desire to Learn
    ['Empathy','Compassion','Desire to Acquire','Desire to Learn'].forEach(t => add('Need for Food', t, -1));
    // Need for Water -> impairs everything else
    allOthers('Need for Water').forEach(t => add('Need for Water', t, -1));
    // Need for Sex -> enhances Desire to Bond, Desire to Feel
    ['Desire to Bond','Desire to Feel'].forEach(t => add('Need for Sex (Lust)', t, +1));
    // Empathy -> enhances Lust
    add('Empathy', 'Need for Sex (Lust)', +1);
    // Compassion -> enhances Empathy
    add('Compassion', 'Empathy', +1);
    // Emotional Contagion -> enhances Compassion
    add('Emotional Contagion', 'Compassion', +1);
    // Reward and Motivation -> contributes to itself and all other circuits
    add('Reward and Motivation', 'Reward and Motivation', +1);
    CIRCUITS.filter(n => n !== 'Reward and Motivation').forEach(t => add('Reward and Motivation', t, +1));
    // FFF subtypes
    add('F.F.F.F. (Fight)','Empathy', -1);
    add('F.F.F.F. (Fight)','Compassion', -1);
    add('F.F.F.F. (Flight)','Compassion', -1);
    add('F.F.F.F. (Freeze)','Empathy', -1);
    add('F.F.F.F. (Fawn)','Desire to Bond', -1);
    add('F.F.F.F. (Fawn)','Desire to Feel', -1);
    // Pain -> impairs everything else
    allOthers('Pain').forEach(t => add('Pain', t, -1));
    // Pleasure -> enhances every desire and need for sex
    desires.concat(['Need for Sex (Lust)']).forEach(t => add('Pleasure', t, +1));
    // Electrochemistry -> depends: apply sign of its base change later; influences all others
    allOthers('Electrochemistry').forEach(t => add('Electrochemistry', t, +1));

    return map;
}
const INFL = buildInfluence();

function parseNumberSafe(str, def = 0) {
    const n = typeof str === 'number' ? str : parseFloat(String(str).replace(',', '.'));
    return Number.isFinite(n) ? n : def;
}

// Parse "name:value/name2:value2"
function parseModifiersCell(str = '') {
    const res = [];
    if (!str) return res;
    String(str).split('/').forEach(tok => {
        const t = tok.trim(); if (!t) return;
        const [name, val] = t.split(':');
        const v = parseNumberSafe(val, 0);
        res.push({ name: (name || '').trim(), value: v });
    });
    return res;
}
function formatModifiersCell(items) {
    if (!Array.isArray(items) || items.length === 0) return '';
    return items.map(i => `${i.name}:${i.value}`).join('/');
}

// Parse Change cell: allow "N" (legacy allowed "N; v:+M", v ignored now)
function parseChangeCell(str = '') {
    if (!str) return { base: 0 };
    let base = 0;
    const parts = String(str).split(/;|,/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
        const n = parseNumberSafe(p, NaN);
        if (Number.isFinite(n)) base = n;
    }
    return { base };
}

// Cooldown parser: supports "no" or "yes" or "yes(N)"
function parseCooldownCell(str = '') {
    const s = String(str || '').trim().toLowerCase();
    if (s === 'no' || s === '') return { active: false, remain: 0 };
    const m = s.match(/^yes(?:\s*\((\d+)\))?$/i);
    if (!m) return { active: true, remain: 1 };
    const r = parseInt(m[1] ?? '1', 10);
    return { active: true, remain: Number.isFinite(r) ? r : 1 };
}
function formatCooldown(remain) {
    return remain > 0 ? `yes(${remain})` : 'no';
}

function getRows(sheet) { return sheet.getContent(false); }
function findRowIndexByName(sheet, name) {
    const rows = getRows(sheet);
    const header = sheet.getHeader();
    const nameCol = header.indexOf('Name');
    if (nameCol < 0) return -1;
    for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][nameCol]) === name) return i + 1;
    }
    return -1;
}
function getCell(sheet, rowIdx, colIdx) { return sheet.findCellByPosition(rowIdx, colIdx); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function insertRowAtEnd(sheet, values) {
    const cell0 = sheet.findCellByPosition(sheet.getRowCount() - 1, 0);
    if (!cell0) return;
    cell0.newAction(sheet.constructor.Cell?.CellAction?.insertDownRow ?? sheet.cells.get(sheet.hashSheet[0][0]).constructor.CellAction.insertDownRow, {}, false);
    const rowIdx = sheet.getRowCount() - 1;
    const ordered = ['', ...values];
    ordered.forEach((v, i) => {
        const c = sheet.findCellByPosition(rowIdx, i);
        if (c) c.data.value = v;
    });
}

// Ensure main stat rows exist; seed defaults if missing
function ensureMainRows(sheet) {
    try {
        const need = (n) => findRowIndexByName(sheet, n) < 1;
        let changed = false;
        if (need('Complexity')) {
            insertRowAtEnd(sheet, [
                'Complexity',
                'Overall state of mind; improves above 80, critical below 15. Base temporal decay -1 each turn. Affected by circuits fulfillment and Logic.',
                '50', '', 'Base Decay:-1/Logic Modifier:0', '0', 'no', ''
            ]);
            changed = true;
        }
        if (need('Logic')) {
            insertRowAtEnd(sheet, ['Logic',
                'Ability to create proper actions. Levels 0..5+. Each level below 2: Complexity -2; above 2: Complexity +2.',
                getRandomValue(), '', '', '', 'no', ''
            ]);
            changed = true;
        }
        if (need('Self-awareness')) {
            insertRowAtEnd(sheet, ['Self-awareness',
                'Defines how many circuits can be affected by Volition. Levels 0..5+; default 2.',
                getRandomValue(), '', '', '', 'no', ''
            ]);
            changed = true;
        }
        if (need('Volition')) {
            insertRowAtEnd(sheet, ['Volition',
                'Ability to resist/suppress a circuit or enforce change. Levels 0..5+; default 2.',
                getRandomValue(), '', '', '', 'no', ''
            ]);
            changed = true;
        }
        if (changed) {
            const { piece } = USER.getChatPiece() || {};
            if (piece) sheet.save(piece, true);
        }
    } catch (e) { console.warn('[Cognition] ensureMainRows failed:', e); }
}

// Helper function to generate random priority between 1 and 5
function getRandomPriority() { return Math.floor(Math.random() * 5) + 1; }
function getRandomValue() {
    const rand = Math.random();
    if (rand < 0.62) return '2';
    else if (rand < 0.93) return '3';
    else if (rand < 0.98) return '4';
    else return '5';
}
// Helper function to generate random modifier with specified probability distribution
function getRandomModifier() {
    const rand = Math.random();
    if (rand < 0.546) return 'Person:1';
    else if (rand < 0.819) return 'Person:2';
    else return 'Person:-1';
}

// Ensure default circuit rows exist; seed any missing from CIRCUITS with proper description
function ensureCircuitRows(sheet) {
    try {
        const header = sheet.getHeader();
        const idxName = header.indexOf('Name');
        if (idxName < 0) return;

        const rows = sheet.getContent(false);
        const existing = new Set(rows.map(r => String(r[idxName]).trim()).filter(Boolean));
        const missing = CIRCUITS.filter(n => !existing.has(n));
        if (missing.length === 0) return;

        let changed = false;
        missing.forEach(n => {
            const desc = CIRCUIT_INFO.get(n) || '';
            // Default seed: priority, base change, modifiers, final, cooldown, satisfaction
            if (n.includes('F.F.F.F.') || n.includes('Pain') || n.includes('Pleasure') || n.includes('Electrochemistry')) {
                insertRowAtEnd(sheet, [n, desc, '1', '0', '', '0', 'no', '0']);
            } else {
                insertRowAtEnd(sheet, [n, desc, getRandomPriority().toString(), '0', getRandomModifier(), '0', 'no', '0']);
            }
            changed = true;
        });
        if (changed) {
            const { piece } = USER.getChatPiece() || {};
            if (piece) sheet.save(piece, true);
        }
    } catch (e) { console.warn('[Cognition] ensureCircuitRows failed:', e); }
}

// Main computation entry
export function updateCognitionMatrixAfterEdits(allSheets) {
    try {
        const sheet = allSheets.find(s => s.name === 'Cognition Matrix');
        if (!sheet) return;

        // Header indices (+compat)
        let header = sheet.getHeader();
        const idxName = header.indexOf('Name');
        const idxVal = header.indexOf('Value');
        const idxChg = header.indexOf('Change');
        const idxMods = header.indexOf('Modifiers');
        let idxFinal = header.indexOf('Final Change');
        let idxCd = header.indexOf('Cooldown'); if (idxCd < 0) idxCd = header.indexOf('Volition Exclusion');
        let idxSat = header.indexOf('Satisfaction');

        // Auto-rename legacy header
        if (header.indexOf('Volition Exclusion') >= 0) {
            const cell = sheet.findCellByPosition(0, (header.indexOf('Volition Exclusion') + 1));
            if (cell) cell.data.value = 'Cooldown';
            header = sheet.getHeader(); idxCd = header.indexOf('Cooldown');
        }

        if ([idxName, idxVal, idxChg, idxMods, idxFinal].some(i => i < 0) || idxCd < 0) return;

        // Seed rows if needed
        if (['Complexity','Logic','Self-awareness','Volition'].some(n => findRowIndexByName(sheet, n) < 1)) {
            ensureMainRows(sheet);
        }
        ensureCircuitRows(sheet);

        header = sheet.getHeader();
        const idxRowComplexity = findRowIndexByName(sheet, 'Complexity');
        const idxRowLogic = findRowIndexByName(sheet, 'Logic');
        const idxRowSA = findRowIndexByName(sheet, 'Self-awareness');
        const idxRowVol = findRowIndexByName(sheet, 'Volition');

        const getNum = (rowIdx, colIdx) => parseNumberSafe(getCell(sheet, rowIdx, colIdx + 1)?.data?.value ?? 0, 0);
        const setCellValue = (rowIdx, colIdx, v) => {
            const c = getCell(sheet, rowIdx, colIdx + 1);
            if (c) c.data.value = String(v);
        };

        const logicLevel = getNum(idxRowLogic, idxVal);
        const saLevel = getNum(idxRowSA, idxVal);
        const volitionLevel = getNum(idxRowVol, idxVal);

        // Collect circuit rows (exclude main stats)
        const mainNames = new Set(['Complexity','Logic','Self-awareness','Volition']);
        const circuitRows = [];
        const totalRows = sheet.getContent(false).length;
        for (let i = 1; i <= totalRows; i++) {
            const name = getCell(sheet, i, idxName + 1)?.data?.value;
            if (!name || mainNames.has(name)) continue;
            const priority = getNum(i, idxVal);
            const changeText = getCell(sheet, i, idxChg + 1)?.data?.value ?? '';
            const modsText = getCell(sheet, i, idxMods + 1)?.data?.value ?? '';
            const finalOld = getNum(i, idxFinal);
            const cdVal = getCell(sheet, i, idxCd + 1)?.data?.value ?? 'no';
            const cd = parseCooldownCell(cdVal);
            const satisfactionOld = idxSat >= 0 ? getNum(i, idxSat) : 0;

            circuitRows.push({
                rowIdx: i,
                name,
                priority,
                changeText,
                modsText,
                finalOld,
                cooldownRemain: cd.remain,
                satisfactionOld
            });
        }

        // Pre-parse base change and long-term modifiers
        const baseChange = new Map();   // name -> base number
        const longTermSum = new Map();  // name -> sum number
        circuitRows.forEach(r => {
            const { base } = parseChangeCell(r.changeText);
            baseChange.set(r.name, base);
            longTermSum.set(r.name, parseModifiersCell(r.modsText).reduce((a,b) => a + (b.value || 0), 0));
        });

        // Influence aggregation (raw sum)
        const baseByIndex = CIRCUITS.map(n => baseChange.get(n) ?? 0);
        // Electrochemistry sign correction
        const electroIdx = idxByName('Electrochemistry');
        const electroSign = Math.sign(baseByIndex[electroIdx] || 0) || 0;

        const influenceRaw = new Map(); // name -> raw sum
        for (let t = 0; t < CIRCUITS.length; t++) {
            const targetName = CIRCUITS[t];
            if (!circuitRows.find(cr => cr.name === targetName)) continue;

            let sum = 0;
            for (let s = 0; s < CIRCUITS.length; s++) {
                if (s === t) continue;
                let w = INFL[s].get(t) ?? 0;
                if (w === 0) continue;

                if (s === electroIdx) {
                    w = w * (electroSign || 0);
                }

                const sourceBase = baseByIndex[s] || 0;
                const srcSign = Math.sign(sourceBase) || 0;
                sum += (srcSign * w);
            }
            influenceRaw.set(targetName, sum);
        }

        // Final change (cumulative) and updates
        let complexityDeltaFromCircuits = 0;
        const updatedCircuits = [];
        for (const r of circuitRows) {
            const base = baseChange.get(r.name) ?? 0;
            const raw = influenceRaw.get(r.name) ?? 0;
            const inflDelta = Math.sign(raw); // +1 enhancement, -1 impairment, 0 neutral

            // New cumulative final change (apply cooldown dampening first), then clamp to [-10, 10]
            const perTurnDelta = base + inflDelta;
            const candidate = r.finalOld + perTurnDelta;
            const inCooldownBefore = r.cooldownRemain > 0;
            const finalNewUnclamped = inCooldownBefore ? (0.5 * candidate) : candidate;
            const finalNew = clamp(finalNewUnclamped, -10, 10);

            // Priority = old + modifiers -> clamp to [1..10]
            const newPriority = clamp((r.priority ?? 0) + (longTermSum.get(r.name) ?? 0), 1, 10);
            setCellValue(r.rowIdx, idxVal, String(newPriority));

            // Satisfaction computation
            // raw = finalNew / newPriority; clip positive side to 1, keep negative down to -10; store with 2 decimals
            let sat = 0;
            if (newPriority > 0) sat = finalNew / newPriority;
            // clip positive to 1
            sat = Math.min(sat, 1);
            // guard extreme negative (bounded by finalNew/prio anyway); keep within [-10, 1] for safety
            sat = clamp(sat, -10, 1);

            if (idxSat >= 0) {
                setCellValue(r.rowIdx, idxSat, sat.toFixed(2));
            }

            // Cooldown duration update
            // Step1: tick down if was active
            let nextRemain = inCooldownBefore ? Math.max(0, r.cooldownRemain - 1) : 0;
            // Step2: trigger/extend when Satisfaction >= 1
            if (sat >= 1) nextRemain += 4;
            setCellValue(r.rowIdx, idxCd, formatCooldown(nextRemain));

            // Persist Final Change (clamped)
            setCellValue(r.rowIdx, idxFinal, String(finalNew));

            // Complexity contribution per circuit using new rule:
            // circuitImpact = Satisfaction * Abs(FinalChange + baseChange)
            const impactMagnitude = Math.abs(finalNew + base);
            const circuitImpact = sat * impactMagnitude;
            const vsBuffer = volitionLevel + saLevel;

            if ((circuitImpact < 0 && Math.abs(circuitImpact) <= vsBuffer) || circuitImpact > 0) {
                complexityDeltaFromCircuits += (inflDelta + circuitImpact);
            } else {
                complexityDeltaFromCircuits += inflDelta;
            }

            updatedCircuits.push({ ...r, newPriority });
        }

        // Sort circuits by priority desc (stable)
        updatedCircuits.sort((a, b) => (b.newPriority - a.newPriority) || a.name.localeCompare(b.name));

        // Build new value sheet for rebuild (include Name column)
        const headerNames = sheet.getHeader();
        const mainRows = ['Complexity','Logic','Self-awareness','Volition'].map(n => {
            const ri = findRowIndexByName(sheet, n);
            const rowVals = headerNames.map((_, ci) => {
                const cell = getCell(sheet, ri, ci + 1);
                return cell?.data?.value ?? '';
            });
            return rowVals;
        });

        const circuitsSortedValues = updatedCircuits.map(u => {
            const ri = u.rowIdx;
            const rowVals = headerNames.map((_, ci) => {
                const cell = getCell(sheet, ri, ci + 1);
                return cell?.data?.value ?? '';
            });
            return rowVals;
        });

        const valueSheet = [
            ['', ...headerNames],          // header row with index col
            ['', ...mainRows[0]],         // Complexity
            ['', ...mainRows[1]],         // Logic
            ['', ...mainRows[2]],         // Self-awareness
            ['', ...mainRows[3]],         // Volition
            ...circuitsSortedValues.map(r => ['', ...r])
        ];

        try {
            sheet.rebuildHashSheetByValueSheet(valueSheet);
        } catch (e) {
            console.warn('[Cognition] Rebuild sheet after sorting failed:', e);
        }

        // Re-fetch indices after rebuild
        const complexityRow = findRowIndexByName(sheet, 'Complexity');
        const idxMods2 = sheet.getHeader().indexOf('Modifiers');
        const complexityModsCell = getCell(sheet, complexityRow, idxMods2 + 1);
        const existingMods = parseModifiersCell(complexityModsCell?.data?.value ?? '')

        // Complexity modifiers maintenance
        const filtered = existingMods.filter(m => !/^Logic Modifier$/i.test(m.name) && !/^Base Decay$/i.test(m.name));
        const logicModValue = (logicLevel > 2 ? (logicLevel - 2) * 2 : (logicLevel < 2 ? (logicLevel - 2) * 2 : 0));
        filtered.push({ name: 'Base Decay', value: -1 });
        filtered.push({ name: 'Logic Modifier', value: logicModValue });
        if (complexityModsCell) complexityModsCell.data.value = formatModifiersCell(filtered);

        const idxFinal2 = sheet.getHeader().indexOf('Final Change');
        const idxValue2 = sheet.getHeader().indexOf('Value');

        // Apply base/logic on top of aggregated per-circuit contribution
        const finalComplexityDelta = complexityDeltaFromCircuits + (-1) + logicModValue;

        // Update Complexity Final Change and Value
        const complexityFinalCell = getCell(sheet, complexityRow, idxFinal2 + 1);
        if (complexityFinalCell) complexityFinalCell.data.value = String(finalComplexityDelta);

        const complexityValueCell = getCell(sheet, complexityRow, idxValue2 + 1);
        const oldComplexity = parseNumberSafe(complexityValueCell?.data?.value ?? 50, 50);
        const newComplexity = oldComplexity + finalComplexityDelta;
        if (complexityValueCell) complexityValueCell.data.value = String(newComplexity);

    } catch (e) {
        console.error('[Cognition] update failed:', e);
        EDITOR.warning('Cognition Matrix update failed. Check console for details.');
    }
}

// Build a compact prompt snippet with main stats + top-K circuits by priority
export function buildCognitionTopKPrompt(kOverride = null) {
    try {
        const sheets = BASE.getChatSheets();
        const sheet = sheets.find(s => s.name === 'Cognition Matrix');
        if (!sheet) return '';

        const header = sheet.getHeader();
        const idxName = header.indexOf('Name');
        const idxVal = header.indexOf('Value');
        const idxFinal = header.indexOf('Final Change');
        let idxCd = header.indexOf('Cooldown'); if (idxCd < 0) idxCd = header.indexOf('Volition Exclusion');
        if ([idxName, idxVal, idxFinal, idxCd].some(i => i < 0)) return '';

        const getRowByName = (n) => {
            const rows = sheet.getContent(false);
            const nameIdx = header.indexOf('Name');
            for (let i = 0; i < rows.length; i++) if (String(rows[i][nameIdx]) === n) return rows[i];
            return null;
        };

        const mainNames = ['Complexity','Logic','Self-awareness','Volition'];
        const main = {};
        for (const n of mainNames) {
            const row = getRowByName(n);
            if (row) main[n] = { value: row[idxVal], finalChange: row[idxFinal] ?? 0 };
        }
        const saLevel = parseFloat(main?.['Self-awareness']?.value ?? 2) || 2;
        const logicLevel = parseFloat(main?.['Logic']?.value ?? 2) || 2;
        const k = kOverride != null ? kOverride : (2 + saLevel + Math.max(0, Math.floor(logicLevel) - 2) * 2);

        const allRows = sheet.getContent(false);
        const circuits = allRows.filter(r => !!r[idxName] && !mainNames.includes(String(r[idxName])));
        const parsed = circuits.map(r => ({
            name: r[idxName],
            priority: parseFloat(r[idxVal]) || 0,
            final: parseFloat(r[idxFinal]) || 0,
            excl: String(r[idxCd] || 'no').toLowerCase().startsWith('yes')
        }));

        // Sort by priority (desc) regardless of cooldown
        parsed.sort((a, b) => (b.priority - a.priority) || a.name.localeCompare(b.name));

        // Then take only top-K that are NOT on cooldown
        const top = parsed.filter(c => !c.excl).slice(0, Math.max(0, k));

        const ms = `Cognition Summary
- Main: Complexity=${main?.Complexity?.value ?? ''} (${(main?.Complexity?.finalChange ?? 0) >= 0 ? '+' : ''}${main?.Complexity?.finalChange ?? 0}), Logic=${main?.Logic?.value ?? ''}, Self-awareness=${main?.['Self-awareness']?.value ?? ''}, Volition=${main?.Volition?.value ?? ''}`;
        const list = top.map((c, i) =>
            `  ${i+1}. ${c.name} | priority=${c.priority} | final=${c.final >= 0 ? '+' : ''}${c.final} | cooldown=no`
        ).join('\n');

        return `${ms}\n- Top ${top.length} circuits (not on cooldown):\n${list}`.trim();
    } catch (e) {
        console.warn('[Cognition] buildCognitionTopKPrompt failed:', e);
        return '';
    }
}