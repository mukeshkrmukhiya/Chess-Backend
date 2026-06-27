const Player = require('../models/Player');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { sendError, sendSuccess } = require('../utils/apiResponse');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Signs a seven-day JWT for authenticated players.
const signToken = (playerId) => jwt.sign({ id: playerId }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Registers a player and awards starting points.
exports.registerPlayer = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return sendError(res, 400, 'Please fill all fields');
  }

  try {
    const playerExists = await Player.findOne({ $or: [{ email }, { username }] });
    if (playerExists) {
      return sendError(res, 400, 'Player already exists');
    }

    const player = new Player({ username, email, password, points: 700 });
    await player.save();

    return sendSuccess(res, 201, {
      token: signToken(player._id),
      message: 'Registration successful',
      points: player.points,
      player: {
        id: player._id,
        username: player.username,
        email: player.email,
        points: player.points
      }
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((value) => value.message);
      return sendError(res, 400, messages.join(', '));
    }
    return sendError(res, 500, 'Server Error');
  }
};

// Authenticates a player and returns session data.
exports.loginPlayer = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return sendError(res, 400, 'Please provide email and password');
  }

  try {
    const player = await Player.findOne({ email });
    if (!player) {
      return sendError(res, 400, 'Invalid credentials');
    }

    if (!player.password) {
      return sendError(res, 400, 'Please sign in with Google');
    }

    const isMatch = await player.matchPassword(password);
    if (!isMatch) {
      return sendError(res, 400, 'Invalid credentials');
    }

    return sendSuccess(res, 200, {
      token: signToken(player._id),
      id: player._id,
      message: 'Login successful',
      player: {
        id: player._id,
        username: player.username,
        email: player.email,
        points: player.points
      }
    });
  } catch (err) {
    return sendError(res, 500, 'Server Error');
  }
};

// Authenticates a player with a verified Google ID token.
exports.googleLogin = async (req, res) => {
  const { credential } = req.body;

  if (!process.env.GOOGLE_CLIENT_ID) {
    return sendError(res, 503, 'Google sign-in is not configured');
  }

  if (!credential) {
    return sendError(res, 400, 'Google sign-in failed');
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload?.sub) {
      return sendError(res, 400, 'Google sign-in failed');
    }

    let player = await Player.findOne({ $or: [{ googleId: payload.sub }, { email: payload.email }] });

    if (!player) {
      const baseUsername = (payload.name || payload.email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'GooglePlayer';
      const existingUsername = await Player.findOne({ username: baseUsername });
      const username = existingUsername ? `${baseUsername}${Date.now().toString().slice(-5)}` : baseUsername;

      player = await Player.create({
        username,
        email: payload.email,
        googleId: payload.sub,
        profilePicture: payload.picture || 'default-profile-picture.jpg',
        points: 700
      });
    } else if (!player.googleId) {
      player.googleId = payload.sub;
      if (payload.picture) player.profilePicture = payload.picture;
      await player.save();
    }

    return sendSuccess(res, 200, {
      token: signToken(player._id),
      id: player._id,
      message: 'Login successful',
      player: {
        id: player._id,
        username: player.username,
        email: player.email,
        points: player.points
      }
    });
  } catch (error) {
    return sendError(res, 401, 'Google sign-in failed');
  }
};

// Returns the authenticated player's public profile.
exports.getPlayerProfile = async (req, res) => {
  try {
    const player = await Player.findById(req.player._id).select('-password');
    if (!player) {
      return sendError(res, 404, 'Player not found');
    }
    return sendSuccess(res, 200, player);
  } catch (error) {
    return sendError(res, 500, 'Server error');
  }
};

// Updates player points by an increment value.
exports.updatePoints = async (req, res) => {
  try {
    const { points } = req.body;
    const player = await Player.findByIdAndUpdate(
      req.params.id,
      { $inc: { points: Number(points) || 0 } },
      { new: true, runValidators: true }
    );

    if (!player) {
      return sendError(res, 404, 'Player not found');
    }

    return sendSuccess(res, 200, { message: 'Points updated', points: player.points });
  } catch (error) {
    return sendError(res, 500, 'Server error', error.message);
  }
};

// Lists top players for the leaderboard page.
exports.getLeaderboard = async (req, res) => {
  try {
    const players = await Player.find({})
      .select('username points games createdAt')
      .sort({ points: -1, createdAt: 1 })
      .limit(25)
      .lean();

    return sendSuccess(res, 200, {
      players: players.map((player) => ({
        _id: player._id,
        username: player.username,
        points: player.points || 0,
        gamesPlayed: player.games ? player.games.length : 0,
        createdAt: player.createdAt
      }))
    });
  } catch (error) {
    return sendError(res, 500, 'Failed to load leaderboard');
  }
};
