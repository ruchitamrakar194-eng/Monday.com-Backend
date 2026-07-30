const express = require('express');
const router = express.Router();
const { Payroll, Board, Group, Item } = require('../models');
const { Op } = require('sequelize');

const getCurrencySymbol = (code) => {
    const symbols = {
        'INR': '₹',
        'USD': '$',
        'AED': 'AED ',
        'EUR': '€',
        'GBP': '£',
        'CAD': 'C$',
        'AUD': 'A$',
        'SGD': 'S$',
        'SAR': 'SR ',
        'QAR': 'QR ',
        'OMR': 'OMR ',
        'BHD': 'BD ',
        'KWD': 'KD ',
        'CNY': '¥',
        'JPY': '¥'
    };
    return symbols[code] || '₹';
};

const defaultColumns = [
    { id: 'name', title: 'Name', type: 'text' },
    { id: 'department', title: 'Department', type: 'text' },
    { id: 'active_salary', title: 'Active Salary', type: 'currency' },
    { id: 'expenses', title: 'Expenses', type: 'currency' },
    { id: 'ot', title: 'OT', type: 'text' },
    { id: 'status', title: 'Status', type: 'status', options: [
        { label: 'Unpaid', color: '#c4c4c4' },
        { label: 'Paid', color: '#00c875' },
        { label: 'Pending', color: '#fdab3d' }
    ]}
];

async function syncPayrollToBoard(record, action) {
    try {
        // 1. Find the board named 'Payroll' or 'PayRoll'
        let board = await Board.findOne({
            where: {
                name: {
                    [Op.like]: '%payroll%'
                }
            }
        });
        if (!board) {
            // Create the default Payroll board
            board = await Board.create({
                name: 'Payroll',
                folder: 'HR And Payroll',
                type: 'board',
                columns: defaultColumns
            });
            console.log('[PAYROLL SYNC] Created default Payroll board.');
        }

        // 2. If action is 'delete', delete the corresponding item
        if (action === 'delete') {
            await Item.destroy({
                where: {
                    name: record.name,
                    BoardId: board.id
                }
            });
            console.log(`[PAYROLL SYNC] Deleted item for ${record.name} from payroll board.`);
            return;
        }

        // 3. Find or create group for the month & year (e.g. "October 2024")
        const groupTitle = `${record.month || new Date().toLocaleString('default', { month: 'long' })} ${record.year || new Date().getFullYear()}`;
        let group = await Group.findOne({
            where: {
                BoardId: board.id,
                title: groupTitle
            }
        });
        if (!group) {
            group = await Group.create({
                title: groupTitle,
                BoardId: board.id,
                color: '#00c875'
            });
            console.log(`[PAYROLL SYNC] Created group "${groupTitle}" on payroll board.`);
        }

        // 4. Map columns dynamically by title
        let cols = [];
        try {
            cols = typeof board.columns === 'string' ? JSON.parse(board.columns) : (board.columns || []);
        } catch (e) {
            cols = board.columns || [];
        }
        
        const getColId = (titles, defaultId) => {
            const col = cols.find(c => c.title && titles.includes(c.title.toLowerCase().trim()));
            return col ? col.id : defaultId;
        };

        const deptColId = getColId(['department', 'dept'], 'department');
        const salaryColId = getColId(['active salary', 'basic salary', 'salary', 'active_salary'], 'active_salary');
        const expensesColId = getColId(['expenses'], 'expenses');
        const otColId = getColId(['ot', 'overtime', 'overtime hours', 'overtime_hours'], 'ot');
        const statusColId = getColId(['status', 'payment status', 'payment_status'], 'status');

        // Build item customFields and attributes
        const customFields = {};
        const updates = {
            name: record.name,
            BoardId: board.id,
            GroupId: group.id,
            status: record.paymentStatus || 'Working on it'
        };

        // Populate column values
        customFields[deptColId] = record.department || '';
        customFields[salaryColId] = `${getCurrencySymbol(record.currency || 'INR')}${record.basicSalary || 0}`;
        customFields[expensesColId] = `${getCurrencySymbol(record.currency || 'INR')}${record.festivalBonus || 0}`; // map festival bonus as expenses
        customFields[otColId] = `${record.overtimeHours || 0}h`;
        customFields[statusColId] = record.paymentStatus || 'Working on it';

        updates.customFields = customFields;

        // Also map to direct fields for backup/compatibility
        updates.payment = parseFloat(record.basicSalary || 0);

        // 5. Check if item already exists for this employee in this group
        let item = await Item.findOne({
            where: {
                name: record.name,
                BoardId: board.id,
                GroupId: group.id
            }
        });

        if (item) {
            // Update existing item
            const existingCustom = item.customFields ? (typeof item.customFields === 'string' ? JSON.parse(item.customFields) : item.customFields) : {};
            updates.customFields = { ...existingCustom, ...customFields };
            await item.update(updates);
            console.log(`[PAYROLL SYNC] Updated payroll board item for ${record.name}.`);
        } else {
            // Create new item
            await Item.create(updates);
            console.log(`[PAYROLL SYNC] Created new payroll board item for ${record.name}.`);
        }
    } catch (err) {
        console.error('[PAYROLL SYNC ERROR] Failed to sync payroll record to board:', err);
    }
}

