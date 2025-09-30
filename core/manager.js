import { TTable } from "./tTableManager.js";
import applicationFunctionManager from "../services/appFuncManager.js";
import { consoleMessageToEditor } from "../scripts/settings/devConsole.js";
import { calculateStringHash, generateRandomNumber, generateRandomString, lazy, readonly, } from "../utils/utility.js";
import { defaultSettings } from "../data/pluginSetting.js";
import { Drag } from "../components/dragManager.js";
import { PopupMenu } from "../components/popupMenu.js";
import { buildSheetsByTemplates, convertOldTablesToNewSheets } from "../index.js";
import { getRelativePositionOfCurrentCode } from "../utils/codePathProcessing.js";
import { pushCodeToQueue } from "../components/_fotTest.js";
import { createProxy, createProxyWithUserSetting } from "../utils/codeProxy.js";
import { refreshTempView } from '../scripts/editor/tableTemplateEditView.js';
import { newPopupConfirm, PopupConfirm } from "../components/popupConfirm.js";
import { refreshContextView } from "../scripts/editor/chatSheetsDataView.js";
import { updateSystemMessageTableStatus } from "../scripts/renderer/tablePushToChat.js";
import {taskTiming} from "../utils/system.js";
import {updateSelectBySheetStatus} from "../scripts/editor/tableTemplateEditView.js";

let derivedData = {}

export const APP = applicationFunctionManager
export const USER = {
    getSettings: () => APP.power_user,
    getExtensionSettings: () => APP.extension_settings,
    saveSettings: () => APP.saveSettings(),
    saveChat: () => APP.saveChat(),
    getContext: () => APP.getContext(),
    isSwipe:()=>
    {
        const chats = USER.getContext().chat || [];
        const lastChat = chats[chats.length - 1];
        const isIncludeEndIndex = (!lastChat) || lastChat.is_user === true;
        // FIX: use comparison; do not assign to const
        if (isIncludeEndIndex === false)
        {
            const {deep} = USER.getChatPiece()
            return {isSwipe: true, deep}
        }
        return {isSwipe: false}
    },
    getChatPiece: (deep = 0, direction = 'up') => {
        const chat = APP.getContext().chat;
        if (!chat || chat.length === 0 || deep >= chat.length) return  {piece: null, deep: -1};
        let index = chat.length - 1 - deep
        while (chat[index].is_user === true) {
            if(direction === 'up')index--
            else index++
            if (!chat[index]) return {piece: null, deep: -1};
        }
        return {piece:chat[index], deep: index};
    },
    loadUserAllTemplates() {
        let templates = USER.getSettings().table_database_templates;
        if (!Array.isArray(templates)) {
            templates = [];
            USER.getSettings().table_database_templates = templates;
            USER.saveSettings();
        }
        console.log("全局模板", templates)
        return templates;
    },
    tableBaseSetting: createProxyWithUserSetting('muyoo_dataTable'),
    tableBaseDefaultSettings: { ...defaultSettings },
    IMPORTANT_USER_PRIVACY_DATA: createProxyWithUserSetting('IMPORTANT_USER_PRIVACY_DATA', true),
}

