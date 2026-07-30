const { Board, Group, Item, User } = require('../models');
const { Op } = require('sequelize');

const getBoardAccess = async (req, board) => {
    const userId = String(req.user.id);
    const isAdmin = req.user.role === 'Admin';
    const isManager = req.user.role === 'Manager';
    
    const isFolderPermitted = req.user.permissions?.folders?.includes(board.folder);
    const isBoardPermitted = req.user.permissions?.boards?.some(pbid => String(pbid) === String(board.id));
    const isOwner = String(board.ownerId) === userId;

    if (isAdmin || isManager || isFolderPermitted || isBoardPermitted || isOwner) {
        return { access: 'full', isCoordinator: true };
    }
    
    return { access: 'assigned', isCoordinator: false };
};

exports.getFutureProjects = async (req, res) => {
    try {
        let board = await Board.findOne({
            where: { name: 'AI Future Projects' },
            include: [{
                model: Group,
                as: 'Groups',
                include: [{
                    model: Item,
                    as: 'items',
                    include: [{ model: User, as: 'assignedUser', attributes: ['id', 'name', 'avatar'] }]
                }]
            }]
        });

        if (!board) {
            board = await Board.create({
                name: 'AI Future Projects',
                type: 'ai-future',
                folder: 'AI & Innovation',
                columns: [
                    { id: 'name', title: 'Project Name', type: 'text' },
                    { id: 'status', title: 'Phase', type: 'status' },
                    { id: 'aiModel', title: 'AI Model', type: 'status' },
                    { id: 'priority', title: 'Priority', type: 'priority' },
                    { id: 'timeline', title: 'Timeline', type: 'text' },
                    { id: 'progress', title: 'Progress', type: 'progress' }
                ]
            });
            board = await Board.findByPk(board.id, {
                include: [{ model: Group, as: 'Groups', include: [{ model: Item, as: 'items', include: [{ model: User, as: 'assignedUser', attributes: ['id', 'name', 'avatar'] }] }] }]
            });
        }

        const boardJson = board.toJSON();
        const accessInfo = await getBoardAccess(req, board);
        Object.assign(boardJson, accessInfo);
        
        res.json(boardJson);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

exports.getRoadmap = async (req, res) => {
    try {
        let board = await Board.findOne({
            where: { name: 'AI R&D Roadmap' },
            include: [{
                model: Group,
                as: 'Groups',
                include: [{
                    model: Item,
                    as: 'items',
                    include: [{ model: User, as: 'assignedUser', attributes: ['id', 'name', 'avatar'] }]
                }]
            }]
        });

        if (!board) {
            board = await Board.create({
                name: 'AI R&D Roadmap',
                type: 'ai-roadmap',
                folder: 'AI & Innovation',
                columns: [
                    { id: 'name', title: 'Task Name', type: 'text' },
                    { id: 'status', title: 'Status', type: 'status' },
                    { id: 'priority', title: 'Priority', type: 'priority' },
                    { id: 'timeline', title: 'Quarter', type: 'text' },
                    { id: 'progress', title: 'Completion', type: 'progress' }
                ]
            });
            board = await Board.findByPk(board.id, {
                include: [{ model: Group, as: 'Groups', include: [{ model: Item, as: 'items', include: [{ model: User, as: 'assignedUser', attributes: ['id', 'name', 'avatar'] }] }] }]
            });
        }

        const boardJson = board.toJSON();
        const accessInfo = await getBoardAccess(req, board);
        Object.assign(boardJson, accessInfo);

        res.json(boardJson);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

const statusOptionsList = [
    { label: 'Quoted', color: '#ff643b' },
    { label: 'Negotiation', color: '#9cd326' },
    { label: 'LOW CHANCE WIN', color: '#ffadad' },
    { label: 'Pricing required', color: '#4b5ef0' },
    { label: 'HCIS', color: '#00838f' },
    { label: 'PRICED', color: '#90caf9' },
    { label: 'In Progress', color: '#579bfc' },
    { label: 'Won', color: '#00c875' },
    { label: 'SPAM', color: '#784bd1' },
    { label: 'PRICED-READY FOR SUBMISSION', color: '#d81b60' },
    { label: 'BAFO', color: '#4dd0e1' },
    { label: 'PRIORITY SUBMISSION', color: '#004d40' },
    { label: 'Awaiting Info', color: '#a25ddc' },
    { label: 'Lost', color: '#c4c4c4' },
    { label: 'medium chance win', color: '#ffcb00' },
    { label: 'QUALITY CHECK', color: '#78909c' },
    { label: 'DURATION TO BE PROVIDED', color: '#6d4c41' },
    { label: 'WAITING FOR RFP', color: '#008675' },
    { label: 'NDA sent waiting for response', color: '#e2445c' },
    { label: 'Waiting SOW', color: '#ff94c2' },
    { label: 'NO FEEDBACK', color: '#1e88e5' },
    { label: 'REVISION REQUIRED', color: '#4a148c' },
    { label: 'Regret to quote', color: '#573b33' },
    { label: 'High potential win', color: '#ff5ac4' },
    { label: 'Suspesi', color: '#4097ff' },
    { label: 'low chance win', color: '#ff9800' },
    { label: 'TRF TO SIRA', color: '#80deea' },
    { label: 'on hold', color: '#bb3354' },
    { label: 'Tabaan / Spam', color: '#caa023' },
    { label: 'Ready for Submission', color: '#808080' },
    { label: 'NDA TO SEND', color: '#8e24aa' },
    { label: 'Working on it', color: '#fdab3d' },
    { label: 'Done', color: '#00c875' },
    { label: 'Stuck', color: '#e2445c' },
    { label: 'Waiting', color: '#0085ff' },
    { label: 'For Client Review', color: '#ffcb00' },
    { label: 'Waiting for Details', color: '#0086c0' }
];

const servicesOptionsList = [
    { label: 'CCTV', color: '#ff643b' },
    { label: 'SIRA APPROVAL', color: '#0085ff' },
    { label: 'SECURITY AUDIT', color: '#a25ddc' },
    { label: 'ACCESS CONTROL', color: '#00c875' },
    { label: 'MAINTENANCE', color: '#ffcb00' },
    { label: 'SIRA VSS', color: '#00838f' },
    { label: 'ANPR / BARRIER', color: '#ff5ac4' },
    { label: 'FIRE ALARM', color: '#e2445c' },
    { label: 'AUDIO VISUAL', color: '#579bfc' },
    { label: 'INTERCOM', color: '#4a148c' },
    { label: 'DATA / IT', color: '#1e88e5' },
    { label: 'CONSULTANCY', color: '#6d4c41' },
    { label: 'Smart Home & CCTV System', color: '#00c875' },
    { label: 'Access Control & SIRA Cert', color: '#0085ff' },
    { label: 'Security Audit & Licensing', color: '#a25ddc' },
    { label: 'Annual Maintenance Contract', color: '#fdab3d' },
    { label: 'Full Security Overhaul', color: '#ff5ac4' }
];

const jihOptionsList = [
    { label: 'JIH', color: '#00c875' },
    { label: 'TENDER', color: '#ffcb00' },
    { label: 'LOST', color: '#e2445c' },
    { label: 'DECLINED', color: '#333333' }
];

const commercialInquiryMultistageColumnsSchema = [
    { id: 'name', title: 'Deal Name', type: 'text' },
    { id: 'receivedDate', title: 'Item Received Date', type: 'date' },
    { id: 'expectedSubmissionDate', title: 'Date of Submission', type: 'date' },
    { id: 'dateSubmitted', title: 'Submitted Date', type: 'date' },
    { id: 'services', title: 'Services', type: 'status', options: servicesOptionsList },
    { id: 'status', title: 'Status', type: 'status', options: statusOptionsList },
    { id: 'jih', title: 'JIH/Tender', type: 'status', options: jihOptionsList },
    { id: 'dealValue', title: 'Deal Value', type: 'payment' },
    { id: 'comments', title: 'Comment #1', type: 'text' },
    { id: 'comments2', title: 'Comment #2', type: 'text' }
];

const commercialConfirmedMultistageColumnsSchema = [
    { id: 'name', title: 'Deal Name', type: 'text' },
    { id: 'contract', title: 'Contract', type: 'text' },
    { id: 'receivedDate', title: 'Received Date', type: 'date' },
    { id: 'contractEndDate', title: 'Contract End Date', type: 'date' },
    { id: 'person', title: 'Person Incharge', type: 'person' },
    { id: 'status', title: 'Project Status', type: 'status', options: statusOptionsList },
    { id: 'invoiceInitiation', title: 'Invoice Initiation', type: 'payment' },
    { id: 'invoiceStage', title: 'Invoice Stage', type: 'status' },
    { id: 'paymentStatus', title: 'Payment Status', type: 'status' },
    { id: 'files', title: 'Files', type: 'files' }
];

const commercialInquirySiraColumnsSchema = [
    { id: 'name', title: 'Deal Name', type: 'text' },
    { id: 'receivedDate', title: 'Received Date', type: 'date' },
    { id: 'status', title: 'Status', type: 'status', options: statusOptionsList },
    { id: 'dealValue', title: 'Deal Value', type: 'payment' },
    { id: 'jih', title: 'JIH/Tender', type: 'status', options: jihOptionsList },
    { id: 'comments', title: 'Comment #1', type: 'text' }
];

const commercialConfirmedSiraColumnsSchema = [
    { id: 'name', title: 'Deal Name', type: 'text' },
    { id: 'receivedDate', title: 'Received Date', type: 'date' },
    { id: 'expectedSubmissionDate', title: 'Expected Submission Date', type: 'date' },
    { id: 'person', title: 'Person Incharge', type: 'person' },
    { id: 'status', title: 'Status', type: 'status', options: statusOptionsList },
    { id: 'paymentStatus', title: 'Payment Status', type: 'status' },
    { id: 'progress', title: 'Overall Progress', type: 'progress' },
    { id: 'files', title: 'Files', type: 'files' }
];

const getCommercialBoardHelper = async (req, res, boardName, boardType, columnsSchema) => {
    try {
        let board = await Board.findOne({
            where: { name: boardName },
            include: [{
                model: Group,
                as: 'Groups',
                include: [{
                    model: Item,
                    as: 'items',
                    include: [{ model: User, as: 'assignedUser', attributes: ['id', 'name', 'avatar'] }]
                }]
            }]
        });

        if (!board) {
            board = await Board.create({
                name: boardName,
                type: boardType,
                folder: 'Commercial',
                columns: columnsSchema
            });

            // Seed default groups for newly created board
            const isConfirmed = boardType.includes('confirmed');
            await Group.create({
                BoardId: board.id,
                title: isConfirmed ? 'Active Confirmed Projects' : 'Inquiries Received',
                color: isConfirmed ? '#00c875' : '#0085ff',
                position: 1
            });
            await Group.create({
                BoardId: board.id,
                title: isConfirmed ? 'Completed Deals' : 'Under Negotiation',
                color: isConfirmed ? '#00c875' : '#fdab3d',
                position: 2
            });

            board = await Board.findByPk(board.id, {
                include: [{ model: Group, as: 'Groups', include: [{ model: Item, as: 'items', include: [{ model: User, as: 'assignedUser', attributes: ['id', 'name', 'avatar'] }] }] }]
            });
        }

        if (!board.Groups || board.Groups.length === 0) {
            const isConfirmed = boardType.includes('confirmed');
            await Group.create({
                BoardId: board.id,
                title: isConfirmed ? 'Active Confirmed Projects' : 'Inquiries Received',
                color: isConfirmed ? '#00c875' : '#0085ff',
                position: 1
            });
            await Group.create({
                BoardId: board.id,
                title: isConfirmed ? 'Completed Deals' : 'Under Negotiation',
                color: isConfirmed ? '#00c875' : '#fdab3d',
                position: 2
            });

            board = await Board.findByPk(board.id, {
                include: [{ model: Group, as: 'Groups', include: [{ model: Item, as: 'items', include: [{ model: User, as: 'assignedUser', attributes: ['id', 'name', 'avatar'] }] }] }]
            });
        }

        const boardJson = board.toJSON();
        const accessInfo = await getBoardAccess(req, board);
        Object.assign(boardJson, accessInfo);

        res.json(boardJson);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

exports.getCommercialConfirmedMultistage = async (req, res) => {
    return getCommercialBoardHelper(req, res, 'Commercial Confirmed Multi-Stage', 'commercial-confirmed-multistage', commercialConfirmedMultistageColumnsSchema);
};

exports.getCommercialConfirmedSIRA = async (req, res) => {
    return getCommercialBoardHelper(req, res, 'Commercial Confirmed - SIRA', 'commercial-confirmed-sira', commercialConfirmedSiraColumnsSchema);
};

exports.getCommercialInquiryMultistage = async (req, res) => {
    return getCommercialBoardHelper(req, res, 'Commercial Inquiry Multi-Stage', 'commercial-inquiry-multistage', commercialInquiryMultistageColumnsSchema);
};

exports.getCommercialInquirySIRA = async (req, res) => {
    return getCommercialBoardHelper(req, res, 'Commercial Inquiry - SIRA', 'commercial-inquiry-sira', commercialInquirySiraColumnsSchema);
};

exports.getDMInquiries = async (req, res) => {
    try {
        let board = await Board.findOne({
            where: { name: 'DM Inquiries - Master Board' },
            include: [{
                model: Group,
                as: 'Groups',
                include: [{
                    model: Item,
                    as: 'items',
                    include: [{ model: User, as: 'assignedUser', attributes: ['id', 'name', 'avatar'] }]
                }]
            }]
        });

        if (!board) {
            board = await Board.create({
                name: 'DM Inquiries - Master Board',
                type: 'dm-inquiries',
                folder: 'Commercial',
                columns: [
                    { id: 'name', title: 'Customer Name', type: 'text' },
                    { id: 'status', title: 'Status', type: 'status' },
                    { id: 'source', title: 'Source', type: 'status' },
                    { id: 'urgency', title: 'Urgency', type: 'priority' },
                    { id: 'person', title: 'Assigned To', type: 'person' },
                    { id: 'receivedDate', title: 'Received Date', type: 'date' }
                ]
            });
            board = await Board.findByPk(board.id, {
                include: [{ model: Group, as: 'Groups', include: [{ model: Item, as: 'items', include: [{ model: User, as: 'assignedUser', attributes: ['id', 'name', 'avatar'] }] }] }]
            });
        }

        const boardJson = board.toJSON();
        const accessInfo = await getBoardAccess(req, board);
        Object.assign(boardJson, accessInfo);

        res.json(boardJson);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};
