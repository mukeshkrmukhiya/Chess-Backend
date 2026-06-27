const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  playerWhite: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true,
    index: true
  },
  playerBlack: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    index: true
  },
  moves: [{ type: String }],
  gameCode: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['open', 'active', 'finished', 'created'],
    default: 'open',
    index: true
  },
  winner: {
    type: String,
    enum: ['white', 'black', 'draw', null],
    default: null
  },
  timeControl: {
    type: Number,
    required: true,
    index: true
  }
}, { timestamps: true });

gameSchema.index({ status: 1, timeControl: 1, createdAt: -1 });

const Game = mongoose.model('Game', gameSchema);

module.exports = Game;
