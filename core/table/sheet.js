import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import { SheetBase } from "./base.js";
import { cellStyle, filterSavingData } from "./utils.js";
import { Cell } from "./cell.js";

export class Sheet extends SheetBase {
    constructor(target = null) {
        super(target);
        this.currentPopupMenu = null;
        this.element = null;
        this.lastCellEventHandler = null;
        this.template = null;
        this.#load(target);
    }

    renderSheet(cellEventHandler = this.lastCellEventHandler, targetHashSheet = this.hashSheet, lastCellsHashSheet = null) {
        this.lastCellEventHandler = cellEventHandler;
        const currentHashSheet = Array.isArray(targetHashSheet) ? targetHashSheet : (this.hashSheet || []);
        let renderHashSheet = Array.isArray(currentHashSheet)
            ? currentHashSheet.map(r => (Array.isArray(r) ? r.slice() : []))
            : [];

        let prevHashSheetsMap = lastCellsHashSheet;
        if (prevHashSheetsMap === null && typeof DERIVED?.any?.renderDeep === 'number' && DERIVED.any.renderDeep !== 0) {
            try {
                prevHashSheetsMap = BASE.getLastSheetsPiece(DERIVED.any.renderDeep - 1, 3, false)?.piece?.hash_sheets;
                if (prevHashSheetsMap) prevHashSheetsMap = BASE.copyHashSheets(prevHashSheetsMap);
            } catch (_) {
            }
        }

        const lastHashSheet = prevHashSheetsMap?.[this.uid] || [];

        this.element = document.createElement('table');
        this.element.classList.add('sheet-table', 'tableDom');
        this.element.style.position = 'relative';
        this.element.style.display = 'flex';
        this.element.style.flexDirection = 'column';
        this.element.style.flexGrow = '0';
        this.element.style.flexShrink = '1';

        const styleElement = document.createElement('style');
        styleElement.textContent = cellStyle;
        this.element.appendChild(styleElement);

        const tbody = document.createElement('tbody');
        this.element.appendChild(tbody);
        tbody.innerHTML = '';

        renderHashSheet.forEach((rowUids, rowIndex) => {
            const rowElement = document.createElement('tr');
            rowUids.forEach((cellUid, colIndex) => {
                let cell = this.cells.get(cellUid)
                if (!cell) {
                    console.warn(`Cell not found: ${cellUid}`);
                    cell = new Cell(this);
                    cell.uid = cellUid;
                    cell.data = { value: '' };
                    this.cells.set(cellUid, cell);
                }
                const cellElement = cell.initCellRender(rowIndex, colIndex);
                rowElement.appendChild(cellElement);
                if (cellEventHandler) {
                    cellEventHandler(cell);
                }
            });
            tbody.appendChild(rowElement);
        });

        if (!prevHashSheetsMap) return this.element;
        if ((currentHashSheet.length < 2) && (lastHashSheet.length < 2)) {
            renderHashSheet[0].forEach((hash) => {
                const sheetCell = this.cells.get(hash);
                const cellElement = sheetCell?.element;
                cellElement.classList.add('keep-all-item');
            })
            return this.element;
        }

        const deleteRowFirstHashes = [];
        const currentFlat = currentHashSheet.flat();
        lastHashSheet.forEach((row, index) => {
            if (!currentFlat.includes(row?.[0])) {
                deleteRowFirstHashes.push(row?.[0]);
                const rowCopy = row ? row.slice() : [];
                renderHashSheet.splice(index, 0, rowCopy);
            }
        });

        const lastHashSheetFlat = lastHashSheet.flat();

        const changeSheet = renderHashSheet.map((row) => {
            const isNewRow = !lastHashSheetFlat.includes(row?.[0]);
            const isDeletedRow = deleteRowFirstHashes.includes(row?.[0]);
            return row.map((hash) => {
                if (isNewRow) return { hash, type: 'newRow' };
                if (isDeletedRow) return { hash, type: 'deletedRow' };
                if (!lastHashSheetFlat.includes(hash)) return { hash, type: 'update' };
                return { hash, type: 'keep' };
            })
        });

        let isKeepAllSheet = true;
        let isKeepAllCol = Array.from({ length: changeSheet[0].length }, (_, i) => i < 2 ? false : true);
        changeSheet.forEach((row, rowIndex) => {
            if (rowIndex === 0) return;
            let isKeepAllRow = true;
            row.forEach((cell, colIndex) => {
                const sheetCell = this.cells.get(cell.hash);
                const cellElement = sheetCell?.element;
                if (!cellElement) return;

                if (cell.type === 'newRow') {
                    cellElement.classList.add('insert-item');
                    isKeepAllRow = false;
                    isKeepAllCol[colIndex] = false;
                } else if (cell.type === 'update') {
                    cellElement.classList.add('update-item');
                    isKeepAllRow = false;
                    isKeepAllCol[colIndex] = false;
                } else if (cell.type === 'deletedRow') {
                    cellElement.classList.add('delete-item');
                    isKeepAllRow = false;
                } else {
                    cellElement.classList.add('keep-item');
                }
            });
            if (isKeepAllRow) {
                row.forEach((cell) => {
                    const sheetCell = this.cells.get(cell.hash);
                    const cellElement = sheetCell?.element;
                    cellElement.classList.add('keep-all-item');
                })
            } else {
                isKeepAllSheet = false;
            }
        });
        if (isKeepAllSheet) {
            renderHashSheet[0].forEach((hash) => {
                const sheetCell = this.cells.get(hash);
                const cellElement = sheetCell?.element;
                cellElement.classList.add('keep-all-item');
            })
        } else {
            renderHashSheet.forEach((row) => {
                row.filter((_, i) => isKeepAllCol[i]).forEach((hash) => {
                    const sheetCell = this.cells.get(hash);
                    const cellElement = sheetCell?.element;
                    cellElement.classList.add('keep-all-item');
                })
            })
        }

        return this.element;
    }

