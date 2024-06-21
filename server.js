// server.js

const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const gameRoutes = require('./src/routes/gameRoutes');
const playerRoutes = require('./src/routes/playerRoutes');
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

const games = {}; // Object to store all active games

const port = process.env.PORT || 5000;

// Connect to the database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/games', gameRoutes);
app.use('/api/players', playerRoutes);

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('A user connected', socket.id);

  socket.on('joinRoom', ({ gameCode, playerId, username }) => {
    socket.join(gameCode);

    if (!games[gameCode]) {
      games[gameCode] = {
        players: [{ id: playerId, username }],
        white: playerId,
        black: null,
        currentTurn: 'white'
      };
      socket.emit('playerColor', { color: 'white' });
    } else if (games[gameCode].players.length === 1) {
      games[gameCode].players.push({ id: playerId, username });
      games[gameCode].black = playerId;
      socket.emit('playerColor', { color: 'black' });

      // Emit game start event with player colors and usernames
      io.to(gameCode).emit('gameStart', {
        white: games[gameCode].players[0],
        black: games[gameCode].players[1],
        currentTurn: games[gameCode].currentTurn
      });
    }

    // Notify other players in the room about the new player
    socket.to(gameCode).emit('opponentJoined', { opponentUsername: username });
  });
  
  socket.on('makeMove', ({ gameCode, move, playerId }) => {
    console.log('make move', move, playerId);
    
    // Update the current turn
    games[gameCode].currentTurn = games[gameCode].currentTurn === 'white' ? 'black' : 'white';
    
    // Broadcast the move and the new turn to all players in the room
    io.to(gameCode).emit('moveMade', { move, playerId, currentTurn: games[gameCode].currentTurn });
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
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
