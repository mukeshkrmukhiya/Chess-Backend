const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const playerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId;
    },
    minlength: 6
  },
  googleId: {
    type: String,
    index: true,
    sparse: true
  },
  profilePicture: {
    type: String,
    default: 'default-profile-picture.jpg'
  },
  points: {
    type: Number,
    default: 0,
    index: true
  },
  games: [{
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game'
    },
    opponent: {
      type: String
    },
    outcome: {
      type: String,
      enum: ['win', 'lose', 'draw'],
      required: true
    },
    color: {
      type: String,
      enum: ['white', 'black'],
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

// Hashes changed passwords before persistence.
playerSchema.pre('save', async function(next) {
  if (this.isModified('password') && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Compares submitted password with stored hash.
playerSchema.methods.matchPassword = async function(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

const Player = mongoose.model('Player', playerSchema);
module.exports = Player;
