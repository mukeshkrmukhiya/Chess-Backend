const express = require('express');
const { registerPlayer, loginPlayer, getPlayerProfile, updatePoints  } = require('../controllers/authcontroller');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerPlayer);
router.post('/login', loginPlayer);
router.put('/players/:id/points', updatePoints);

router.get('/profile', authMiddleware, getPlayerProfile);

module.exports = router;
