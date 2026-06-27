const { handleDisconnect } = require('../controllers/gameController');

const games = {};

// Registers Socket.IO events for online game rooms.
const registerGameSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('A user connected', socket.id);

    socket.on('joinRoom', ({ gameCode, playerId, username }) => {
      socket.join(gameCode);
      socket.player = { id: playerId, username, gameCode };

      if (!games[gameCode]) {
        games[gameCode] = {
          players: [{ id: playerId, username, color: 'white' }],
          currentTurn: 'white'
        };
      } else if (games[gameCode].players.length === 1 && !games[gameCode].players.some((player) => player.id === playerId)) {
        const existingPlayer = games[gameCode].players[0];
        const newPlayerColor = existingPlayer.color === 'white' ? 'black' : 'white';
        games[gameCode].players.push({ id: playerId, username, color: newPlayerColor });
        socket.to(gameCode).emit('opponentJoined', { gameCode });
      }

      io.to(gameCode).emit('gameState', {
        players: games[gameCode].players,
        currentTurn: games[gameCode].currentTurn
      });
    });

    socket.on('leaveGame', ({ gameCode, playerId }) => {
      if (games[gameCode]) {
        socket.to(gameCode).emit('playerLeft', { playerId });
        io.to(gameCode).emit('gameState', {
          players: games[gameCode].players,
          currentTurn: games[gameCode].currentTurn
        });
      }
      socket.leave(gameCode);
    });

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
        players: game.players,
        currentTurn: game.currentTurn
      });
    });

    socket.on('requestRematch', ({ gameCode, playerId }) => {
      socket.to(gameCode).emit('rematchRequested', { requestingPlayerId: playerId });
    });

    socket.on('acceptRematch', ({ gameCode }) => {
      if (games[gameCode]) {
        games[gameCode].currentTurn = 'white';
        games[gameCode].players.forEach((player) => {
          player.color = player.color === 'white' ? 'black' : 'white';
        });
        io.to(gameCode).emit('rematchAccepted');
        io.to(gameCode).emit('gameState', {
          players: games[gameCode].players,
          currentTurn: games[gameCode].currentTurn
        });
      }
    });

    socket.on('rejectRematch', ({ gameCode }) => {
      socket.to(gameCode).emit('rematchRejected');
    });

    socket.on('disconnect', () => {
      console.log('A user disconnected');
      if (!socket.player) return;

      const { id: playerId, gameCode } = socket.player;
      handleDisconnect(playerId, gameCode);
      socket.to(gameCode).emit('playerDisconnected', { playerId });

      if (games[gameCode]) {
        games[gameCode].players = games[gameCode].players.filter((player) => player.id !== playerId);
        if (games[gameCode].players.length === 0) {
          delete games[gameCode];
        } else {
          io.to(gameCode).emit('gameState', {
            players: games[gameCode].players,
            currentTurn: games[gameCode].currentTurn
          });
        }
      }
    });
  });
};

module.exports = registerGameSocket;
