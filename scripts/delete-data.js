"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const readline = __importStar(require("readline"));
const util = __importStar(require("util"));
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const IS_DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('-d');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
const question = util.promisify(rl.question).bind(rl);
const ALL_MODELS_IN_ORDER = [
    'SyncQueue',
    'RolePermission',
    'AuditLog',
    'ChurchConfig',
    'Ticket',
    'EventRegistration',
    'RecurringGiving',
    'Transaction',
    'Message',
    'FormSubmission',
    'Form',
    'Attendance',
    'Service',
    'FamilyMember',
    'Family',
    'Member',
    'Asset',
    'DepartmentMember',
    'Department',
    'CellGroup',
    'PastoralNote',
    'LifeEvent',
    'RiskScore',
    'EngagementScore',
    'Event',
    'GivingCategory',
    'Template',
    'Permission',
    'Role',
    'Profile',
    'Branch',
    'Church',
    'Generation',
];
const MODEL_GROUPS = [
    { name: 'System', models: ['AuditLog', 'ChurchConfig', 'Role', 'Permission', 'RolePermission', 'SyncQueue'] },
    { name: 'Administration & People', models: ['Church', 'Branch', 'Profile', 'Member', 'Family', 'FamilyMember'] },
    { name: 'Giving & Finance', models: ['GivingCategory', 'Transaction', 'RecurringGiving'] },
    { name: 'Attendance & Services', models: ['Service', 'Attendance'] },
    { name: 'Pastoral & Care', models: ['PastoralNote', 'LifeEvent', 'RiskScore', 'EngagementScore'] },
    { name: 'Events', models: ['Event', 'EventRegistration', 'Ticket'] },
    { name: 'Communication', models: ['Message', 'Template', 'Form', 'FormSubmission'] },
    { name: 'Assets & Organisations', models: ['Asset', 'Department', 'DepartmentMember', 'CellGroup'] },
];
const SOFT_DELETE_MODELS = {
    Member: { statusField: 'status', inactiveValue: 'inactive' },
};
const SPARKLE = `\x1b[33m*\x1b[0m`;
const YELLOW = `\x1b[33m`;
const RED = `\x1b[31m`;
const GREEN = `\x1b[32m`;
const CYAN = `\x1b[36m`;
const BOLD = `\x1b[1m`;
const RESET = `\x1b[0m`;
function red(s) { return `${RED}${s}${RESET}`; }
function green(s) { return `${GREEN}${s}${RESET}`; }
function yellow(s) { return `${YELLOW}${s}${RESET}`; }
function cyan(s) { return `${CYAN}${s}${RESET}`; }
function bold(s) { return `${BOLD}${s}${RESET}`; }
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
const adapter = new adapter_pg_1.PrismaPg({
    connectionString: process.env.DATABASE_URL,
});
const prisma = new client_1.PrismaClient({ adapter });
function prismaModel(name) {
    const model = prisma[name[0].toLowerCase() + name.slice(1)];
    if (!model) {
        throw new Error(`Model ${name} not found on PrismaClient`);
    }
    return model;
}
function getColumns(modelName) {
    const PrismaModule = require('@prisma/client');
    const dmmf = PrismaModule.Prisma.dmmf;
    const model = dmmf.datamodel.models.find((m) => m.name === modelName);
    if (!model)
        return [];
    return model.fields
        .filter((f) => !f.isRelation)
        .map((f) => f.name);
}
function getColumnType(modelName, column) {
    const PrismaModule = require('@prisma/client');
    const dmmf = PrismaModule.Prisma.dmmf;
    const model = dmmf.datamodel.models.find((m) => m.name === modelName);
    if (!model)
        return undefined;
    const field = model.fields.find((f) => f.name === column);
    if (!field)
        return undefined;
    return field.type;
}
async function prompt(message) {
    const q = message.endsWith(' ') ? message : `${message} `;
    return question(q);
}
async function confirmAction(description, requireTyping = false) {
    if (IS_DRY_RUN) {
        console.log(`${SPARKLE} Dry-run mode, skipping confirmation...`);
        return true;
    }
    console.log(red(`\nCAUTION: ${description}`));
    if (requireTyping) {
        const result = await prompt(`Type YES to confirm: `);
        if (result.trim() === 'YES')
            return true;
        console.log(red('Confirmation failed. Aborting.'));
        return false;
    }
    const result = await prompt(yellow('Are you sure? (y/N): '));
    const trimmed = result.trim().toLowerCase();
    if (trimmed === 'y' || trimmed === 'yes')
        return true;
    console.log(yellow('Operation cancelled.'));
    return false;
}
function clearScreen() {
    console.clear();
}
function printHeader() {
    console.log(`\n${BOLD}CHURCHOS Data Delete Utility${RESET}`);
    console.log(`${'-'.repeat(45)}`);
    if (IS_DRY_RUN) {
        console.log(red(`${bold('DRY-RUN MODE')} — No data will actually be deleted.`));
    }
    const dbUrl = process.env.DATABASE_URL || '';
    const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'unknown';
    const dbHost = dbUrl.split('@').pop()?.split('/')[0] || 'unknown';
    console.log(`Connected to database: ${cyan(dbName)} @ ${cyan(dbHost)}\n`);
}
function printWidow() {
    console.log(red(`${bold('WARNING:')} This tool can permanently delete data!`));
    console.log(red('Use with caution. Ensure you have a backup.'), '\n');
}
async function verifyDatabase(callback) {
    const dbUrl = process.env.DATABASE_URL || '';
    const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'unknown';
    console.log(`Verify the database you are connected to: ${cyan(dbName)}`);
    const confirmation = await prompt('Please type the database name to proceed: ');
    if (confirmation.trim() !== dbName) {
        console.log(red('Database name does not match. Exiting.'));
        process.exit(1);
    }
    await callback();
}
async function promptNumber(message, max, min = 1) {
    while (true) {
        const input = await prompt(message);
        const num = parseInt(input, 10);
        if (!isNaN(num) && num >= min && num <= max) {
            return num;
        }
        console.log(yellow(`Please enter a valid number between ${min} and ${max}.`));
    }
}
function printPreview(rows, columns) {
    if (rows.length === 0)
        return;
    const colWidths = columns.map((col) => {
        const header = col.length;
        const maxVal = rows.reduce((max, row) => Math.max(max, String(row[col] || '').length), 0);
        return Math.max(header, maxVal, 8);
    });
    const line = colWidths.map((w) => '+'.repeat(w + 2)).join('|');
    const headerRow = columns.map((col, i) => col.padEnd(colWidths[i])).join(' | ');
    console.log(` ${headerRow}`);
    console.log(` ${line}`);
    for (const row of rows.slice(0, 10)) {
        const cell = columns.map((col, i) => {
            const val = row[col] !== null && row[col] !== undefined ? String(row[col]) : '';
            if (val.length > 25) {
                return val.substring(0, 22) + '...';
            }
            return val.padEnd(colWidths[i]);
        }).join(' | ');
        console.log(` ${cell}`);
    }
    if (rows.length > 10) {
        console.log(yellow(`   ... and ${rows.length - 10} more row(s)`));
    }
}
async function countRecords(modelName) {
    const model = prismaModel(modelName);
    return model.count();
}
async function findRecords(modelName, field, value) {
    const model = prismaModel(modelName);
    const columnType = getColumnType(modelName, field);
    const isString = columnType === 'String';
    const isBool = columnType === 'Boolean';
    let val;
    if (isBool) {
        val = value.toLowerCase() === 'true';
    }
    else if (columnType === 'Int' || columnType === 'Float') {
        val = parseFloat(value);
    }
    else if (columnType === 'DateTime') {
        val = new Date(value);
    }
    else {
        val = value;
    }
    if (isString && val !== '') {
        return model.findMany({
            where: {
                [field]: { contains: val, mode: 'insensitive' },
            },
            take: 100,
        });
    }
    return model.findMany({
        where: { [field]: val },
        take: 100,
    });
}
async function countRecordsWhere(modelName, field, value) {
    const model = prismaModel(modelName);
    const columnType = getColumnType(modelName, field);
    const isString = columnType === 'String';
    const isBool = columnType === 'Boolean';
    let val;
    if (isBool) {
        val = value.toLowerCase() === 'true';
    }
    else if (columnType === 'Int' || columnType === 'Float') {
        val = parseFloat(value);
    }
    else if (columnType === 'DateTime') {
        val = new Date(value);
    }
    else {
        val = value;
    }
    if (isString && val !== '') {
        return model.count({
            where: {
                [field]: { contains: val, mode: 'insensitive' },
            },
        });
    }
    return model.count({ where: { [field]: val } });
}
async function findById(modelName, id) {
    const model = prismaModel(modelName);
    return model.findUnique({ where: { id } });
}
async function deleteAllRecordsInModel(modelName) {
    if (IS_DRY_RUN) {
        return 0;
    }
    const model = prismaModel(modelName);
    const result = await model.deleteMany({});
    return result.count;
}
async function deleteRecordsWhere(modelName, field, value) {
    if (IS_DRY_RUN)
        return 0;
    const model = prismaModel(modelName);
    const columnType = getColumnType(modelName, field);
    const isString = columnType === 'String';
    const isBool = columnType === 'Boolean';
    let val;
    if (isBool)
        val = value.toLowerCase() === 'true';
    else if (columnType === 'Int' || columnType === 'Float')
        val = parseFloat(value);
    else if (columnType === 'DateTime')
        val = new Date(value);
    else
        val = value;
    if (isString && val !== '') {
        const matching = await model.findMany({
            where: { [field]: { contains: val, mode: 'insensitive' } },
            select: { id: true },
        });
        const ids = matching.map((m) => m.id);
        if (ids.length === 0)
            return 0;
        const result = await model.deleteMany({ where: { id: { in: ids } } });
        return result.count;
    }
    const result = await model.deleteMany({ where: { [field]: val } });
    return result.count;
}
async function softDeleteRecordsWhere(modelName, field, value) {
    if (IS_DRY_RUN)
        return 0;
    const model = prismaModel(modelName);
    const config = SOFT_DELETE_MODELS[modelName];
    const columnType = getColumnType(modelName, field);
    const isString = columnType === 'String';
    const isBool = columnType === 'Boolean';
    let val;
    if (isBool)
        val = value.toLowerCase() === 'true';
    else if (columnType === 'Int' || columnType === 'Float')
        val = parseFloat(value);
    else if (columnType === 'DateTime')
        val = new Date(value);
    else
        val = value;
    let ids = [];
    if (isString && val !== '') {
        const recs = await model.findMany({
            where: { [field]: { contains: val, mode: 'insensitive' } },
            select: { id: true },
        });
        ids = recs.map((r) => r.id);
    }
    else {
        const recs = await model.findMany({
            where: { [field]: val },
            select: { id: true },
        });
        ids = recs.map((r) => r.id);
    }
    if (ids.length === 0)
        return 0;
    await model.updateMany({
        where: { id: { in: ids } },
        data: { [config.statusField]: config.inactiveValue },
    });
    return ids.length;
}
async function displayTableCounts(tables) {
    const list = tables || ALL_MODELS_IN_ORDER;
    let total = 0;
    for (const table of list) {
        const count = await countRecords(table);
        if (count > 0) {
            console.log(`  ${table.padEnd(25)} ${count} records`);
        }
        total += count;
    }
    console.log(cyan(`\n  Total:  ${total} records`));
}
async function modeDeleteById() {
    clearScreen();
    printHeader();
    console.log(bold('Mode 1: Delete record(s) by ID\n'));
    const table = await selectTable();
    console.log(`\nSelected table: ${cyan(table)}`);
    const softDeleteAvailable = table in SOFT_DELETE_MODELS;
    if (softDeleteAvailable) {
        const ans = await prompt(`Soft-delete available for ${table}. Soft-delete instead? (Y/n): `);
        const wantSoft = ans.trim().toLowerCase() !== 'n';
        const text = wantSoft ? 'soft-delete' : 'hard-delete';
        console.log(`Will ${text}.\n`);
        while (true) {
            const id = await prompt(`Enter ID of the record to ${text} (or enter to go back): `);
            if (!id.trim())
                break;
            const record = await findById(table, id.trim());
            if (!record) {
                console.log(red(`No record found with ID ${id}.`));
                continue;
            }
            console.log(`\nRecord found:`);
            const cols = getColumns(table);
            printPreview([record], cols);
            if (!(await confirmAction(`Proceed with ${text} of this record?`)))
                continue;
            if (wantSoft && softDeleteAvailable) {
                await softDeleteRecordsWhere(table, 'id', id.trim());
                console.log(green(`\u2713 Record soft-deleted (set to ${SOFT_DELETE_MODELS[table].inactiveValue}).`));
            }
            else {
                await deleteRecordsWhere(table, 'id', id.trim());
                console.log(green(`\u2713 Record permanently deleted.`));
            }
        }
        return;
    }
    while (true) {
        const id = await prompt('Enter ID of the record to delete (or enter to go back): ');
        if (!id.trim())
            break;
        const record = await findById(table, id.trim());
        if (!record) {
            console.log(red(`No record found with ID: ${id}`));
            continue;
        }
        console.log('\nRecord found:');
        const cols = getColumns(table);
        printPreview([record], cols);
        if (!(await confirmAction('Permanently delete this record?')))
            continue;
        await deleteRecordsWhere(table, 'id', id.trim());
        console.log(green(`\u2713 Record permanently deleted.`));
    }
}
async function modeDeleteFiltered() {
    clearScreen();
    printHeader();
    console.log(bold('Mode 2: Delete filtered records\n'));
    const table = await selectTable();
    console.log(`\nSelected table: ${cyan(table)}`);
    const columns = getColumns(table);
    console.log('\nAvailable columns:');
    for (let i = 0; i < columns.length; i++) {
        const colType = getColumnType(table, columns[i]);
        console.log(`  ${(i + 1).toString().padEnd(3)} ${columns[i].padEnd(25)} ${cyan(colType || '')}`);
    }
    const chosenCol = await promptNumber(`\nSelect a column by number (1-${columns.length}): `, columns.length);
    const col = columns[chosenCol - 1];
    console.log(`Selected column: ${cyan(col)}`);
    const value = await prompt(`Enter value to match (use % for like):`);
    const count = await countRecordsWhere(table, col, value);
    console.log(`\nRecords matching condition: ${yellow(String(count))}`);
    if (count === 0) {
        console.log(red('No records match.'));
        return;
    }
    const matches = await findRecords(table, col, value);
    console.log('\nPreview (up to 20 rows):');
    const previewCols = columns.slice(0, Math.min(columns.length, 8));
    printPreview(matches.slice(0, 20), previewCols);
    const softAvailable = table in SOFT_DELETE_MODELS;
    let doSoftDelete = false;
    if (softAvailable) {
        const ans = await prompt(`Soft-delete available for ${table}. Soft-delete instead? (Y/n): `);
        doSoftDelete = ans.trim().toLowerCase() !== 'n';
    }
    const action = doSoftDelete ? 'soft-delete' : 'delete';
    if (!(await confirmAction(`This will ${action} ${count} records from the ${table} table!`)))
        return;
    let deleted = 0;
    if (doSoftDelete && softAvailable) {
        deleted = await softDeleteRecordsWhere(table, col, value);
    }
    else {
        deleted = await deleteRecordsWhere(table, col, value);
    }
    if (IS_DRY_RUN) {
        console.log(yellow(`  DRY RUN — Would have deleted ${deleted} records from ${table}`));
    }
    else {
        console.log(green(`\u2713 Deleted ${deleted} records from ${table}`));
    }
    await sleep(1000);
}
async function modeDeleteAllFromTable() {
    clearScreen();
    printHeader();
    console.log(bold('Mode 3: Delete all records from a table\n'));
    const table = await selectTable();
    const count = await countRecords(table);
    console.log(`\nTable ${cyan(table)} has ${yellow(String(count))} records.`);
    if (count === 0) {
        console.log(yellow('Table is already empty.'));
        await prompt('Press enter to continue');
        return;
    }
    const softAvailable = table in SOFT_DELETE_MODELS;
    let doSoftDelete = false;
    if (softAvailable) {
        const ans = await prompt(`Soft-delete available for ${table}. Soft-delete instead? (Y/n): `);
        doSoftDelete = ans.trim().toLowerCase() !== 'n';
    }
    const action = doSoftDelete ? 'soft-delete' : 'permanently delete';
    if (!(await confirmAction(`This will ${action} ALL ${count} records from the ${table} table!`, true)))
        return;
    let deleted = 0;
    if (doSoftDelete && softAvailable) {
        deleted = await deleteAllRecordsInModel(table);
        if (deleted > 0) {
            const model = prismaModel(table);
            await model.updateMany({
                where: {},
                data: { [SOFT_DELETE_MODELS[table].statusField]: SOFT_DELETE_MODELS[table].inactiveValue },
            });
        }
    }
    else {
        const order = ALL_MODELS_IN_ORDER;
        const idx = order.indexOf(table);
        if (idx !== -1) {
            for (let i = 0; i < order.length; i++) {
                if (i < idx || order[i] === table)
                    continue;
            }
        }
        deleted = await deleteAllRecordsInModel(table);
    }
    if (IS_DRY_RUN) {
        console.log(yellow(`  DRY RUN — Would have ${action}d ${deleted} records from ${table}`));
    }
    else {
        console.log(green(`\u2713 ${action === 'soft-delete' ? 'Soft-deleted' : 'Permanently deleted'} ${deleted} records.`));
    }
    await sleep(1000);
}
async function modeFullReset() {
    clearScreen();
    printHeader();
    console.log(bold('Mode 4: FULL DATABASE RESET\n'));
    console.log(red('This will delete ALL data from ALL tables!'));
    console.log(red('Structure (tables, columns, indexes) will NOT be affected.\n'));
    let total = 0;
    for (const table of ALL_MODELS_IN_ORDER) {
        total += await countRecords(table);
    }
    if (total === 0) {
        console.log(yellow('All tables are already empty.'));
        await prompt('Press enter to return');
        return;
    }
    for (const table of ALL_MODELS_IN_ORDER) {
        const cnt = await countRecords(table);
        if (cnt > 0) {
            console.log(`  ${table.padEnd(25)} ${yellow(String(cnt))} records`);
        }
    }
    console.log(`\nTotal records to delete: ${bold(String(total))}`);
    if (!(await confirmAction('PERMANENTLY DELETE ALL DATA? This cannot be undone!', true)))
        return;
    const countPerTable = [];
    for (const table of ALL_MODELS_IN_ORDER) {
        const cnt = await countRecords(table);
        if (cnt > 0) {
            countPerTable.push({ table, count: cnt });
        }
    }
    console.log('\nDeleting records...');
    for (const entry of countPerTable) {
        if (!IS_DRY_RUN) {
            await deleteAllRecordsInModel(entry.table);
        }
        console.log(`  ${entry.table.padEnd(25)} ${entry.count} records deleted`);
    }
    if (IS_DRY_RUN) {
        console.log(yellow(`\n  DRY RUN — No records were actually deleted.`));
    }
    else {
        console.log(green(`\u2713 All records deleted successfully.`));
    }
    await sleep(1500);
}
async function selectTable() {
    let flatIndex = 1;
    const indexToModel = {};
    for (const group of MODEL_GROUPS) {
        console.log(`\n${bold(group.name)}:`);
        for (const model of group.models) {
            console.log(`  ${flatIndex.toString().padEnd(3)} ${model}`);
            indexToModel[flatIndex] = model;
            flatIndex++;
        }
    }
    console.log(`  ${flatIndex.toString().padEnd(3)} Show all (un-grouped)`);
    const allIndex = flatIndex;
    const maxIndex = flatIndex + ALL_MODELS_IN_ORDER.length;
    if (flatIndex <= maxIndex) {
        for (const model of ALL_MODELS_IN_ORDER) {
            if (!Object.values(indexToModel).includes(model)) {
                indexToModel[flatIndex] = model;
                flatIndex++;
            }
        }
    }
    while (true) {
        const choice = await promptNumber(`\nSelect a table (1-${allIndex}, or ${allIndex} for all): `, allIndex);
        if (choice === allIndex) {
            for (let i = 0; i < ALL_MODELS_IN_ORDER.length; i++) {
                console.log(`  ${(i + 1).toString().padEnd(3)} ${ALL_MODELS_IN_ORDER[i]}`);
            }
            const sub = await promptNumber(`Select table (1-${ALL_MODELS_IN_ORDER.length}): `, ALL_MODELS_IN_ORDER.length);
            return ALL_MODELS_IN_ORDER[sub - 1];
        }
        return indexToModel[choice];
    }
}
async function mainMenu() {
    clearScreen();
    printHeader();
    printWidow();
    console.log('Main menu:\n');
    console.log('  1. Delete record(s) by ID');
    console.log('  2. Delete filtered records');
    console.log('  3. Delete all records from a table');
    console.log('  4. Full database reset (all tables)');
    console.log('  5. Count records in all tables');
    console.log('  6. Exit');
    if (IS_DRY_RUN) {
        console.log(yellow('\n  (running in DRY-RUN mode)'));
    }
    const choice = await promptNumber('\nEnter your choice (1-6): ', 6);
    switch (choice) {
        case 1:
            await modeDeleteById();
            break;
        case 2:
            await modeDeleteFiltered();
            break;
        case 3:
            await modeDeleteAllFromTable();
            break;
        case 4:
            await modeFullReset();
            break;
        case 5: {
            clearScreen();
            printHeader();
            console.log(bold('Record counts by table:'));
            console.log('');
            await displayTableCounts();
            await prompt('\nPress enter to return');
            break;
        }
        case 6:
            return false;
    }
    return true;
}
async function main() {
    try {
        clearScreen();
        printHeader();
        printWidow();
        const message = IS_DRY_RUN
            ? 'DRY RUN — connect to your production or dev database as needed. Enter database name to proceed'
            : 'THIS WILL MODIFY DATA. Ensure you are connected to the correct database. Enter database name to proceed';
        console.log(yellow(message));
        await verifyDatabase(async () => {
            while (true) {
                const cont = await mainMenu();
                if (!cont) {
                    break;
                }
                await sleep(300);
            }
            clearScreen();
            console.log(green('Goodbye!'));
        });
    }
    catch (err) {
        console.error(red('Fatal error:'), err);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
        rl.close();
    }
}
main();
//# sourceMappingURL=delete-data.js.map