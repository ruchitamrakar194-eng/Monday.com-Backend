const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { File, Item, User, Board, Group } = require('../models');
const { Op } = require('sequelize');

// Ensure upload directories exist
const uploadsBase = fs.existsSync('/var/www/uploads') ? '/var/www/uploads' : path.join(__dirname, '../uploads');
['images', 'videos', 'files'].forEach(sub => {
  const dirPath = path.join(uploadsBase, sub);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Configure Multer diskStorage to route files by MIME type
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'files';
    if (file.mimetype.startsWith('image/')) folder = 'images';
    else if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) folder = 'videos';
    cb(null, path.join(uploadsBase, folder));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}-${baseName}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedExts = /jpeg|jpg|png|webp|gif|pdf|doc|docx|xls|xlsx|csv|txt|mp4|mov|webm|avi|mkv|zip|rar/;
    const forbiddenExts = /exe|sh|bat|cmd|com|php|js|vbs|msi|ps1|cgi|jar|py|pl/;

    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

    if (forbiddenExts.test(ext)) {
      return cb(new Error('Executable and script files are strictly prohibited!'), false);
    }

    if (allowedExts.test(ext)) {
      return cb(null, true);
    }

    cb(new Error('File type not supported. Allowed: images (jpg, png, webp), documents (pdf, doc, docx, xls, xlsx), videos (mp4, mov, webm).'), false);
  }
});

// @route   GET api/files
// @desc    Get all files (Filtered by role and assignment)
router.get('/', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'Admin' || req.user.role === 'Manager';

    let whereClause = {};

    if (!isAdmin) {
      const userId = req.user.id;

      const assignedItems = await Item.findAll({
        where: {
          [Op.or]: [
            { assignedToId: String(userId) },
            {
              people: {
                [Op.like]: `%\"id\":${userId}%`
              }
            }
          ]
        },
        attributes: ['id']
      });

      const assignedItemIds = assignedItems.map(item => item.id);

      whereClause = {
        [Op.or]: [
          { ItemId: { [Op.in]: assignedItemIds } },
          { userId: userId }
        ]
      };
    }

    const files = await File.findAll({
      where: whereClause,
      include: [
        {
          model: Item,
          include: [{ model: Group, include: [{ model: Board }] }]
        },
        { model: User, attributes: ['name', 'avatar'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(files);
  } catch (err) {
    console.error('[GET FILES ERROR]', err);
    res.status(500).send('Server error');
  }
});

// @route   POST api/files/upload
// @desc    Upload a file to local VPS disk storage and save URL to DB
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'No file uploaded' });
    }

    console.log(`[UPLOAD] ${req.file.originalname} (${req.file.mimetype}, ${req.file.size}B) saved to ${req.file.path}`);

    let subfolder = 'files';
    if (req.file.mimetype.startsWith('image/')) subfolder = 'images';
    else if (req.file.mimetype.startsWith('video/') || req.file.mimetype.startsWith('audio/')) subfolder = 'videos';

    const fileUrl = `/uploads/${subfolder}/${req.file.filename}`;

    const newFile = await File.create({
      name: req.file.originalname,
      url: fileUrl,
      size: req.file.size,
      type: req.file.mimetype,
      uploadedBy: req.user.name,
      ItemId: req.body.itemId || null,
      userId: req.user.id,
    });

    console.log(`[UPLOAD] DB saved — id: ${newFile.id}`);

    const fileWithUser = await File.findByPk(newFile.id, {
      include: [{ model: User, attributes: ['name', 'avatar'] }]
    });

    res.json(fileWithUser);
  } catch (err) {
    console.error('[UPLOAD ERROR]', err.message);
    res.status(500).json({ msg: 'Upload failed: ' + err.message });
  }
});

// @route   DELETE api/files/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const file = await File.findByPk(req.params.id);
    if (!file) return res.status(404).json({ msg: 'File not found' });

    // Delete local file if it exists under /uploads/
    if (file.url && file.url.startsWith('/uploads/')) {
      const relativeSubPath = file.url.replace(/^\/uploads\//, '');
      const fullPath = path.join(uploadsBase, relativeSubPath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
          console.log(`[FILE DELETE] Deleted local file: ${fullPath}`);
        } catch (unlinkErr) {
          console.warn('[FILE DELETE] Could not delete local file:', unlinkErr.message);
        }
      }
    }

    await file.destroy();
    res.json({ msg: 'File deleted' });
  } catch (err) {
    console.error('[FILE DELETE ERROR]', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;

