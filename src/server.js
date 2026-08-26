const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

const connectDB = require('./config/db');
const gameRoutes = require('./routes/gameRoutes');
const playerRoutes = require('./routes/playerRoutes');
const errorMiddleware = require('./middleware/errorMiddleware');
const rateLimiter = require('./middleware/rateLimiter');
const registerGameSocket = require('./sockets/gameSocket');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5000;
const clientUrl = process.env.CLIENTURL || 'http://localhost:3000';

const io = socketIO(server, {
  // Worst-case drop detection is pingInterval + pingTimeout. The defaults
  // (25s + 20s = 45s) exceed the 30s disconnect grace period, so a dropped
  // player was forfeited before the server even noticed they had gone. Keep the
  // total (~18s) comfortably inside that window, while staying tolerant of
  // ordinary mobile latency spikes.
  pingInterval: 10000,
  pingTimeout: 8000,
  transports: ['websocket', 'polling'],

  cors: {
    origin: clientUrl,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

// Boots database, middleware, routes, and sockets.
connectDB();
app.use(cors({ origin: clientUrl }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimiter());
app.use('/api/games', gameRoutes);
app.use('/api/players', playerRoutes);
app.use(errorMiddleware);

registerGameSocket(io);

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

module.exports = { io, app, server };
