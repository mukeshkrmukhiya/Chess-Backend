const {
  handleDisconnect,
  handleActiveGameDisconnect,
  handleReconnect,
  cancelGracePeriod
} = require('../controllers/gameController');
const Game = require('../models/Game');

// In-memory room state: { [gameCode]: { players: [], currentTurn: 'white' } }
const games = {};

// Registers all Socket.IO events for online game rooms.
const registerGameSocket = (io) => {
  io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    // Read playerId from handshake auth (sent by client on connect).
    // This allows reconnect detection before any 'joinRoom' event fires.
    // const connectingPlayerId = socket.handshake.auth?.playerId;
    // if (connectingPlayerId) {
    //   socket.playerId = connectingPlayerId;
    //   await handleReconnect(connectingPlayerId, socket, io);
    // }

    // ─── joinRoom ──────────────────────────────────────────────────────────
    // socket.on('joinRoom', async ({ gameCode, playerId, username }) => {
    //   socket.join(gameCode);
    //   socket.playerId = playerId;                          // required for disconnect handler
    //   socket.player  = { id: playerId, username, gameCode };

    socket.on('joinRoom', async ({ gameCode, playerId, username }) => {
  socket.join(gameCode);
  socket.playerId = playerId;
  socket.player = { id: playerId, username, gameCode };

  // Check for valid reconnect
  const resumed = await handleReconnect(
    playerId,
    gameCode,
    socket,
    io
  );

  if (resumed) {
    return;
  }

      if (!games[gameCode]) {
        // First player — create in-memory room
        games[gameCode] = {
          players:     [{ id: playerId, username, color: 'white' }],
          currentTurn: 'white'
        };
      } else if (
        games[gameCode].players.length === 1 &&
        !games[gameCode].players.some((p) => p.id === playerId)
      ) {
        // Second player joining — assign opposite color
        const existingPlayer = games[gameCode].players[0];
        const newColor = existingPlayer.color === 'white' ? 'black' : 'white';
        games[gameCode].players.push({ id: playerId, username, color: newColor });

        // Update MongoDB: set status to 'active' and assign playerBlack.
        // This is required so DB queries in controller can find active games.
        await Game.findOneAndUpdate(
          { gameCode, status: { $in: ['open', 'created'] } },
          { status: 'active', playerBlack: playerId }
        );

        socket.to(gameCode).emit('opponentJoined', { gameCode });
      }

      io.to(gameCode).emit('gameState', {
        players:     games[gameCode].players,
        currentTurn: games[gameCode].currentTurn
      });
    });

    // ─── leaveGame ─────────────────────────────────────────────────────────
    socket.on('leaveGame', ({ gameCode, playerId }) => {
      // Mark as intentional so disconnect handler skips grace period
      socket.intentionalLeave = true;
      cancelGracePeriod(playerId);

      if (games[gameCode]) {
        // Remove player BEFORE emitting updated state
        games[gameCode].players = games[gameCode].players.filter(
          (p) => p.id !== playerId
        );

        socket.to(gameCode).emit('playerLeft', { playerId });

        if (games[gameCode].players.length === 0) {
          delete games[gameCode];
        } else {
          io.to(gameCode).emit('gameState', {
            players:     games[gameCode].players,
            currentTurn: games[gameCode].currentTurn
          });
        }
      }
      socket.leave(gameCode);
    });

    // ─── makeMove ──────────────────────────────────────────────────────────
    socket.on('makeMove', ({ gameCode, move, playerId }) => {
      const game = games[gameCode];
      if (!game) return;

      const player = game.players.find((entry) => entry.id === playerId);
      if (!player || player.color !== game.currentTurn) {
        socket.emit('invalidMove', { message: "It's not your turn" });
        return;
      }

      game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white';
      io.to(gameCode).emit('moveMade', { move, playerId, currentTurn: game.currentTurn });
      io.to(gameCode).emit('gameState', {
        players:     game.players,
        currentTurn: game.currentTurn
      });
    });

    // ─── requestRematch ────────────────────────────────────────────────────
    socket.on('requestRematch', ({ gameCode, playerId }) => {
      socket.to(gameCode).emit('rematchRequested', { requestingPlayerId: playerId });
    });

    // ─── acceptRematch ─────────────────────────────────────────────────────
    socket.on('acceptRematch', ({ gameCode }) => {
      if (games[gameCode]) {
        games[gameCode].currentTurn = 'white';
        games[gameCode].players.forEach((player) => {
          player.color = player.color === 'white' ? 'black' : 'white';
        });
        io.to(gameCode).emit('rematchAccepted');
        io.to(gameCode).emit('gameState', {
          players:     games[gameCode].players,
          currentTurn: games[gameCode].currentTurn
        });
      }
    });

    // ─── rejectRematch ─────────────────────────────────────────────────────
    socket.on('rejectRematch', ({ gameCode }) => {
      socket.to(gameCode).emit('rematchRejected');
    });

    // ─── disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      // Skip if player never authenticated or left intentionally
      if (!socket.playerId || socket.intentionalLeave) return;

      // 1. Delete waiting (one-player) room from DB if present
      await handleDisconnect(socket.playerId);

      // 2. Start grace period for active 2-player game using in-memory state
      const gameCode = socket.player?.gameCode;
      if (gameCode && games[gameCode]) {
        await handleActiveGameDisconnect(
          socket.playerId,
          gameCode,
          games[gameCode],   // pass in-memory object — avoids stale DB status issue
          socket,
          io
        );
      }
    });
  });
};

module.exports = registerGameSocket;