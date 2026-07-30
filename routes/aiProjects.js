const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const aiController = require('../controllers/aiProjectsController');

// @route   GET api/ai-projects/future
// @desc    Get dynamic AI Future Projects board
router.get('/future', auth, aiController.getFutureProjects);

// @route   GET api/ai-projects/roadmap
// @desc    Get dynamic AI R&D Roadmap board
router.get('/roadmap', auth, aiController.getRoadmap);

// @route   GET api/ai-projects/commercial-confirmed-multistage
router.get('/commercial-confirmed-multistage', auth, aiController.getCommercialConfirmedMultistage);

// @route   GET api/ai-projects/commercial-confirmed-sira
router.get('/commercial-confirmed-sira', auth, aiController.getCommercialConfirmedSIRA);

// @route   GET api/ai-projects/commercial-inquiry-multistage
router.get('/commercial-inquiry-multistage', auth, aiController.getCommercialInquiryMultistage);

// @route   GET api/ai-projects/commercial-inquiry-sira
router.get('/commercial-inquiry-sira', auth, aiController.getCommercialInquirySIRA);

// @route   GET api/ai-projects/dm-inquiries
// @desc    Get dynamic DM Inquiries board
router.get('/dm-inquiries', auth, aiController.getDMInquiries);

module.exports = router;