export const BASE = {
    Sheet: TTable.Sheet,
    SheetTemplate: TTable.Template,
    refreshContextView: refreshContextView,
    refreshTempView: refreshTempView,
    updateSystemMessageTableStatus: updateSystemMessageTableStatus,
    updateSelectBySheetStatus: updateSelectBySheetStatus,
    get templates() {
        return USER.loadUserAllTemplates()
    },
    contextViewRefreshing: false,
    sheetsData: new Proxy({}, {
        get(_, target) {
            switch (target) {
                case 'all':

                case 'context':
                    if (!USER.getContext().chatMetadata) {
                        USER.getContext().chatMetadata = {};
                    }
                    if (!USER.getContext().chatMetadata.sheets) {
                        USER.getContext().chatMetadata.sheets = [];
                    }
                    return USER.getContext().chatMetadata.sheets;
                case 'global':

                case 'role':

                default:
                    throw new Error(`Unknown sheetsData target: ${target}`);
            }
        },
        set(_, target, value) {
            switch (target) {
                case 'context':
                    if (!USER.getContext().chatMetadata) {
                        USER.getContext().chatMetadata = {};
                    }
                    USER.getContext().chatMetadata.sheets = value;
                    return true;
                case 'all':
                case 'global':
                case 'role':
                default:
                    throw new Error(`Cannot set sheetsData target: ${target}`);
            }
        }
    }),
    getChatSheets(process=() => {}) {
        DERIVED.any.chatSheetMap = DERIVED.any.chatSheetMap || {}
        const sheets = []

        // Ensure BASE.sheetsData.context exists
        if (!BASE.sheetsData.context || BASE.sheetsData.context.length === 0) {
            console.log("No chat sheets found, attempting to create default from templates");
            BASE.initHashSheet(); // This will create default tables from templates
        }

        BASE.sheetsData.context.forEach(sheet => {
            try {
                if (!DERIVED.any.chatSheetMap[sheet.uid]) {
                    const newSheet = new BASE.Sheet(sheet.uid)
                    DERIVED.any.chatSheetMap[sheet.uid] = newSheet
                }
                process(DERIVED.any.chatSheetMap[sheet.uid])
                sheets.push(DERIVED.any.chatSheetMap[sheet.uid])
            } catch (error) {
                console.error(`Failed to load sheet with UID ${sheet.uid}:`, error);
                // Fallback: create Memory + Cognition default sheets
                try {
                    const memory = new BASE.Sheet(); memory.createDefaultMemoryTable();
                    const cognition = new BASE.Sheet(); cognition.createDefaultCognitionMatrixTable();
                    const {piece} = USER.getChatPiece() || {};
                    memory.save(piece, true);
                    cognition.save(piece, true);
                    DERIVED.any.chatSheetMap[memory.uid] = memory;
                    DERIVED.any.chatSheetMap[cognition.uid] = cognition;
                    process(memory); process(cognition);
                    sheets.push(memory, cognition);
                } catch (fallbackError) {
                    console.error('Failed to create fallback sheets:', fallbackError);
                }
            }
        })
        return sheets
    },
    getChatSheet(uid){
        const sheet = DERIVED.any.chatSheetMap[uid]
        if (!sheet) {
            if(!BASE.sheetsData.context.some(sheet => sheet.uid === uid)) return null
            const newSheet = new BASE.Sheet(uid)
            DERIVED.any.chatSheetMap[uid] = newSheet
            return newSheet
        }
        return sheet
    },
    createChatSheetByTemp(temp){
        DERIVED.any.chatSheetMap = DERIVED.any.chatSheetMap || {}
        const newSheet = new BASE.Sheet(temp);
        DERIVED.any.chatSheetMap[newSheet.uid] = newSheet
        return newSheet
    },
    createChatSheet(cols, rows){
        const newSheet = new BASE.Sheet();
        newSheet.createNewSheet(cols, rows, false);
        DERIVED.any.chatSheetMap[newSheet.uid] = newSheet
        return newSheet
    },
    createChatSheetByJson(json){
        const newSheet = new BASE.Sheet();
        newSheet.loadJson(json);
        DERIVED.any.chatSheetMap[newSheet.uid] = newSheet
        return newSheet
    },
    copyHashSheets(hashSheets) {
        const newHashSheet = {}
        for (const sheetUid in hashSheets) {
            const hashSheet = hashSheets[sheetUid];
            newHashSheet[sheetUid] = hashSheet.map(row => row.map(hash => hash));
        }
        return newHashSheet
    },
    applyJsonToChatSheets(json, type ="both") {
        const newSheets = Object.entries(json).map(([sheetUid, sheetData]) => {
            if(sheetUid === 'mate') return null
            const sheet = BASE.getChatSheet(sheetUid);
            if (sheet) {
                sheet.loadJson(sheetData)
                return sheet
            } else {
                if(type === 'data') return null
                else return BASE.createChatSheetByJson(sheetData)
            }
        }).filter(Boolean)
        if(type === 'data') return BASE.saveChatSheets()
        const oldSheets = BASE.getChatSheets().filter(sheet => !newSheets.some(newSheet => newSheet.uid === sheet.uid))
        oldSheets.forEach(sheet => sheet.enable = false)
        console.log("应用表格数据", newSheets, oldSheets)
        const mergedSheets = [...newSheets, ...oldSheets]
        BASE.reSaveAllChatSheets(mergedSheets)
    },
    saveChatSheets(saveToPiece = true) {
        if(saveToPiece){
            const {piece} = USER.getChatPiece()
            if(!piece) return EDITOR.error("没有记录载体，表格是保存在聊天记录中的，请聊至少一轮后再重试")
            BASE.getChatSheets(sheet => sheet.save(piece, true))
        }else BASE.getChatSheets(sheet => sheet.save(undefined, true))
        USER.saveChat()
    },
    reSaveAllChatSheets(sheets) {
        BASE.sheetsData.context = []
        const {piece} = USER.getChatPiece()
        if(!piece) return EDITOR.error("没有记录载体，表格是保存在聊天记录中的，请聊至少一轮后再重试")
        sheets.forEach(sheet => {
            sheet.save(piece, true)
        })
        updateSelectBySheetStatus()
        BASE.refreshTempView(true)
        USER.saveChat()
    },
    getLastSheetsPiece(deep = 0, cutoff = 1000, deepStartAtLastest = true, direction = 'up') {
        console.log("向上查询表格数据，深度", deep, "截断", cutoff, "从最新开始", deepStartAtLastest)
        const chat = APP.getContext().chat
        if (!chat || chat.length === 0 || chat.length <= deep) {
            return { deep: -1, piece: BASE.initHashSheet() }
        }
        const startIndex = deepStartAtLastest ? chat.length - deep - 1 : deep;
        for (let i = startIndex;
            direction === 'up' ? (i >= 0 && i >= startIndex - cutoff) : (i < chat.length && i < startIndex + cutoff);
            direction === 'up' ? i-- : i++) {
            if (chat[i].is_user === true) continue;
            if (chat[i].hash_sheets) {
                console.log("向上查询表格数据，找到表格数据", chat[i])
                return { deep: i, piece: chat[i] }
            }
            if (chat[i].dataTable) {
                console.log("找到旧表格数据", chat[i])
                convertOldTablesToNewSheets(chat[i].dataTable, chat[i])
                return { deep: i, piece: chat[i] }
            }
        }
        return { deep: -1, piece: BASE.initHashSheet() }
    },
    getReferencePiece(){
        const swipeInfo = USER.isSwipe()
        console.log("获取参考片段", swipeInfo)
        const {piece} = swipeInfo.isSwipe?swipeInfo.deep===-1?{piece:BASE.initHashSheet()}: BASE.getLastSheetsPiece(swipeInfo.deep-1,1000,false):BASE.getLastSheetsPiece()
        return piece
    },
    hashSheetsToSheets(hashSheets) {
        if (!hashSheets) {
            return [];
        }
        return BASE.getChatSheets((sheet)=>{
            if (hashSheets[sheet.uid]) {
                sheet.hashSheet = hashSheets[sheet.uid].map(row => row.map(hash => hash));
            }else sheet.initHashSheet()
        })
    },
    getLastestSheets(){
        const { piece, deep } = BASE.getLastSheetsPiece();
        if (!piece || !piece.hash_sheets) return
        return BASE.hashSheetsToSheets(piece.hash_sheets);
    },
    initHashSheet() {
        if (BASE.sheetsData.context.length === 0) {
            console.log("尝试从模板中构建表格数据")
            const {piece: currentPiece} = USER.getChatPiece()
            try {
                buildSheetsByTemplates(currentPiece)
                if (currentPiece?.hash_sheets) {
                    console.log('成功从模板创建表格', currentPiece)
                    return currentPiece
                }
            } catch (templateError) {
                console.warn('从模板构建失败，将创建默认的 Memory + Cognition 表格:', templateError);
            }
            try {
                const memory = BASE.createChatSheet(5, 1);
                memory.createDefaultMemoryTable();
                const cognition = BASE.createChatSheet(8, 1);
                cognition.createDefaultCognitionMatrixTable();
                const { piece } = USER.getChatPiece() || {};
                memory.save(piece, true);
                cognition.save(piece, true);
                const hash_sheets = {}
                hash_sheets[memory.uid] = memory.hashSheet.map(row => row.map(hash => hash));
                hash_sheets[cognition.uid] = cognition.hashSheet.map(row => row.map(hash => hash));
                if (currentPiece) {
                    currentPiece.hash_sheets = hash_sheets;
                    return currentPiece;
                } else {
                    return { hash_sheets };
                }
            } catch (defaultError) {
                console.error('创建默认表格失败:', defaultError);
                return { hash_sheets: {} };
            }
        }
        // FIX: return full hashSheet for each saved sheet, not only the header row
        const hash_sheets = {}
        BASE.sheetsData.context.forEach(sheet => {
            hash_sheets[sheet.uid] = sheet.hashSheet.map(row => row.map(hash => hash))
        })
        return { hash_sheets }
    },
    getTableSpecificRules(tableName) {
        switch(tableName) {
            case "Memory Table":
            case "Spacetime Table":
                return "retain only the latest row when multiple exist";
            case "Character Features Table":
                return "merge duplicate character entries";
            case "Character Social Table":
                return "delete rows containing <user>";
            default:
                return "apply standard processing rules";
        }
    },
    processTableByType(tableName, operation) {
        const englishTableName = this.translateTableName(tableName);
        switch(englishTableName) {
            case "Memory Table":
                return this.processMemoryTable(operation);
            case "Character Features Table":
                return this.processCharacterTable(operation);
            case "Character Social Table":
                return this.processSocialTable(operation);
            default:
                return this.processGenericTable(operation);
        }
    },
    translateTableName(chineseName) {
        const translations = {
            "时空表格": "Spacetime Table",
            "角色特征表格": "Character Features Table", 
            "角色与<user>社交表格": "Character Social Table",
            "任务、命令或者约定表格": "Tasks and Agreements Table",
            "重要事件历史表格": "Important Events History Table",
            "重要物品表格": "Important Items Table"
        };
        return translations[chineseName] || chineseName;
    }
};


