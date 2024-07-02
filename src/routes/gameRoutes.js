const express = require('express');
const { createGame, joinGame, getGameInfo, randomJoin } = require('../controllers/gameController');

const router = express.Router();

router.post('/create', createGame);
router.post('/join', joinGame);
router.get('/:gameCode', getGameInfo);
router.post('/random-match', randomJoin);

module.exports = router;





// const express = require('express');
// const Game = require('../models/Game');

// const router = express.Router();

// // Create a new game
// router.post('/games', async (req, res) => {
//     try {
//         const game = new Game(req.body);
//         await game.save();
//         res.status(201).send(game);
//     } catch (err) {
//         res.status(400).send(err);
//     }
// });

// // Get all games
// router.get('/games', async (req, res) => {
//     try {
//         const games = await Game.find();
//         res.status(200).send(games);
//     } catch (err) {
//         res.status(500).send(err);
//     }
// });

// // Get a single game by ID
// router.get('/games/:id', async (req, res) => {
//     try {
//         const game = await Game.findById(req.params.id);
//         if (!game) {
//             return res.status(404).send();
//         }
//         res.status(200).send(game);
//     } catch (err) {
//         res.status(500).send(err);
//     }
// });

// // Update a game by ID
// router.patch('/games/:id', async (req, res) => {
//     try {
//         const game = await Game.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
//         if (!game) {
//             return res.status(404).send();
//         }
//         res.status(200).send(game);
//     } catch (err) {
//         res.status(400).send(err);
//     }
// });

// // Delete a game by ID
// router.delete('/games/:id', async (req, res) => {
//     try {
//         const game = await Game.findByIdAndDelete(req.params.id);
//         if (!game) {
//             return res.status(404).send();
//         }
//         res.status(200).send(game);
//     } catch (err) {
//         res.status(500).send(err);
//     }
// });

// module.exports = router;
