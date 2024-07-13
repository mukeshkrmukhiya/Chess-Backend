//gamecontroller.js

const Game = require('../models/Game');
const Player = require('../models/Player');
const mongoose = require('mongoose');
const uniqid = require('uniqid');


// exports.createGame = async (req, res) => {
//   try {
//       const { playerId, timeControl } = req.body;

//       if (!mongoose.isValidObjectId(playerId)) {
//           return res.status(400).json({ message: 'Invalid player ID' });
//       }

//       const player = await Player.findById(playerId);
//       if (!player) {
//           return res.status(404).json({ message: 'Player not found' });
//       }

//       const gameCode = uniqid();
//       const newGame = new Game({
//           gameCode, 
//           playerWhite: player._id, 
//           playerBlack: null, 
//           timeControl: timeControl || 10
//       });
      
//       const savedGame = await newGame.save();

//       res.status(201).json({ 
//           message: 'Game created successfully', 
//           gameCode: savedGame.gameCode,
//           username: player.username,
//       });

//       console.log('Game created with Game Code:', savedGame.gameCode);
//   } catch (err) {
//       console.error(err);
//       res.status(500).json({ message: 'Failed to create game' });
//   }
// };


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
      timeControl: timeControl || 10,
      createdAt: new Date(),
      status: 'created'
    });

    const savedGame = await newGame.save();

    // Set a timeout to delete the game if no black player joins within 5 minutes
    setTimeout(async () => {
      const game = await Game.findOne({ gameCode });
      if (game && game.status === 'created') {
        await Game.deleteOne({ gameCode });
        console.log(`Game ${gameCode} deleted due to no black player joining within 5 minutes`);
      }
    }, 5 * 60 * 1000); // 5 minutes in milliseconds

    res.status(201).json({
      message: 'Game created successfully',
      gameCode: savedGame.gameCode,
      username: player.username,
    });

    console.log('Game created with Game Code:', savedGame.gameCode);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create game' });
  }
};