/**
 * @description `Editor` 编辑器控制器
 * @description 该控制器用于管理编辑器的状态、事件、设置等数据，包括鼠标位置、聚焦面板、悬停面板、活动面板等
 * @description 编辑器自身数据应相对于其他数据相互独立，对于修改编辑器自身数据不会影响派生数据和用户数据，反之亦然
 * */
export const EDITOR = {
    Drag: Drag,
    PopupMenu: PopupMenu,
    Popup: APP.Popup,
    callGenericPopup: APP.callGenericPopup,
    POPUP_TYPE: APP.POPUP_TYPE,
    generateRaw: APP.generateRaw,
    getSlideToggleOptions: APP.getSlideToggleOptions,
    slideToggle: APP.slideToggle,
    confirm: newPopupConfirm,
    tryBlock: (cb, errorMsg, ...args) => {
        try {
            return cb(...args);
        } catch (e) {
            EDITOR.error(errorMsg ?? '执行代码块失败', e.message, e);
            return null;
        }
    },
    info: (message, detail = '', timeout = 500) => consoleMessageToEditor.info(message, detail, timeout),
    success: (message, detail = '', timeout = 500) => consoleMessageToEditor.success(message, detail, timeout),
    warning: (message, detail = '', timeout = 2000) => consoleMessageToEditor.warning(message, detail, timeout),
    error: (message, detail = '', error, timeout = 2000) => consoleMessageToEditor.error(message, detail, error, timeout),
    clear: () => consoleMessageToEditor.clear(),
    logAll: () => {
        SYSTEM.codePathLog({
            'user_table_database_setting': USER.getSettings().muyoo_dataTable,
            'user_tableBase_templates': USER.getSettings().table_database_templates,
            'context': USER.getContext(),
            'context_chatMetadata_sheets': USER.getContext().chatMetadata?.sheets,
            'context_sheets_data': BASE.sheetsData.context,
            'chat_last_piece': USER.getChatPiece()?.piece,
            'chat_last_sheet': BASE.getLastSheetsPiece()?.piece.hash_sheets,
            'chat_last_old_table': BASE.getLastSheetsPiece()?.piece.dataTable,
        }, 3);
    },
}


