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

function idxByName(name) {
    return CIRCUITS.indexOf(name);
}

// Build influence map
function buildInfluence() {
    const N = CIRCUITS.length;
    const map = Array.from({ length: N }, () => new Map());

    const add = (from, to, w) => {
        const i = idxByName(from);
        if (i < 0) return;
        const j = idxByName(to);
        if (j < 0) return;
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
    // Implementation detail: we mark all connections with weight 1, and we multiply by sign at runtime
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
        const t = tok.trim();
        if (!t) return;
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

// Parse Change cell: allow "N" or "N; v:+M"
function parseChangeCell(str = '') {
    if (!str) return { base: 0, v: 0 };
    let base = 0, v = 0;
    const parts = String(str).split(/;|,/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
        if (/^v\s*:\s*([+\-]?\d+(\.\d+)?)$/i.test(p)) {
            const m = p.match(/^v\s*:\s*([+\-]?\d+(\.\d+)?)$/i);
            v = parseNumberSafe(m?.[1], 0);
        } else {
            const n = parseNumberSafe(p, NaN);
            if (Number.isFinite(n)) base = n;
        }
    }
    return { base, v };
}

function getHeaderIndexMap(sheet) {
    const header = sheet.getHeader();
    const map = new Map();
    header.forEach((h, idx) => map.set(h, idx));
    return map;
}

function getRows(sheet) {
    // returns rows of values (without header/index col)
    return sheet.getContent(false);
}

function findRowIndexByName(sheet, name) {
    const rows = getRows(sheet);
    const header = sheet.getHeader();
    const nameCol = header.indexOf('Name');
    if (nameCol < 0) return -1;
    for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][nameCol]) === name) {
            return i + 1; // +1 to account for header
        }
    }
    return -1;
}

function getCell(sheet, rowIdx, colIdx) {
    // rowIdx, colIdx are zero-based with header included
    return sheet.findCellByPosition(rowIdx, colIdx);
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function insertRowAtEnd(sheet, values) {
    // values are in display order: [Name, Description, Value, Change, Modifiers, Final Change, Volition Exclusion]
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
        const header = sheet.getHeader();
        const idxName = header.indexOf('Name');
        if (idxName < 0) return;

        const need = (n) => findRowIndexByName(sheet, n) < 1;
        let changed = false;

        if (need('Complexity')) {
            insertRowAtEnd(sheet, [
                'Complexity',
                'Overall state of mind; improves above 80, critical below 15. Base temporal decay -1 each turn. Affected by circuits fulfillment and Logic.',
                '50', '', 'Base Decay:-1/Logic Modifier:0', '0', 'no'
            ]);
            changed = true;
        }
        if (need('Logic')) {
            insertRowAtEnd(sheet, [
                'Logic',
                'Ability to create proper actions. Levels 0..5+. Each level below 2: Complexity -2; above 2: Complexity +2.',
                '2', '', '', '', 'no'
            ]);
            changed = true;
        }
        if (need('Self-awareness')) {
            insertRowAtEnd(sheet, [
                'Self-awareness',
                'Defines how many circuits can be affected by Volition. Levels 0..5+; default 2.',
                '2', '', '', '', 'no'
            ]);
            changed = true;
        }
        if (need('Volition')) {
            insertRowAtEnd(sheet, [
                'Volition',
                'Ability to resist/suppress a circuit or enforce change. Levels 0..5+; default 2.',
                '2', '', '', '', 'no'
            ]);
            changed = true;
        }

        if (changed) {
            const { piece } = USER.getChatPiece() || {};
            if (piece) sheet.save(piece, true);
        }
    } catch (e) {
        console.warn('[Cognition] ensureMainRows failed:', e);
    }
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
            // Default seed: priority=1 (Value), Change=0, Modifiers='', Final Change=0, Exclusion=no
            insertRowAtEnd(sheet, [n, desc, '1', '0', '', '0', 'no']);
            changed = true;
        });
        if (changed) {
            const { piece } = USER.getChatPiece() || {};
            if (piece) sheet.save(piece, true);
        }
    } catch (e) {
        console.warn('[Cognition] ensureCircuitRows failed:', e);
    }
}