// GET all payroll records
router.get('/', async (req, res) => {
    try {
        const records = await Payroll.findAll({
            order: [['createdAt', 'DESC']]
        });

        // Add calculated fields on the fly
        const enrichedRecords = records.map(record => {
            const data = record.toJSON();
            const presentDays = parseFloat(data.presentDays || 0);
            const overtimeHours = parseFloat(data.overtimeHours || 0);
            const totalWorkedHours = (presentDays * 8) + overtimeHours;

            const perDaySalary = data.totalWorkingDays > 0 ? (data.basicSalary / data.totalWorkingDays) : 0;
            const leaveDeduction = data.leaveDays * perDaySalary;
            const overtimePay = data.overtimeHours * data.overtimeRate;
            const totalBonus = parseFloat(data.performanceBonus || 0) + parseFloat(data.festivalBonus || 0) + parseFloat(data.bonus || 0);
            const grossSalary = parseFloat(data.basicSalary) + parseFloat(overtimePay) + totalBonus;
            const netPayable = grossSalary - leaveDeduction;
            const taxDeduction = netPayable * (data.tdsPercent / 100);
            const finalSalary = netPayable - taxDeduction;

            return {
                ...data,
                totalWorkedHours: totalWorkedHours.toFixed(1),
                perDaySalary: perDaySalary.toFixed(2),
                leaveDeduction: leaveDeduction.toFixed(2),
                overtimePay: overtimePay.toFixed(2),
                grossSalary: grossSalary.toFixed(2),
                taxDeduction: taxDeduction.toFixed(2),
                netPayable: finalSalary.toFixed(2)
            };
        });

        res.json(enrichedRecords);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new payroll entry
router.post('/', async (req, res) => {
    try {
        const record = await Payroll.create(req.body);
        
        // Enrich calculations on the fly to get final salary / stats
        const data = record.toJSON();
        const presentDays = parseFloat(data.presentDays || 0);
        const overtimeHours = parseFloat(data.overtimeHours || 0);
        const totalWorkedHours = (presentDays * 8) + overtimeHours;
        const perDaySalary = data.totalWorkingDays > 0 ? (data.basicSalary / data.totalWorkingDays) : 0;
        const leaveDeduction = data.leaveDays * perDaySalary;
        const overtimePay = data.overtimeHours * data.overtimeRate;
        const totalBonus = parseFloat(data.performanceBonus || 0) + parseFloat(data.festivalBonus || 0) + parseFloat(data.bonus || 0);
        const grossSalary = parseFloat(data.basicSalary) + parseFloat(overtimePay) + totalBonus;
        const netPayable = grossSalary - leaveDeduction;
        const taxDeduction = netPayable * (data.tdsPercent / 100);
        const finalSalary = netPayable - taxDeduction;

        const enrichedRecord = {
            ...data,
            totalWorkedHours: totalWorkedHours.toFixed(1),
            perDaySalary: perDaySalary.toFixed(2),
            leaveDeduction: leaveDeduction.toFixed(2),
            overtimePay: overtimePay.toFixed(2),
            grossSalary: grossSalary.toFixed(2),
            taxDeduction: taxDeduction.toFixed(2),
            netPayable: finalSalary.toFixed(2)
        };

        // Sync to board
        await syncPayrollToBoard(enrichedRecord, 'create');

        res.status(201).json(record);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PATCH update payroll entry
router.patch('/:id', async (req, res) => {
    try {
        const record = await Payroll.findByPk(req.params.id);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        const updates = { ...req.body };
        if (updates.paymentStatus === 'Paid') {
            if (updates.paymentDate === undefined || updates.paymentDate === null) {
                updates.paymentDate = new Date();
            }
        } else if (updates.paymentStatus === 'Pending' || updates.paymentStatus === 'Approved') {
            updates.paymentDate = null;
        }

        await record.update(updates);

        // Fetch refreshed record, calculate and sync
        const refreshedRecord = await Payroll.findByPk(req.params.id);
        const data = refreshedRecord.toJSON();
        const presentDays = parseFloat(data.presentDays || 0);
        const overtimeHours = parseFloat(data.overtimeHours || 0);
        const totalWorkedHours = (presentDays * 8) + overtimeHours;
        const perDaySalary = data.totalWorkingDays > 0 ? (data.basicSalary / data.totalWorkingDays) : 0;
        const leaveDeduction = data.leaveDays * perDaySalary;
        const overtimePay = data.overtimeHours * data.overtimeRate;
        const totalBonus = parseFloat(data.performanceBonus || 0) + parseFloat(data.festivalBonus || 0) + parseFloat(data.bonus || 0);
        const grossSalary = parseFloat(data.basicSalary) + parseFloat(overtimePay) + totalBonus;
        const netPayable = grossSalary - leaveDeduction;
        const taxDeduction = netPayable * (data.tdsPercent / 100);
        const finalSalary = netPayable - taxDeduction;

        const enrichedRecord = {
            ...data,
            totalWorkedHours: totalWorkedHours.toFixed(1),
            perDaySalary: perDaySalary.toFixed(2),
            leaveDeduction: leaveDeduction.toFixed(2),
            overtimePay: overtimePay.toFixed(2),
            grossSalary: grossSalary.toFixed(2),
            taxDeduction: taxDeduction.toFixed(2),
            netPayable: finalSalary.toFixed(2)
        };

        await syncPayrollToBoard(enrichedRecord, 'update');

        res.json(refreshedRecord);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE payroll entry
router.delete('/:id', async (req, res) => {
    try {
        const record = await Payroll.findByPk(req.params.id);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        // Sync delete to board
        await syncPayrollToBoard(record, 'delete');

        await record.destroy();
        res.json({ message: 'Record deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