exports.randomJoin = async (req, res) => {
  const { playerId, timeControl } = req.body;
  
  try {
    // Fetch the player information
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    // Find an available game or create a new one
    let game = await Game.findOne({ 
      timeControl, 
      status: 'open', 
      playerBlack: null,
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Only consider games created within the last 5 minutes
    });

    if (game) {
      // Join existing game
      game.playerBlack = playerId;
      game.status = 'active';
      await game.save();

      res.json({ 
        gameCode: game.gameCode, 
        username: player.username, 
        color: 'black'
      });
    } else {
      // Create new game
      const gameCode = uniqid();
      game = new Game({
        gameCode,
        playerWhite: playerId,
        timeControl,
        status: 'open',
        createdAt: new Date()
      });
      await game.save();

      // Set a timeout to delete the game if no black player joins within 5 minutes
      setTimeout(async () => {
        const updatedGame = await Game.findOne({ gameCode });
        if (updatedGame && updatedGame.status === 'open') {
          await Game.deleteOne({ gameCode });
          console.log(`Game ${gameCode} deleted due to no black player joining within 5 minutes`);
        }
      }, 5 * 60 * 1000); // 5 minutes in milliseconds

      res.json({ 
        gameCode, 
        username: player.username, 
        color: 'white'
      });
    }

    // Emit socket event to notify about the game creation or join
    if (req.io) {
      req.io.to(game.gameCode).emit('gameUpdate', {
        gameCode: game.gameCode,
        status: game.status
      });
    }

  } catch (error) {
    console.error('Error in random match:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Function to handle player disconnection
exports.handleDisconnect = async (playerId, gameCode) => {
  try {
    const game = await Game.findOne({
      $or: [
        { playerWhite: playerId, playerBlack: null },
        { playerBlack: playerId, playerWhite: null }
      ],
      // Only consider 'open' games as they're likely to have one player status: 'open'
    });

    if (game) {
      await Game.deleteOne({ _id: game._id });
      console.log(`Game ${game.gameCode} deleted due to sole player disconnection`);
    }
  } catch (err) {
    console.error('Error handling disconnection:', err);
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

// exports.randomJoin = async (req, res) => {
//   const { playerId, timeControl } = req.body;
  
//   try {
//     // Fetch the player information
//     const player = await Player.findById(playerId);
//     if (!player) {
//       return res.status(404).json({ message: 'Player not found' });
//     }

//     // Find an available game or create a new one
//     let game = await Game.findOne({ 
//       timeControl, 
//       status: 'open', 
//       playerBlack: { $exists: false } 
//     });

//     if (game) {
//       // Join existing game
//       game.playerBlack = playerId;
//       game.status = 'active';
//       await game.save();

//       res.json({ 
//         gameCode: game.gameCode, 
//         username: player.username, 
//         color: 'black'
//       });
//     } else {
//       // Create new game
//       const gameCode = uniqid();
//       game = new Game({
//         gameCode,
//         playerWhite: playerId,
//         timeControl,
//         status: 'open'
//       });
//       await game.save();

//       res.json({ 
//         gameCode, 
//         username: player.username, 
//         color: 'white'
//       });
//     }

//     // Emit socket event to notify about the game creation or join
//     if (req.io) {
//       req.io.to(game.gameCode).emit('gameUpdate', {
//         gameCode: game.gameCode,
//         status: game.status
//       });
//     }

//   } catch (error) {
//     console.error('Error in random match:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// };

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



exports.endGame = async (req, res) => {
  try {
      const { gameCode, winner } = req.body;
      const game = await Game.findOne({ gameCode });

      if (!game) {
          return res.status(404).json({ message: 'Game not found' });
      }

      game.status = 'finished';
      game.winner = winner;
      await game.save();

      // Fetch player usernames
      const [playerWhite, playerBlack] = await Promise.all([
          Player.findOne(game.playerWhite),
          Player.findOne(game.playerBlack)
      ]);

      if (!playerWhite || !playerBlack) {
          throw new Error('One or both players not found');
      }

      // Update players' game history
      await updatePlayerGameHistory(
          playerWhite._id,
          game._id,
          winner === 'white' ? 'win' : winner === 'black' ? 'lose' : 'draw',
          'white',
          playerBlack.username
      );

      await updatePlayerGameHistory(
          playerBlack._id,
          game._id,
          winner === 'black' ? 'win' : winner === 'white' ? 'lose' : 'draw',
          'black',
          playerWhite.username
      );

      res.status(200).json({ message: 'Game ended successfully' });
  } catch (err) {
      console.error('Error in endGame:', err);
      res.status(500).json({ message: 'Failed to end game', error: err.message });
  }
};

async function updatePlayerGameHistory(playerId, gameId, outcome, color, opponentUsername) {
  try {
      const player = await Player.findById(playerId);
      if (!player) {
          throw new Error('Player not found');
      }

      // Ensure opponentUsername is provided
      if (!opponentUsername) {
          throw new Error('Opponent username is required');
      }

      player.games.push({
          gameId,
          opponent: opponentUsername,
          outcome,
          color
      });

      // Update points
      if (outcome === 'win') {
          player.points += 10;
      } else if (outcome === 'draw') {
          player.points += 1;
      }else if (outcome === 'lose' && player.points >= 8 ) {
        player.points -= 8;

      };

      await player.save();
  } catch (error) {
      console.error('Error updating player game history:', error);
      throw error; // Re-throw the error to be handled by the caller
  }
}





// exports.endGame = async (req, res) => {
//   try {
//       const { gameCode, winner } = req.body;

//       const game = await Game.findOne({ gameCode });
//       if (!game) {
//           return res.status(404).json({ message: 'Game not found' });
//       }

//       game.status = 'finished';
//       game.winner = winner;
//       await game.save();

//       // Update players' game history
//       await updatePlayerGameHistory(game.playerWhite, game._id, winner === 'white' ? 'win' : winner === 'black' ? 'lose' : 'draw', 'white');
//       await updatePlayerGameHistory(game.playerBlack, game._id, winner === 'black' ? 'win' : winner === 'white' ? 'lose' : 'draw', 'black');

//       res.status(200).json({ message: 'Game ended successfully' });
//   } catch (err) {
//       console.error(err);
//       res.status(500).json({ message: 'Failed to end game' });
//   }
// };

// async function updatePlayerGameHistory(playerId, gameId, outcome, color) {
//   try {
//       const player = await Player.findById(playerId);
//       if (!player) {
//           throw new Error('Player not found');
//       }

//       player.games.push({
//           gameId,
//           outcome,
//           color
//       });

//       // Update points
//       if (outcome === 'win') {
//           player.points += 3;
//       } else if (outcome === 'draw') {
//           player.points += 1;
//       }

//       await player.save();
//   } catch (error) {
//       console.error('Error updating player game history:', error);
//   }
// }

// module.exports = exports;