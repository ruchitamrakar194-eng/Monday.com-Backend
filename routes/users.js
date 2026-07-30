const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');
const { User } = require('../models');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsBase = fs.existsSync('/var/www/uploads') ? '/var/www/uploads' : path.join(__dirname, '../uploads');
const imagesDir = path.join(uploadsBase, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Helper to delete old avatar image from disk if it exists
const deleteOldAvatar = (avatarPath) => {
  if (avatarPath && avatarPath.startsWith('/uploads/')) {
    const relativeSubPath = avatarPath.replace(/^\/uploads\//, '');
    const fullPath = path.join(uploadsBase, relativeSubPath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        console.log(`[AVATAR DELETE] Removed old image: ${fullPath}`);
      } catch (err) {
        console.warn('[AVATAR DELETE WARN]', err.message);
      }
    }
  }
};

// Multer diskStorage for user avatars / images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imagesDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}-${baseName}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only image files (jpg, jpeg, png, webp) are allowed!'));
  }
});

// @route   GET api/users/me
// @desc    Get current user (Debug)
router.get('/me', auth, (req, res) => {
  res.json({ id: req.user.id, role: req.user.role });
});

// @route   GET api/users
// @desc    Get all users
router.get('/', auth, async (req, res) => {
  try {
    // Allow all authenticated users to see user list (required for person picker/assignments)
    // if (req.user.role !== 'Admin') return res.status(403).json({ msg: 'Access denied' });
    const { Item, Group, Board, Role } = require('../models');
    const users = await User.findAll({
      attributes: { exclude: ['password'] },
      include: [
        { model: Role },
        {
          model: Item,
          as: 'AssignedItems',
          include: [{
            model: Group,
            include: [{ model: Board }]
          }]
        }
      ]
    });

    // Ensure permissions are parsed if stored as string
    const processedUsers = users.map(u => {
      const user = u.toJSON();
      if (typeof user.permissions === 'string') {
        try {
          user.permissions = JSON.parse(user.permissions);
        } catch (e) {
          user.permissions = {};
        }
      }
      return user;
    });

    console.log(`[GET USERS] Sending ${processedUsers.length} users. Sample role: ${processedUsers[0]?.role}`);
    res.json(processedUsers);
  } catch (err) {
    console.error('GET /api/users error:', err);
    res.status(500).send('Server error');
  }
});

// @route   POST api/users/upload-avatar
// @desc    Upload avatar to local VPS disk storage (uploads/images) and save URL to DB
router.post('/upload-avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: 'No file uploaded.' });

    const user = await User.findByPk(req.user.id);
    if (user && user.avatar) {
      deleteOldAvatar(user.avatar);
    }

    const avatarUrl = `/uploads/images/${req.file.filename}`;

    // Persist local avatar URL to the user's DB record immediately
    await User.update({ avatar: avatarUrl }, { where: { id: req.user.id } });

    res.json({ avatarUrl });
  } catch (err) {
    console.error('[UPLOAD AVATAR ERROR]', err);
    res.status(500).json({ msg: 'Upload failed: ' + err.message });
  }
});

// @route   PUT api/users/profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, email, phone, address, avatar } = req.body;
    console.log('Update profile for User ID:', req.user.id);
    const user = await User.findByPk(req.user.id);
    if (!user) {
      console.log('User not found in DB with ID:', req.user.id);
      return res.status(404).json({ msg: 'User not found' });
    }

    // If email is changing, check if new email is already taken
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ where: { email } });
      if (emailExists) {
        return res.status(400).json({ msg: 'Email is already taken' });
      }
      user.email = email;
    }

    // Delete old avatar image if it's changing
    if (avatar && avatar !== user.avatar) {
      deleteOldAvatar(user.avatar);
      user.avatar = avatar;
    }

    // Only update fields that are provided
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (address) user.address = address;

    await user.save();
    res.json(user);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/users/password
router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate password length
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ msg: 'Password must be at least 6 characters' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      console.log('User not found for password update ID:', req.user.id);
      return res.status(404).json({ msg: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Incorrect current password' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedPassword });

    res.json({ msg: 'Password updated successfully' });
  } catch (err) {
    console.error('Update password error:', err);
    res.status(500).send('Server Error');
  }
});


// @route   POST api/users
// @desc    Create a user (Admin or with manageMembers permission)
router.post('/', [auth, checkPermission('manageMembers')], async (req, res) => {
  try {
    // if (req.user.role !== 'Admin') return res.status(403).json({ msg: 'Access denied' });
    const { name, email, password, role, avatar, phone, address, permissions } = req.body;
    const { Role } = require('../models');

    let user = await User.findOne({ where: { email } });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    // Find Role ID by name
    let roleId = null;
    if (role) {
      const roleFound = await Role.findOne({ where: { name: role } });
      if (roleFound) roleId = roleFound.id;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userListData = {
      name, email, password: hashedPassword, role, avatar, phone, address, roleId
    };
    if (permissions) {
      userListData.permissions = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
    }

    user = await User.create(userListData);

    res.json(user);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/users/:id
router.put('/:id', [auth, checkPermission('manageMembers')], async (req, res) => {
  try {
    // if (req.user.role !== 'Admin') return res.status(403).json({ msg: 'Access denied' });
    const { name, email, phone, address, role, status, password, permissions } = req.body;
    const { Role } = require('../models');

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    console.log('[USER UPDATE] ID:', req.params.id, 'Body:', JSON.stringify(req.body, null, 2));

    const updates = { name, email, phone, address, role, status };

    // Handle permissions explicitly
    if (permissions) {
      updates.permissions = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
    }

    if (password) {
      updates.password = await bcrypt.hash(password, 10);
    }

    // Sync roleId if role is provided
    if (role) {
      const roleFound = await Role.findOne({ where: { name: role } });
      if (roleFound) updates.roleId = roleFound.id;
    }

    await user.update(updates);
    res.json(user);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).send('Server error');
  }
});

// @route   DELETE api/users/:id
router.delete('/:id', [auth, checkPermission('manageMembers')], async (req, res) => {
  try {
    // if (req.user.role !== 'Admin') return res.status(403).json({ msg: 'Access denied' });
    await User.destroy({ where: { id: req.params.id } });
    res.json({ msg: 'User removed' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;
