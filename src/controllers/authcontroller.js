
// const Player = require('../models/Player');
// const jwt = require('jsonwebtoken');

// exports.registerPlayer = async (req, res) => {
//     const { username, email, password } = req.body;

//     // Check if all fields are present
//     if (!username || !email || !password) {
//         return res.status(400).json({ message: 'Please fill all fields' });
//     }

//     try {
//         // Check if player already exists
//         const playerExists = await Player.findOne({ email });
//         if (playerExists) {
//             return res.status(400).json({ message: 'Player already exists' });
//         }

//         // Create new player
//         const player = new Player({ username, email, password });

//         // Assign 700 points to the player
//         player.points = 700;

//         await player.save();

//         // Generate token with expiration of 7 days
//         const token = jwt.sign({ id: player._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

//         // Respond with the token and success message
//         res.status(201).json({ 
//             token, 
//             message: 'Registration successful', 
//             player: {
//                 id: player._id,
//                 username: player.username,
//                 email: player.email,
//                 points: player.points
//             }
//         });
//     } catch (err) {
//         // Handle mongoose validation errors
//         if (err.name === 'ValidationError') {
//             const messages = Object.values(err.errors).map(val => val.message);
//             return res.status(400).json({ message: messages.join(', ') });
//         }
//         // Handle other errors
//         console.error('Registration error:', err);
//         res.status(500).json({ message: 'Server Error' });
//     }
// };

// exports.loginPlayer = async (req, res) => {
//     const { email, password } = req.body;

//     if (!email || !password) {
//         return res.status(400).json({ message: 'Please provide email and password' });
//     }

//     try {
//         const player = await Player.findOne({ email }).select('+password');

//         if (!player) {
//             return res.status(400).json({ message: 'Invalid credentials' });
//         }

//         const isMatch = await player.matchPassword(password);

//         if (!isMatch) {
//             return res.status(400).json({ message: 'Invalid credentials' });
//         }

//         const token = jwt.sign({ id: player._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

//         // Remove password from response
//         player.password = undefined;

//         res.status(200).json({ 
//             token, 
//             message: 'Login successful',
//             player: {
//                 id: player._id,
//                 username: player.username,
//                 email: player.email,
//                 points: player.points
//             }
//         });
//     } catch (err) {
//         console.error('Login error:', err);
//         res.status(500).json({ message: 'Server Error' });
//     }
// };


const Player = require('../models/Player');
const jwt = require('jsonwebtoken');

exports.registerPlayer = async (req, res) => {
    const { username, email, password } = req.body;

    // Check if all fields are present
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Please fill all fields' });
    }

    try {
        // Check if player already exists
        const playerExists = await Player.findOne({ email });
        if (playerExists) {
            return res.status(400).json({ message: 'Player already exists' });
        }

        // Create new player
        const player = new Player({ username, email, password });

        // Assign 700 points to the player
        player.points = 700;

        await player.save();

        // Generate token with expiration of 7 days
        const token = jwt.sign({ id: player._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        // Respond with the token and success message
        res.status(201).json({ token, message: 'Registration successful', points: player.points });
    } catch (err) {
        // Handle mongoose validation errors
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        // Handle other errors
        res.status(500).json({ message: 'Server Error' });
    }
};



exports.loginPlayer = async (req, res) => {
    const { email, password } = req.body;

    try {
        const player = await Player.findOne({ email });

        if (!player) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await player.matchPassword(password);

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: player._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(200).json({ token, id: player._id, message: 'Login successful' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
};



// Controller
exports.getPlayerProfile = async (req, res) => {
    try {
        const player = await Player.findById(req.player._id).select('-password');
        if (!player) {
            return res.status(404).json({ message: 'Player not found' });
        }
        res.json(player);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};



exports.updatePoints = async (req, res) => {
    try {
      const { points } = req.body;
      const player = await Player.findByIdAndUpdate(
        req.params.id,
        { $inc: { points } },
        { new: true, runValidators: true }
      );
      if (!player) {
        return res.status(404).json({ message: 'Player not found' });
      }
      res.status(200).json({ message: 'Points updated', points: player.points });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  };

