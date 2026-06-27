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
