const express = require('express');
const { createGame, joinGame, getGameInfo, randomJoin, endGame } = require('../controllers/gameController');

const router = express.Router();

router.post('/create', createGame);
router.post('/join', joinGame);
router.post('/random-match', randomJoin);
router.post('/end-game', endGame);
router.get('/:gameCode', getGameInfo);

module.exports = router;