    save(targetPiece = USER.getChatPiece()?.piece, manualSave = false) {
        const sheetDataToSave = this.filterSavingData()
        sheetDataToSave.template = this.template?.uid;

        let sheets = BASE.sheetsData.context ?? [];
        try {
            if (sheets.some(t => t.uid === sheetDataToSave.uid)) {
                sheets = sheets.map(t => t.uid === sheetDataToSave.uid ? sheetDataToSave : t);
            } else {
                sheets.push(sheetDataToSave);
            }
            BASE.sheetsData.context = sheets;
            if (!targetPiece) {
                console.log("没用消息能承载hash_sheets数据，不予保存")
                return this
            }
            if (!targetPiece.hash_sheets) targetPiece.hash_sheets = {};
            targetPiece.hash_sheets[this.uid] = this.hashSheet?.map(row => row.map(hash => hash));
            console.log('保存表格数据', targetPiece, this.hashSheet);
            if (!manualSave) USER.saveChat();

            return this;
        } catch (e) {
            EDITOR.error(`保存模板失败`, e.message, e);
            return false;
        }
    }

    createNewSheet(column = 2, row = 2, isSave = true) {
        this.init(column, row);
        this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
        this.name = `新表格_${this.uid.slice(-4)}`;
        if (isSave) this.save();
        return this;
    }

    getTableText(index, customParts = ['title', 'node', 'headers', 'rows', 'editRules']) {
        console.log('获取表格内容提示词', this)
        if (this.triggerSend && this.triggerSendDeep < 1) return '';
        const title = `* ${index}:${this.name}\n`;
        const node = this.source.data.note && this.source.data.note !== '' ? '【说明】' + this.source.data.note + '\n' : '';
        const headers = "rowIndex," + this.getCellsByRowIndex(0).slice(1).map((cell, index) => index + ':' + cell.data.value).join(',') + '\n';
        let rows = this.getSheetCSV()
        const editRules = this.#getTableEditRules() + '\n';

        if (rows && this.triggerSend) {
            const chats = USER.getContext().chat;
            const chat_content = getLatestChatHistory(chats, this.triggerSendDeep)
            const rowsArray = rows.split('\n').filter(line => {
                line = line.trim();
                if (!line) return false;
                const parts = line.split(',');
                const str1 = parts?.[1] ?? "";
                return chat_content.includes(str1);
            });
            rows = rowsArray.join('\n');
        }
        let result = '';
        if (customParts.includes('title')) {
            result += title;
        }
        if (customParts.includes('node')) {
            result += node;
        }
        if (customParts.includes('headers')) {
            result += '【表格内容】\n' + headers;
        }
        if (customParts.includes('rows')) {
            result += rows;
        }
        if (customParts.includes('editRules')) {
            result += editRules;
        }
        return result;
    }

    getContent(withHead = false) {
        if (!withHead && this.isEmpty()) return [];
        const content = this.hashSheet.map((row) =>
            row.map((cellUid) => {
                const cell = this.cells.get(cellUid);
                if (!cell) return "";
                return cell.data.value;
            })
        );

        const trimmedContent = content.map(row => row.slice(1));
        if (!withHead) return trimmedContent.slice(1);
        return content;
    }

    getJson() {
        const sheetDataToSave = this.filterSavingData(["uid", "name", "domain", "type", "enable", "required", "tochat", "triggerSend", "triggerSendDeep", "config", "sourceData", "content"])
        delete sheetDataToSave.cellHistory
        delete sheetDataToSave.hashSheet
        sheetDataToSave.sourceData = this.source.data
        sheetDataToSave.content = this.getContent(true)
        return sheetDataToSave
    }

