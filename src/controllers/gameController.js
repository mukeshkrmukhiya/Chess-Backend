const Game = require('../models/Game');
const Player = require('../models/Player');
const mongoose = require('mongoose');
const uniqid = require('uniqid');


exports.createGame = async (req, res) => {
  try {
      const { playerId, timeControl } = req.body;

      if (!mongoose.isValidObjectId(playerId)) {
          return res.status(400).json({ message: 'Invalid player ID' });
      }

      const player = await Player.findById(playerId);
      if (!player) {
          return res.status(404).json({ message: 'Player not found' });
      }

      const gameCode = uniqid();
      const newGame = new Game({
          gameCode, 
          playerWhite: player._id, 
          playerBlack: null, 
          timeControl: timeControl || 10
      });
      
      const savedGame = await newGame.save();

      res.status(201).json({ 
          message: 'Game created successfully', 
          gameCode: savedGame.gameCode,
          username: player.username
      });

      console.log('Game created with Game Code:', savedGame.gameCode);
  } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Failed to create game' });
  }
};



exports.joinGame = async (req, res) => {
    try {
        const { gameCode, playerId } = req.body;

        if (!mongoose.isValidObjectId(playerId)) {
            return res.status(400).json({ message: 'Invalid player ID' });
        }

        const game = await Game.findOne({ gameCode });
        const player = await Player.findById(playerId);
        if (!game || !player) {
            return res.status(404).json({ message: 'Game or player not found' });
        }

        if (game.playerWhite) {
            // Both players are already in the game, this player is rejoining
            const whitePlayer = await Player.findById(game.playerWhite);
            return res.status(200).json({
                game,
                whitePlayer: whitePlayer.username,
                blackPlayer: player.username,
                whitePlayerId: whitePlayer._id,
            });
        } else if (!game.playerBlack) {
            game.playerBlack = player._id;
            await game.save();
            const whitePlayer = await Player.findById(game.playerWhite);
            console.log('Game joined with Game Code:', game.gameCode);

            return res.status(200).json({
                game,
                whitePlayer: whitePlayer.username,
                blackPlayer: player.username,
                whitePlayerId: whitePlayer._id
            });

        } else {
            return res.status(400).json({ message: 'Game is already full' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to join game' });
    }
};



exports.getGameInfo = async (req, res) => {
  try {
    const { gameCode } = req.params;
    const game = await Game.findOne({ gameCode })
      .populate('playerWhite', 'username') // Populate white player's username
      .populate('playerBlack', 'username'); // Populate black player's username

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    // Modify the response to include player usernames
    const gameInfo = {
      ...game.toObject(),
      whitePlayer: game.playerWhite ? game.playerWhite.username : null,
      blackPlayer: game.playerBlack ? game.playerBlack.username : null,
    };

    res.json(gameInfo);
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


