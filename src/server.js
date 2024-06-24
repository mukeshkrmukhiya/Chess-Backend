//server.js

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
    origin: 'http://localhost:3000',
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
      games[gameCode].players.push({ id: playerId, username, color: 'black' });
    }

    io.to(gameCode).emit('gameState', {

      players: games[gameCode].players,
      currentTurn: games[gameCode].currentTurn
    });
  });


  socket.on('leaveGame', async ({ gameCode, playerId }) => {
    console.log(`Player ${playerId} is leaving game ${gameCode}`);
    
    if (games[gameCode]) {
      // Notify other players
      socket.to(gameCode).emit('playerLeft', { playerId });
      
      // Update the game state for remaining players
      io.to(gameCode).emit('gameState', {
        players: games[gameCode].players,
        currentTurn: games[gameCode].currentTurn
      });
    }
    
    // Leave the socket room
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
    
    // Emit updated game state after move
    io.to(gameCode).emit('gameState', {
      players: game.players,
      currentTurn: game.currentTurn
    });
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


  // socket.on('createGame', async ({ playerId, timeControl }) => {
  //   try {
  //     if (!mongoose.isValidObjectId(playerId)) {
  //       return socket.emit('error', 'Invalid player ID');
  //     }

  //     const player = await Player.findById(playerId);
  //     if (!player) {
  //       return socket.emit('error', 'Player not found');
  //     }

  //     const gameCode = uniqid();
  //     const newGame = new Game({gameCode, playerWhite: player._id, playerBlack: null, timeControl: timeControl || 10});
  //     const savedGame = await newGame.save();
  //     games[savedGame.gameCode] = { game: savedGame, players: [player._id] };

  //     // Emit the gameCreated event to the client
  //     socket.emit('gameCreated', { gameCode: savedGame.gameCode });
  //     console.log('Game created with Game Code:', savedGame.gameCode);
  //   } catch (err) {
  //     console.error(err);
  //     socket.emit('error', 'Failed to create game');
  //   }
  // });


  // socket.on('joinGame', async ({ gameCode, playerId }) => {
  //   try {
  //     if (!mongoose.isValidObjectId(playerId)) {
  //       return socket.emit('error', 'Invalid player ID');
  //     }

  //     const game = await Game.findOne({ gameCode });
  //     const player = await Player.findById(playerId);
  //     if (!game || !player) {
  //       return socket.emit('error', 'Game or player not found');
  //     }

  //     if (game.playerBlack && game.playerWhite) {
  //       // Both players are already in the game, this player is rejoining
  //       const whitePlayer = await Player.findById(game.playerWhite);
  //       const blackPlayer = await Player.findById(game.playerBlack);
  //       socket.join(gameCode);
  //       socket.emit('gameJoined', {
  //         game,
  //         whitePlayer: whitePlayer.username,
  //         blackPlayer: blackPlayer.username,
  //       });
  //     } else if (!game.playerBlack) {
  //       game.playerBlack = player._id;
  //       await game.save();
  //       const whitePlayer = await Player.findById(game.playerWhite);
  //       socket.join(gameCode);
  //       io.to(gameCode).emit('gameJoined', {
  //         game,
  //         whitePlayer: whitePlayer.username,
  //         blackPlayer: player.username,
  //       });
  //     } else {
  //       return socket.emit('error', 'Game is already full');
  //     }

  //     console.log(`Player ${player.username} joined game with code ${gameCode}`);
  //   } catch (err) {
  //     console.error(err);
  //     socket.emit('error', 'Failed to join game');
  //   }
  // });

  // socket.on('makeMove', async ({ gameCode, move, playerId }) => {
  //   try {
  //     const game = await Game.findOne({ gameCode });
  //     if (!game) {
  //       return socket.emit('error', 'Game not found');
  //     }

  //     const parsedMove = JSON.parse(move);
  //     const isWhiteTurn = game.moves.length % 2 === 0;
  //     const isPlayerWhite = game.playerWhite.toString() === playerId;
  //     const isPlayerBlack = game.playerBlack.toString() === playerId;
  //     const isValidMove =
  //       (isWhiteTurn && parsedMove.piece.color === 'white') ||
  //       (!isWhiteTurn && parsedMove.piece.color === 'black');

  //     if (!isValidMove || (isWhiteTurn && isPlayerBlack) || (!isWhiteTurn && isPlayerWhite)) {
  //       return socket.emit('error', 'Not your turn or trying to move opponent\'s piece');
  //     }

  //     game.moves.push(move);
  //     await game.save();

  //     io.to(gameCode).emit('moveMade', { move });
  //   } catch (err) {
  //     console.error(err);
  //     socket.emit('error', 'Failed to make move');
  //   }
  // });