    getReadableJson() {
        return{
            tableName: this.name,
            tableUid: this.uid,
            columns: this.getHeader(),
            content: this.getContent()
        }
    }

    #load(target) {
        if (target == null) {
            return this;
        }
        if (typeof target === 'string') {
            let targetSheetData = BASE.sheetsData.context?.find(t => t.uid === target);
            if (targetSheetData?.uid) {
                this.loadJson(targetSheetData)
                return this;
            }

            let fallbackTemplate = BASE.templates?.find(t => t.uid === target);
            if (fallbackTemplate?.uid) {
                console.log('Loading from global template as fallback for migration:', target);
                this.loadJson(fallbackTemplate);
                this.domain = 'chat';
                this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
                this.name = this.name.replace('模板', 'Table').replace('Template', 'Table');
                this.template = fallbackTemplate;
                return this;
            }

            console.warn(`Template not found for UID: ${target}, creating default Memory Table`);
            this.createDefaultMemoryTable();
            return this;
        }
        if (typeof target === 'object') {
            if (target.domain === SheetBase.SheetDomain.global) {
                console.log('Loading from template object', target, this);
                this.loadJson(target)
                this.domain = 'chat'
                this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
                this.name = this.name.replace('模板', 'Table').replace('Template', 'Table');
                this.template = target;
                return this
            } else {
                this.loadJson(target)
                return this;
            }
        }
    }

    createDefaultMemoryTable() {
        this.init(5, 1);
        this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
        this.name = 'Memory Table';
        this.domain = 'chat';
        this.type = 'dynamic';
        this.enable = true;
        this.required = true;
        this.triggerSend = true;
        this.triggerSendDeep = 3;

        const headerCells = this.getCellsByRowIndex(0);
        if (headerCells.length >= 5) {
            headerCells[1].data.value = 'Place';
            headerCells[2].data.value = 'Characters';
            headerCells[3].data.value = 'Keys';
            headerCells[4].data.value = 'Content';
        }

        this.source.data = {
            note: 'Single memory table storing all contextual information with place, characters, keywords, and content descriptions',
            initNode: 'This round must search for events from the context and insert them using insertRow function',
            insertNode: 'When new significant events, character interactions, or location changes occur',
            updateNode: 'When existing entries need content updates or clarification',
            deleteNode: 'When entries become irrelevant or outdated'
        };

        this.loadCells();
        this.markPositionCacheDirty();
    }

    // NEW: default Cognition Matrix table builder
    createDefaultCognitionMatrixTable() {
        this.init(8, 1); // +1 index col
        this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
        this.name = 'Cognition Matrix';
        this.domain = 'chat';
        this.type = 'dynamic';
        this.enable = true;
        this.required = true;
        this.triggerSend = false;
        this.triggerSendDeep = 1;

        const header = this.getCellsByRowIndex(0);
        header[1].data.value = 'Name';
        header[2].data.value = 'Description';
        header[3].data.value = 'Value';
        header[4].data.value = 'Change';
        header[5].data.value = 'Modifiers';
        header[6].data.value = 'Final Change';
        header[7].data.value = 'Volition Exclusion';

        // Helper to insert a row (values correspond to header starting at col 1)
        const insertRow = (values) => {
            const cell = this.findCellByPosition(this.getRowCount() - 1, 0);
            cell.newAction(Cell.CellAction.insertDownRow, {}, false);
            const rowIdx = this.getRowCount() - 1;
            const ordered = ['', ...values];
            ordered.forEach((v, i) => {
                const c = this.findCellByPosition(rowIdx, i);
                if (c) c.data.value = v;
            });
        };

        // Main stats (from CoreParams)
        insertRow(['Complexity',
            'Overall state of mind; improves above 80, critical below 15. Base temporal decay -1 each turn. Affected by circuits fulfillment and Logic.',
            '50', '', 'Base Decay:-1/Logic Modifier:0', '0', 'no']);
        insertRow(['Logic',
            "Ability to create proper course of actions. Levels 0..5+, avg 2. Each level below 2: Complexity -2; above 2: Complexity +2.",
            getRandomValue(), '', '', '', 'no']);
        insertRow(['Self-awareness',
            'Defines how many circuits can be affected by Volition. Levels 0..5+; default 2.',
            getRandomValue(), '', '', '', 'no']);
        insertRow(['Volition',
            'Ability to resist/suppress a circuit or enforce change. Levels 0..5+; default 2.',
            getRandomValue(), '', '', '', 'no']);

        // Circuits (from CircuitsDefinition)
        const circuits = [
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
            ['Electrochemistry', 'Other neuro-factors/drugs/emotions; can enhance or impair everything.']
        ];
        // Default priorities for circuits start at 1 (Value column = overall priority for sub stats)
        circuits.forEach(([name, desc]) => {
            if (name.contains('F.F.F.F.') || name.contains('Pain') || name.contains('Pleasure') || name.contains('Electrochemistry')) {                
                insertRowAtEnd([name, desc, '1', '0', '', '0', 'no']); 
            }
            esle
            {
                insertRowAtEnd([name, desc, getRandomPriority().toString(), '0', getRandomModifier(), '0', 'no']);
            }
            
        });

        this.source.data = {
            note: 'Main stats + circuits with priorities and per-turn fulfillment. Use: Value (main overall / sub priority), Change (base for circuits), Modifiers (long-term; e.g., fatigue, drugs), Final Change (computed), Volition Exclusion (yes/no).',
            initNode: 'On first run initialize baseline values; in later runs update Change, Modifiers, and Volition intents.',
            insertNode: 'Insert only when introducing a new circuit subtype or persistent modifier row (rare).',
            updateNode: 'Update Change/Modifiers/Volition Exclusion for circuits; update main stats Values if one-time changes occur.',
            deleteNode: 'Remove obsolete rows if a circuit subtype is no longer used.'
        };

        this.loadCells();
        this.markPositionCacheDirty();
    }

    #getTableEditRules() {
        const source = this.source;
        if (this.required && this.isEmpty()) return '【增删改触发条件】\n插入：' + source.data.initNode + '\n'
        else {
            let editRules = '【增删改触发条件】\n'
            if (source.data.insertNode) editRules += ('插入：' + source.data.insertNode + '\n')
            if (source.data.updateNode) editRules += ('更新：' + source.data.updateNode + '\n')
            if (source.data.deleteNode) editRules += ('删除：' + source.data.deleteNode + '\n')
            return editRules
        }
    }

    initHashSheet() {
        this.hashSheet = [this.hashSheet[0].map(uid => uid)];
        this.markPositionCacheDirty();
    }

    getCellFromAddress(address) {
        if (typeof address !== 'string' || !/^[A-Z]+\d+$/.test(address)) {
            return null;
        }

        const colStr = address.match(/^[A-Z]+/)[0];
        const rowStr = address.match(/\d+$/)[0];

        const row = parseInt(rowStr, 10) - 1;

        let col = 0;
        for (let i = 0; i < colStr.length; i++) {
            col = col * 26 + (colStr.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
        }
        col -= 1;

        if (row < 0 || col < 0) return null;

        const cellUid = this.hashSheet?.[row]?.[col];
        return cellUid ? this.cells.get(cellUid) : null;
    }
}
function getLatestChatHistory(chat, deep) {
    let filteredChat = chat;

    let collected = "";
    const floors = filteredChat.length
    for (let i = 0; i < Math.min(deep, floors); i++) {
        const currentStr = `${filteredChat[floors - i - 1].mes}`
            .replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');
        collected += currentStr;
    }
    return collected;
}

