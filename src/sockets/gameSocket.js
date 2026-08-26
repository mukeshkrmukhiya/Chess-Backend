const {
  handleDisconnect,
  handleActiveGameDisconnect,
  handleReconnect,
  cancelGracePeriod,
  buildRoomFromDb
} = require('../controllers/gameController');
const Game = require('../models/Game');

// In-memory room state: { [gameCode]: { players: [], currentTurn: 'white' } }
const games = {};

// playerId -> socket.id of the ONE socket that currently owns that player.
// Socket.IO issues a new socket.id on every reconnect, so a player can briefly
// hold two live sockets server-side: the dead one still awaiting ping timeout
// and the fresh one. Without this map the dead socket's late 'disconnect' is
// indistinguishable from a real one and forfeits a game already back in play.
const playerSockets = {};

// Registers all Socket.IO events for online game rooms.
const registerGameSocket = (io) => {
  io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', async ({ gameCode, playerId, username }) => {
      socket.join(gameCode);
      socket.playerId = playerId;
      socket.player = { id: playerId, username, gameCode };

      // Claim this player. Any earlier socket is now stale: flag it so its
      // disconnect handler no-ops, then close it instead of waiting on ping
      // timeout.
      const staleSocketId = playerSockets[playerId];
      playerSockets[playerId] = socket.id;

      if (staleSocketId && staleSocketId !== socket.id) {
        const staleSocket = io.sockets.sockets.get(staleSocketId);
        if (staleSocket) {
          staleSocket.intentionalLeave = true;
          staleSocket.disconnect(true);
        }
      }

      // Cancels any pending grace period and notifies the opponent.
      const resumed = await handleReconnect(playerId, gameCode, socket, io);

      // Recover room state from Mongo when it is missing but the DB still holds
      // a live game. Without this, makeMove silently no-ops and the colour
      // assignment below would hand this player 'white' regardless of their
      // actual side.
      if (!games[gameCode]) {
        const rebuilt = await buildRoomFromDb(gameCode);
        if (rebuilt) games[gameCode] = rebuilt;
      }

      if (resumed) {
        if (games[gameCode]) {
          io.to(gameCode).emit('gameState', {
            players:     games[gameCode].players,
            currentTurn: games[gameCode].currentTurn
          });
        }
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

      // Release ownership so a later rejoin is not mistaken for a stale socket
      if (playerSockets[playerId] === socket.id) {
        delete playerSockets[playerId];
      }

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

      // Surface this instead of returning silently — a missing room used to
      // freeze the board with no indication anything had gone wrong.
      if (!game) {
        socket.emit('invalidMove', { message: 'Game session not found. Please rejoin.' });
        return;
      }

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

      // Stale socket: this player already reconnected on a newer one. Starting a
      // grace period here would forfeit a game that is actively being played.
      if (playerSockets[socket.playerId] !== socket.id) return;

      delete playerSockets[socket.playerId];

      const gameCode = socket.player?.gameCode;
      const room = gameCode ? games[gameCode] : null;

      // Only reap waiting rooms from the DB. A full game goes to the grace
      // period instead, so it must not be deleted here.
      if (!room || room.players.length < 2) {
        await handleDisconnect(socket.playerId);
      }

      // Start grace period for active 2-player game using in-memory state
      if (room) {
        await handleActiveGameDisconnect(
          socket.playerId,
          gameCode,
          room,   // pass in-memory object — avoids stale DB status issue
          socket,
          io
        );
      }
    });
  });
};

module.exports = registerGameSocket;