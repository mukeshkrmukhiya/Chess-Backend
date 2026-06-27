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