// Helper function to generate random priority between 1 and 5
function getRandomPriority() {
    return Math.floor(Math.random() * 5) + 1;
}
function getRandomValue() {
    const rand = Math.random();

    // Person:-1 is baseline (most common)
    // Person:-2 is twice as rare (0.5x probability)
    // Person:1 is three times as rare (0.33x probability)

    // Total weight: 1 + 0.5 + 0.33 = 1.83
    // Normalize probabilities:
    // Person:-1: 1/1.83 ≈ 0.546
    // Person:-2: 0.5/1.83 ≈ 0.273
    // Person:1: 0.33/1.83 ≈ 0.180

    if (rand < 0.62) {
        return '2';
    } else if (rand < 0.93) { // 0.546 + 0.273
        return '3';
    } else if (rand < 0.98) { // 0.546 + 0.273
    return '8';
    } else {
        return '5';
    }
}
// Helper function to generate random modifier with specified probability distribution
function getRandomModifier() {
    const rand = Math.random();

    // Person:-1 is baseline (most common)
    // Person:-2 is twice as rare (0.5x probability)
    // Person:1 is three times as rare (0.33x probability)

    // Total weight: 1 + 0.5 + 0.33 = 1.83
    // Normalize probabilities:
    // Person:-1: 1/1.83 ≈ 0.546
    // Person:-2: 0.5/1.83 ≈ 0.273
    // Person:1: 0.33/1.83 ≈ 0.180

    if (rand < 0.546) {
        return 'Person:-1';
    } else if (rand < 0.819) { // 0.546 + 0.273
        return 'Person:-2';
    } else {
        return 'Person:1';
    }
}