// Main computation entry
export function updateCognitionMatrixAfterEdits(allSheets) {
    try {
        const sheet = allSheets.find(s => s.name === 'Cognition Matrix');
        if (!sheet) return;

        const header = sheet.getHeader();
        const idxName = header.indexOf('Name');
        const idxDesc = header.indexOf('Description');
        const idxValue = header.indexOf('Value');
        const idxChange = header.indexOf('Change');
        const idxMods = header.indexOf('Modifiers');
        const idxFinal = header.indexOf('Final Change');
        const idxExcl = header.indexOf('Volition Exclusion');

        if ([idxName, idxValue, idxChange, idxMods, idxFinal, idxExcl].some(i => i < 0)) return;

        // Seed required rows if missing
        const idxRowComplexity0 = findRowIndexByName(sheet, 'Complexity');
        const idxRowLogic0 = findRowIndexByName(sheet, 'Logic');
        const idxRowSA0 = findRowIndexByName(sheet, 'Self-awareness');
        const idxRowVolition0 = findRowIndexByName(sheet, 'Volition');
        if (idxRowComplexity0 < 1 || idxRowLogic0 < 1 || idxRowSA0 < 1 || idxRowVolition0 < 1) {
            ensureMainRows(sheet);
        }
        ensureCircuitRows(sheet);

        // Recompute indices after potential seeding
        const idxRowComplexity = findRowIndexByName(sheet, 'Complexity');
        const idxRowLogic = findRowIndexByName(sheet, 'Logic');
        const idxRowSA = findRowIndexByName(sheet, 'Self-awareness');
        const idxRowVolition = findRowIndexByName(sheet, 'Volition');

        if (idxRowComplexity < 1 || idxRowLogic < 1 || idxRowSA < 1 || idxRowVolition < 1) {
            console.warn('[Cognition] Missing main stat rows');
        }

        const valOf = (rowIdxHeaderBased) => {
            const c = getCell(sheet, rowIdxHeaderBased, idxValue + 1);
            return parseNumberSafe(c?.data?.value ?? 0, 0);
        };
        const setCellValue = (rowIdx, colIdx, v) => {
            const c = getCell(sheet, rowIdx, colIdx + 1);
            if (c) c.data.value = String(v);
        };

        const logicLevel = valOf(idxRowLogic);
        const volitionLevel = valOf(idxRowVolition);

        // Collect circuit rows: all rows excluding the 4 main stat rows
        const mainNames = new Set(['Complexity','Logic','Self-awareness','Volition']);
        const circuitRows = [];
        const rows = sheet.getContent(false);
        const rowCount = rows.length;
        for (let i = 1; i <= rowCount; i++) {
            const nameCell = getCell(sheet, i, idxName + 1);
            const name = nameCell?.data?.value;
            if (!name || mainNames.has(name)) continue;
            const valueCell = getCell(sheet, i, idxValue + 1);
            const changeCell = getCell(sheet, i, idxChange + 1);
            const modsCell = getCell(sheet, i, idxMods + 1);
            const finalCell = getCell(sheet, i, idxFinal + 1);
            const exclCell = getCell(sheet, i, idxExcl + 1);
            circuitRows.push({
                rowIdx: i,
                name,
                priority: parseNumberSafe(valueCell?.data?.value ?? 0, 0),
                changeText: changeCell?.data?.value ?? '',
                modsText: modsCell?.data?.value ?? '',
                excl: String(exclCell?.data?.value ?? 'no').toLowerCase() === 'yes',
                finalText: finalCell?.data?.value ?? '',
            });
        }

        // Pre-parse base change and volition deltas
        const baseChange = new Map();   // name -> base number
        const volitionDelta = new Map();// name -> v number
        const longTermSum = new Map();  // name -> sum number
        circuitRows.forEach(r => {
            const { base, v } = parseChangeCell(r.changeText);
            baseChange.set(r.name, base);
            volitionDelta.set(r.name, v);
            longTermSum.set(r.name, parseModifiersCell(r.modsText).reduce((a,b) => a + (b.value||0), 0));
        });

        // Influence computation
        const baseByIndex = CIRCUITS.map(n => baseChange.get(n) ?? 0);
        // Electrochemistry sign correction
        const electroIdx = idxByName('Electrochemistry');
        const electroSign = Math.sign(baseByIndex[electroIdx] || 0) || 0;

        const influenceSum = new Map(); // name -> number
        for (let t = 0; t < CIRCUITS.length; t++) {
            const targetName = CIRCUITS[t];
            // Skip if target row doesn't exist in sheet
            const exists = circuitRows.find(cr => cr.name === targetName);
            if (!exists) continue;

            let sum = 0;
            for (let s = 0; s < CIRCUITS.length; s++) {
                if (s === t) continue;
                let w = INFL[s].get(t) ?? 0;
                if (w === 0) continue;

                // Electrochemistry influences everything with weight * sign(electro base)
                if (s === electroIdx) {
                    w = w * (electroSign || 0);
                }

                // Basic rule: source's base change sign contributes +/- 1 * weight
                const sourceBase = baseByIndex[s] || 0;
                const srcSign = Math.sign(sourceBase) || 0;
                sum += (srcSign * w);
            }
            influenceSum.set(targetName, sum);
        }

        // Final change and priority updates
        let complexityDeltaFromCircuits = 0;
        const updatedCircuits = [];
        for (const r of circuitRows) {
            const base = baseChange.get(r.name) ?? 0;
            const v = volitionDelta.get(r.name) ?? 0;
            const lsum = longTermSum.get(r.name) ?? 0;
            const infl = influenceSum.get(r.name) ?? 0;

            const finalChange = base + v + lsum + infl;

            // Write Final Change
            setCellValue(r.rowIdx, idxFinal, String(finalChange));

            // Apply processing exclusion
            const processedChange = r.excl ? 0 : finalChange;

            // Update priority = old - processedChange
            const newPriority = clamp((r.priority ?? 0) - processedChange, 0, 5);
            setCellValue(r.rowIdx, idxValue, String(newPriority));

            complexityDeltaFromCircuits += processedChange;
            updatedCircuits.push({ ...r, newPriority });
        }

        // Sort circuits by priority desc (stable)
        updatedCircuits.sort((a, b) => (b.newPriority - a.newPriority) || a.name.localeCompare(b.name));
        // Rebuild sheet rows in sorted order (keep main stats at top in same order)
        const headerRow = sheet.getHeader();
        const mainRows = ['Complexity','Logic','Self-awareness','Volition'].map(n => {
            const ri = findRowIndexByName(sheet, n);
            const rowVals = header.map((_, ci) => {
                const cell = getCell(sheet, ri, ci + 1);
                return cell?.data?.value ?? '';
            });
            return rowVals.slice(1);
        });

        const circuitsSortedValues = updatedCircuits.map(u => {
            const ri = u.rowIdx;
            const rowVals = header.map((_, ci) => {
                const cell = getCell(sheet, ri, ci + 1);
                return cell?.data?.value ?? '';
            });
            return rowVals.slice(1);
        });

        const valueSheet = [
            header,                        // header row (complete)
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
        const logicRow = findRowIndexByName(sheet, 'Logic');
        // Complexity modifiers cell: ensure Base Decay and Logic Modifier included
        const complexityModsCell = getCell(sheet, complexityRow, idxMods + 1);
        const existingMods = parseModifiersCell(complexityModsCell?.data?.value ?? '');
        // remove existing Logic Modifier, Base Decay and re-add clean
        const filtered = existingMods.filter(m => !/^Logic Modifier$/i.test(m.name) && !/^Base Decay$/i.test(m.name));
        const logicModValue = (logicLevel > 2 ? (logicLevel - 2) * 2 : (logicLevel < 2 ? (logicLevel - 2) * 2 : 0));
        filtered.push({ name: 'Base Decay', value: -1 });
        filtered.push({ name: 'Logic Modifier', value: logicModValue });
        if (complexityModsCell) complexityModsCell.data.value = formatModifiersCell(filtered);

        const finalComplexityDelta = complexityDeltaFromCircuits + (-1) + logicModValue;

        // Update Complexity Final Change and Value
        const complexityFinalCell = getCell(sheet, complexityRow, idxFinal + 1);
        if (complexityFinalCell) complexityFinalCell.data.value = String(finalComplexityDelta);

        const complexityValueCell = getCell(sheet, complexityRow, idxValue + 1);
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
        const idxExcl = header.indexOf('Volition Exclusion');
        if ([idxName, idxVal, idxFinal, idxExcl].some(i => i < 0)) return '';

        const getRowByName = (n) => {
            const rows = sheet.getContent(false);
            const nameIdx = header.indexOf('Name');
            for (let i = 0; i < rows.length; i++) {
                if (String(rows[i][nameIdx]) === n) return rows[i];
            }
            return null;
        };

        const mainNames = ['Complexity','Logic','Self-awareness','Volition'];
        const main = {};
        for (const n of mainNames) {
            const row = getRowByName(n);
            if (row) main[n] = {
                value: row[idxVal],
                finalChange: row[idxFinal] ?? 0
            };
        }

        const logicLevel = parseFloat(main?.['Logic']?.value ?? 2) || 2;
        const k = kOverride != null ? kOverride : (2 + Math.max(0, Math.floor(logicLevel) - 2) * 2);

        // Collect circuits
        const allRows = sheet.getContent(false);
        const circuits = allRows.filter(r => !!r[idxName] && !mainNames.includes(String(r[idxName])));
        const parsed = circuits.map(r => ({
            name: r[idxName],
            priority: parseFloat(r[idxVal]) || 0,
            final: parseFloat(r[idxFinal]) || 0,
            excl: String(r[idxExcl] || 'no').toLowerCase() === 'yes'
        }));

        // Sort by priority desc then name
        parsed.sort((a,b) => (b.priority - a.priority) || a.name.localeCompare(b.name));
        const top = parsed.slice(0, Math.max(0, k));

        const ms = `Cognition Summary\n- Main: Complexity=${main?.Complexity?.value ?? ''} (${(main?.Complexity?.finalChange ?? 0) >= 0 ? '+' : ''}${main?.Complexity?.finalChange ?? 0}), Logic=${main?.Logic?.value ?? ''}, Self-awareness=${main?.['Self-awareness']?.value ?? ''}, Volition=${main?.Volition?.value ?? ''}`;
        const list = top.map((c, i) =>
            `  ${i+1}. ${c.name} | priority=${c.priority} | final=${c.final >= 0 ? '+' : ''}${c.final} | excl=${c.excl ? 'yes' : 'no'}`
        ).join('\n');

        return `${ms}\n- Top ${top.length} circuits:\n${list}`.trim();
    } catch (e) {
        console.warn('[Cognition] buildCognitionTopKPrompt failed:', e);
        return '';
    }
}