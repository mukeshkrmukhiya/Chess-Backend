


const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  playerWhite: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  playerBlack: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  },
  
  moves: [{ type: String }],
  gameCode: {
    type: String,
    required: true,
    unique: true
  },
  
  status: {
    type: String,
    enum: ['open', 'active', 'finished'],
    default: 'open'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  timeControl: {
    type: Number,
    required: true
  }
});

const Game = mongoose.model('Game', gameSchema);

module.exports = Game;
