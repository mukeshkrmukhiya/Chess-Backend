const jwt = require('jsonwebtoken');
const Player = require('../models/Player');

// Verifies Bearer token and attaches the player.
const authMiddleware = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const token = authorization.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.player = await Player.findById(decoded.id).select('-password');

    if (!req.player) {
      return res.status(401).json({ message: 'Not authorized, player not found' });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = authMiddleware;
