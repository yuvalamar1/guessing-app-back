const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = 3001;
app.use(cors());

// Connect to MongoDB database
mongoose.connect('mongodb+srv://yuvalam1:yuval123@cluster0.5ogqjtw.mongodb.net/', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define the user schema
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});
const User = mongoose.model('User', userSchema);

// Define the game schema
const gameSchema = new mongoose.Schema({
  homeTeam: String,
  awayTeam: String,
  week: Number,
  homeTeamScore: {
    type:Number,
    default: null},
  awayTeamScore: {
    type:Number,
    default: null},
  isActive: {
      type: Boolean,
      default: true,
    },
});
const Game = mongoose.model('Game', gameSchema);

// Define the user guess schema
const userGuessSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
  },
  homeTeamScore: Number,
  awayTeamScore: Number,
});

const UserGuess = mongoose.model('UserGuess', userGuessSchema);

// Middleware to parse JSON request body
app.use(express.json());

// Endpoint for user registration
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    // Create a new user
    const user = new User({ username, password });
    await user.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Endpoint for user login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    // Find the user by username
    const user = await User.findOne({ username });
    // If user not found or password doesn't match, return error
    if (!user || password !== user.password) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Generate and sign a JWT token
    const token = jwt.sign({ userId: user._id }, 'secret_key');

    // Return the token to the client
    res.json({ token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

//get active games
app.get('/api/active-games', async (req, res) => {
  try {
    // Logic to fetch active games from your database
    const activeGames = await Game.find({ isActive: true });
    console.log("asdasd : "+activeGames);
    res.json(activeGames);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/ended-games', authenticateToken, async (req, res) => {
  try {
    // Find all user guesses for the authenticated user
    const userGuesses = await UserGuess.find({ userId: req.user.userId }).populate('gameId');

    // Filter the user guesses to include only ended games and calculate points
    const endedGames = userGuesses.filter((guess) => {
      return (
        guess.gameId.isActive === false && // Check if the game is not active (ended)
        guess.homeTeamScore !== null && guess.awayTeamScore !== null // Check if the user provided a guess for home and away team scores
      );
    }).map((guess) => {
      const points = calculatePoints(guess);

      return {
        gameId: guess.gameId._id,
        homeTeam: guess.gameId.homeTeam,
        awayTeam: guess.gameId.awayTeam,
        endGameHomeTeamScore: guess.gameId.homeTeamScore,
        endGameAwayTeamScore: guess.gameId.awayTeamScore,
        userHomeTeamScore: guess.homeTeamScore,
        userAwayTeamScore: guess.awayTeamScore,
        points: points,
      };
    });

    res.json(endedGames);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Function to calculate points based on game rules
const calculatePoints = (guess) => {
  let points = 0;

  // Check if the user guessed the result correctly (3 points)
  if (
    guess.homeTeamScore === guess.gameId.homeTeamScore &&
    guess.awayTeamScore === guess.gameId.awayTeamScore
  ) {
    points = 3;
  }

  // Check if the user guessed the winning identity (1 point)
  else if (
    (guess.homeTeamScore > guess.awayTeamScore && guess.gameId.homeTeamScore > guess.gameId.awayTeamScore) ||
    (guess.homeTeamScore < guess.awayTeamScore && guess.gameId.homeTeamScore < guess.gameId.awayTeamScore) ||
    (guess.homeTeamScore === guess.awayTeamScore && guess.gameId.homeTeamScore === guess.gameId.awayTeamScore)
  ) {
    points = 1;
  }

  return points;
};




// Endpoint to get the guessing history for a user
app.get('/api/guessing-history-valid', authenticateToken, async (req, res) => {
  try {
    // Find all user guesses for the authenticated user
    const userGuesses = await UserGuess.find({ userId: req.user.userId }).populate('gameId');

    // Filter user guesses based on active games
    const activeUserGuesses = userGuesses.filter((guess) => guess.gameId && guess.gameId.isActive);

    res.json(activeUserGuesses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



// Endpoint to make a guess for a game
app.post('/api/make-guess', authenticateToken, async (req, res) => {
  const { gameId, homeTeamScore, awayTeamScore } = req.body;
  console.log("asdasdasd : "+{ gameId, homeTeamScore, awayTeamScore });
  try {
    // Check if the game exists
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }
    // Check if the game has already ended
    if (game.homeTeamScore !== null || game.awayTeamScore !== null) {
      return res.status(400).json({ message: 'Game has already ended' });
    }
    // Check if the user has already made a guess for this game
    const existingGuess = await UserGuess.findOne({
      userId: req.user.userId,
      gameId,
    });

    // If an existing guess is found, update it
    if (existingGuess) {
      existingGuess.homeTeamScore = homeTeamScore;
      existingGuess.awayTeamScore = awayTeamScore;
      await existingGuess.save();
      return res.status(200).json({ message: 'Guess updated successfully' });
    }
    // Create a new user guess
    const userGuess = new UserGuess({
      userId: req.user.userId,
      gameId,
      homeTeamScore,
      awayTeamScore,
    });
    await userGuess.save();

    res.status(201).json({ message: 'Guess created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

//add game 
app.post('/api/addgame', (req, res) => {
  const { homeTeam, awayTeam, week } = req.body;

  const game = new Game({
    homeTeam,
    awayTeam,
    week,
  });

  game.save()
    .then(() => {
      res.json({ message: 'Game added successfully' });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    });
});

// Middleware to authenticate the token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // const token = authHeader && authHeader.split(' ')[1];
  const token = authHeader;
  if (token == null) {
    return res.sendStatus(401);
  }

  jwt.verify(token, 'secret_key', (err, user) => {
    if (err) {

      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
