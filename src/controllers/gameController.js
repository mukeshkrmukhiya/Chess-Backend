const mongoose = require('mongoose');
const uniqid = require('uniqid');
const Game = require('../models/Game');
const Player = require('../models/Player');
const { sendError, sendSuccess } = require('../utils/apiResponse');

const WAITING_GAME_TTL_MS = 5 * 60 * 1000;

// Validates that a player id exists and loads the player.
const findPlayerById = async (playerId, res) => {
  if (!mongoose.isValidObjectId(playerId)) {
    sendError(res, 400, 'Invalid player ID');
    return null;
  }

  const player = await Player.findById(playerId);
  if (!player) {
    sendError(res, 404, 'Player not found');
    return null;
  }

  return player;
};

// Deletes abandoned waiting games after a short grace period.
const scheduleWaitingGameCleanup = (gameCode, status = 'created') => {
  setTimeout(async () => {
    try {
      const game = await Game.findOne({ gameCode });
      if (game && game.status === status && !game.playerBlack) {
        await Game.deleteOne({ gameCode });
        console.log(`Game ${gameCode} deleted after waiting timeout`);
      }
    } catch (error) {
      console.error('Waiting game cleanup failed:', error);
    }
  }, WAITING_GAME_TTL_MS);
};

// Creates a private game room for the requesting player.
exports.createGame = async (req, res) => {
  try {
    const { playerId, timeControl } = req.body;
    const player = await findPlayerById(playerId, res);
    if (!player) return null;

    const gameCode = uniqid();
    const savedGame = await Game.create({
      gameCode,
      playerWhite: player._id,
      playerBlack: null,
      timeControl: timeControl || 10,
      status: 'created'
    });

    scheduleWaitingGameCleanup(gameCode, 'created');

    return sendSuccess(res, 201, {
      message: 'Game created successfully',
      gameCode: savedGame.gameCode,
      username: player.username
    });
  } catch (err) {
    console.error(err);
    return sendError(res, 500, 'Failed to create game');
  }
};

// Finds an open random match or creates one.
exports.randomJoin = async (req, res) => {
  try {
    const { playerId, timeControl } = req.body;
    const player = await findPlayerById(playerId, res);
    if (!player) return null;

    let game = await Game.findOne({
      timeControl,
      status: 'open',
      playerBlack: null,
      playerWhite: { $ne: player._id },
      createdAt: { $gte: new Date(Date.now() - WAITING_GAME_TTL_MS) }
    });

    if (game) {
      game.playerBlack = player._id;
      game.status = 'active';
      await game.save();

      return sendSuccess(res, 200, {
        gameCode: game.gameCode,
        username: player.username,
        color: 'black'
      });
    }

    const gameCode = uniqid();
    await Game.create({
      gameCode,
      playerWhite: player._id,
      timeControl,
      status: 'open'
    });

    scheduleWaitingGameCleanup(gameCode, 'open');

    return sendSuccess(res, 200, {
      gameCode,
      username: player.username,
      color: 'white'
    });
  } catch (error) {
    console.error('Error in random match:', error);
    return sendError(res, 500, 'Server error');
  }
};

// In-memory grace period tracker. 
// Key: playerId string, Value: { gameId, timer, roomId }
const pendingDisconnects = new Map();



// Removes abandoned one-player games after disconnect.
exports.handleDisconnect = async (playerId) => {
  try {
    const game = await Game.findOne({
      $or: [
        { playerWhite: playerId, playerBlack: null },
        { playerBlack: playerId, playerWhite: null }
      ],
      status: { $in: ['open', 'created'] }
    });
 
    if (game) {
      await Game.deleteOne({ _id: game._id });
      console.log(`Game ${game.gameCode} deleted due to sole player disconnection`);
    }
  } catch (err) {
    console.error('Error handling disconnection:', err);
  }
};
 
