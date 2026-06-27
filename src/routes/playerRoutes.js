const express = require('express');
const { registerPlayer, loginPlayer, googleLogin, getPlayerProfile, updatePoints, getLeaderboard } = require('../controllers/authcontroller');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerPlayer);
router.post('/login', loginPlayer);
router.post('/google', googleLogin);
router.get('/profile', authMiddleware, getPlayerProfile);
router.get('/leaderboard', getLeaderboard);
router.put('/players/:id/points', updatePoints);

module.exports = router;