/**
 * @description `DerivedData` 项目派生数据管理器
 * @description 该管理器用于管理运行时的派生数据，包括但不限于中间用户数据、系统数据、库数据等
 * @description 请注意，敏感数据不能使用该派生数据管理器进行存储或中转
 * */
export const DERIVED = {
    get any() {
        return createProxy(derivedData);
    },
    // 移除旧的Table类引用，使用新的Sheet和SheetTemplate类
};


/**
 * @description `SYSTEM` 系统控制器
 * @description 该控制器用于管理系统级别的数据、事件、设置等数据，包括组件加载、文件读写、代码路径记录等
 */
export const SYSTEM = {
    getTemplate: (name) => {
        console.log('getTemplate', name);
        return APP.renderExtensionTemplateAsync('third-party/st-memory-enhancement/assets/templates', name);
    },

    codePathLog: function (context = '', deep = 2) {
        const r = getRelativePositionOfCurrentCode(deep);
        const rs = `${r.codeFileRelativePathWithRoot}[${r.codePositionInFile}] `;
        console.log(`%c${rs}${r.codeAbsolutePath}`, 'color: red', context);
    },
    lazy: lazy,
    generateRandomString: generateRandomString,
    generateRandomNumber: generateRandomNumber,
    calculateStringHash: calculateStringHash,

    // readFile: fileManager.readFile,
    // writeFile: fileManager.writeFile,

    taskTiming: taskTiming,
    f: (f, name) => pushCodeToQueue(f, name),
};
