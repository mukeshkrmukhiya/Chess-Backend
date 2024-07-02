const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const gameRoutes = require('./routes/gameRoutes');
const playerRoutes = require('./routes/playerRoutes');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENTURL,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  }
});

const games = {};
const port = process.env.PORT || 5000;

connectDB();
app.use(cors());
app.use(express.json());
app.use('/api/games', gameRoutes);
app.use('/api/players', playerRoutes);

io.on('connection', (socket) => {
  console.log('A user connected', socket.id);

  socket.on('joinRoom', ({ gameCode, playerId, username }) => {
    socket.join(gameCode);
    if (!games[gameCode]) {
      games[gameCode] = {
        players: [{ id: playerId, username, color: 'white' }],
        currentTurn: 'white'
      };
    } else if (games[gameCode].players.length === 1) {
      const existingPlayer = games[gameCode].players[0];
      const newPlayerColor = existingPlayer.color === 'white' ? 'black' : 'white';
      games[gameCode].players.push({ id: playerId, username, color: newPlayerColor });
    }
    io.to(gameCode).emit('gameState', {
      players: games[gameCode].players,
      currentTurn: games[gameCode].currentTurn
    });
  });

  socket.on('leaveGame', async ({ gameCode, playerId }) => {
    console.log(`Player ${playerId} is leaving game ${gameCode}`);
    
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
    const player = game.players.find(p => p.id === playerId);
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

  socket.on('acceptRematch', ({ gameCode, playerId }) => {
    if (games[gameCode]) {
      games[gameCode].currentTurn = 'white';
      // Swap colors for the rematch
      games[gameCode].players.forEach(player => {
        player.color = player.color === 'white' ? 'black' : 'white';
      });
      io.to(gameCode).emit('rematchAccepted');
      io.to(gameCode).emit('gameState', {
        players: games[gameCode].players,
        currentTurn: games[gameCode].currentTurn
      });
    }
  });

  socket.on('rejectRematch', ({ gameCode, playerId }) => {
    socket.to(gameCode).emit('rematchRejected');
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
    // Handle disconnection (e.g., notify other player, end game, etc.)
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

module.exports = { io };