// Starts a 30s grace period for active 2-player games on disconnect.
// Uses in-memory game object — no DB query needed.
exports.handleActiveGameDisconnect = async (playerId, gameCode, inMemoryGame, socket, io) => {
  try {
    // Only applies when both players are present
    if (!inMemoryGame || inMemoryGame.players.length < 2) return;
 
    const playerIdStr = playerId.toString();
    const disconnectedPlayer = inMemoryGame.players.find(p => p.id === playerIdStr);
    if (!disconnectedPlayer) return;
 
    const GRACE_PERIOD_MS = 30_000; // 30 seconds
 
    console.log(`Player ${playerIdStr} disconnected from game ${gameCode}. Grace period started.`);
 
    // Tell opponent to show countdown
    io.to(gameCode).emit('opponent_disconnected', {
      graceSeconds: GRACE_PERIOD_MS / 1000,
      message: 'Your opponent disconnected. Waiting for reconnection...'
    });
 
    const timer = setTimeout(async () => {
      try {
        const winnerColor = disconnectedPlayer.color === 'white' ? 'black' : 'white';
        const opponentPlayer = inMemoryGame.players.find(p => p.id !== playerIdStr);
 
        // Update game status using correct schema field: winner (not result)
        const finishedGame = await Game.findOneAndUpdate(
          { gameCode },
          { status: 'finished', winner: winnerColor },
          { new: true }
        );
 
        if (finishedGame) {
          const whiteId = finishedGame.playerWhite;
          const blackId = finishedGame.playerBlack;
          const winnerId = winnerColor === 'white' ? whiteId : blackId;
          const loserId  = winnerColor === 'white' ? blackId : whiteId;
 
          // Record win in winner's history + add points
          await Player.findByIdAndUpdate(winnerId, {
            $push: {
              games: {
                gameId:   finishedGame._id,
                outcome:  'win',
                color:    winnerColor,
                opponent: disconnectedPlayer.username,
                date:     new Date()
              }
            },
            $inc: { points: 10 }
          });
 
          // Record loss in loser's history — deduct fewer points
          await Player.findByIdAndUpdate(loserId, {
            $push: {
              games: {
                gameId:   finishedGame._id,
                outcome:  'lose',
                color:    disconnectedPlayer.color,
                opponent: opponentPlayer?.username || 'Unknown',
                date:     new Date()
              }
            },
            $inc: { points: -5 }
          });
        }
 
        // Notify room — game is over
        io.to(gameCode).emit('game_over', {
          reason:      'disconnect_forfeit',
          winnerColor,
          message:     `${disconnectedPlayer.username} failed to reconnect. You win!`
        });
 
        pendingDisconnects.delete(playerIdStr);
        console.log(`Player ${playerIdStr} forfeited game ${gameCode} — did not reconnect in time.`);
      } catch (err) {
        console.error('Error applying disconnect forfeit:', err);
      }
    }, GRACE_PERIOD_MS);
 
    pendingDisconnects.set(playerIdStr, { gameCode, timer });
  } catch (err) {
    console.error('Error in handleActiveGameDisconnect:', err);
  }
};
 
// Cancels grace period timer when player comes back in time.
exports.handleReconnect = async (playerId, gameCode, socket, io) => {
  const playerIdStr = playerId.toString();
  const pending = pendingDisconnects.get(playerIdStr);

  if (!pending) return false;

  // Resume only the same game
  if (pending.gameCode !== gameCode) {
    return false;
  }

  clearTimeout(pending.timer);
  pendingDisconnects.delete(playerIdStr);

  socket.join(gameCode);

  const game = await Game.findOne({ gameCode });

  if (!game || game.status !== 'active') {
    return false;
  }

  socket.to(gameCode).emit('opponent_reconnected', {
    message: 'Your opponent has reconnected!'
  });

  socket.emit('game_resumed', { game });

  console.log(`Player ${playerIdStr} reconnected to game ${gameCode}.`);

  return true;
};




// exports.handleReconnect = async (playerId, socket, io) => {
//   const playerIdStr = playerId.toString();
//   const pending = pendingDisconnects.get(playerIdStr);
 
//   if (!pending) return false; // Nothing pending — not a reconnect scenario
 
//   const { gameCode, timer } = pending;
 
//   clearTimeout(timer);
//   pendingDisconnects.delete(playerIdStr);
 
//   // Rejoin the socket room
//   socket.join(gameCode);
 
//   // Restore game state for the reconnecting player
//   const game = await Game.findOne({ gameCode });
 
//   // Tell the opponent they came back
//   socket.to(gameCode).emit('opponent_reconnected', {
//     message: 'Your opponent has reconnected!'
//   });
 
//   // Send reconnecting player their current game state
//   socket.emit('game_resumed', { game });
 
//   console.log(`Player ${playerIdStr} reconnected to game ${gameCode}.`);
//   return true;
// };
 
// Cancels grace period on intentional leave — prevents false forfeits.
exports.cancelGracePeriod = (playerId) => {
  const key = playerId.toString();
  const pending = pendingDisconnects.get(key);
  if (pending) {
    clearTimeout(pending.timer);
    pendingDisconnects.delete(key);
    console.log(`Grace period cancelled — intentional leave by ${key}`);
  }
};
 
// // Removes abandoned one-player games after disconnect.
// exports.handleDisconnect = async (playerId) => {
//   try {
//     const game = await Game.findOne({
//       $or: [
//         { playerWhite: playerId, playerBlack: null },
//         { playerBlack: playerId, playerWhite: null }
//       ],
//       status: { $in: ['open', 'created'] }
//     });

//     if (game) {
//       await Game.deleteOne({ _id: game._id });
//       console.log(`Game ${game.gameCode} deleted due to sole player disconnection`);
//     }
//   } catch (err) {
//     console.error('Error handling disconnection:', err);
//   }
// };

// Joins an existing private game code.
exports.joinGame = async (req, res) => {
  try {
    const { gameCode, playerId } = req.body;
    const player = await findPlayerById(playerId, res);
    if (!player) return null;

    const game = await Game.findOne({ gameCode });
    if (!game) {
      return sendError(res, 404, 'Game not found');
    }

    const whitePlayer = await Player.findById(game.playerWhite);
    if (!whitePlayer) {
      return sendError(res, 404, 'White player not found');
    }

    if (!game.playerBlack && String(game.playerWhite) !== String(player._id)) {
      game.playerBlack = player._id;
      game.status = 'active';
      await game.save();
    }

    if (game.playerBlack && String(game.playerBlack) !== String(player._id) && String(game.playerWhite) !== String(player._id)) {
      return sendError(res, 400, 'Game is already full');
    }

    const blackPlayer = game.playerBlack ? await Player.findById(game.playerBlack) : player;

    return sendSuccess(res, 200, {
      game,
      whitePlayer: whitePlayer.username,
      blackPlayer: blackPlayer ? blackPlayer.username : player.username,
      whitePlayerId: whitePlayer._id
    });
  } catch (err) {
    console.error(err);
    return sendError(res, 500, 'Failed to join game');
  }
};

// Returns saved game metadata by game code.
exports.getGameInfo = async (req, res) => {
  try {
    const { gameCode } = req.params;
    const game = await Game.findOne({ gameCode })
      .populate('playerWhite', 'username')
      .populate('playerBlack', 'username');

    if (!game) {
      return sendError(res, 404, 'Game not found');
    }

    const gameInfo = {
      ...game.toObject(),
      whitePlayer: game.playerWhite ? game.playerWhite.username : null,
      blackPlayer: game.playerBlack ? game.playerBlack.username : null
    };

    return sendSuccess(res, 200, gameInfo);
  } catch (error) {
    console.error('Error fetching game:', error);
    return sendError(res, 500, 'Server error');
  }
};

// Marks a game finished and writes both histories.
exports.endGame = async (req, res) => {
  try {
    const { gameCode, winner } = req.body;
    const game = await Game.findOne({ gameCode });

    if (!game) {
      return sendError(res, 404, 'Game not found');
    }

    game.status = 'finished';
    game.winner = winner;
    await game.save();

    const [playerWhite, playerBlack] = await Promise.all([
      Player.findById(game.playerWhite),
      Player.findById(game.playerBlack)
    ]);

    if (!playerWhite || !playerBlack) {
      return sendError(res, 404, 'One or both players not found');
    }

    await Promise.all([
      updatePlayerGameHistory(
        playerWhite._id,
        game._id,
        winner === 'white' ? 'win' : winner === 'black' ? 'lose' : 'draw',
        'white',
        playerBlack.username
      ),
      updatePlayerGameHistory(
        playerBlack._id,
        game._id,
        winner === 'black' ? 'win' : winner === 'white' ? 'lose' : 'draw',
        'black',
        playerWhite.username
      )
    ]);

    return sendSuccess(res, 200, { message: 'Game ended successfully' });
  } catch (err) {
    console.error('Error in endGame:', err);
    return sendError(res, 500, 'Failed to end game', err.message);
  }
};

// Adds one completed game to a player profile.
async function updatePlayerGameHistory(playerId, gameId, outcome, color, opponentUsername) {
  const player = await Player.findById(playerId);
  if (!player) {
    throw new Error('Player not found');
  }

  if (!opponentUsername) {
    throw new Error('Opponent username is required');
  }

  const alreadyRecorded = player.games.some((game) => String(game.gameId) === String(gameId));
  if (alreadyRecorded) return;

  player.games.push({ gameId, opponent: opponentUsername, outcome, color });

  if (outcome === 'win') {
    player.points += 10;
  } else if (outcome === 'draw') {
    player.points += 1;
  } else if (outcome === 'lose' && player.points >= 8) {
    player.points -= 8;
  }

  await player.save();
}
