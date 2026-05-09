require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB connected'))
.catch(err => console.log(err));

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    required: true,
    trim: true
  },

  password: {
    type: String,
    required: true
  },

  bestWPM: {
    type: Number,
    default: 0
  },

  highScore: {
    type: Number,
    default: 0
  },

  accuracy: {
    type: Number,
    default: 0
  }

}, { timestamps: true });

const User = mongoose.model('User', userSchema);

function auth(req, res, next) {

  const header = req.headers.authorization || '';

  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : header;

  if (!token) {
    return res.status(401).json({
      message: 'No token'
    });
  }

  try {

    const verified = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = verified;

    next();

  } catch (err) {

    res.status(401).json({
      message: 'Invalid token'
    });

  }

}

function readOptionalFile(fileName) {

  try {

    return fs.readFileSync(
      path.join(__dirname, fileName),
      'utf8'
    );

  } catch {

    return '';

  }

}

app.get('/', (req, res) => {

  const filePath = path.join(
    __dirname,
    'index.html'
  );

  fs.readFile(filePath, 'utf8', (err, html) => {

    if (err) {
      return res.status(500).send('index.html missing');
    }

    const updateLog = readOptionalFile(
      'update-log.html'
    );

    const authUI = readOptionalFile(
      'auth-injection.html'
    );

    const injected =
      updateLog +
      '\n' +
      authUI;

    res.send(
      html.replace(
        '</body>',
        injected + '\n</body>'
      )
    );

  });

});

app.use(express.static('./'));

app.post('/signup', async (req, res) => {

  try {

    const { username, password } = req.body;

    if (!username || !password) {

      return res.status(400).json({
        message: 'Username and password required'
      });

    }

    if (username.length < 3) {

      return res.status(400).json({
        message: 'Username too short'
      });

    }

    if (password.length < 4) {

      return res.status(400).json({
        message: 'Password too short'
      });

    }

    const existing = await User.findOne({
      username
    });

    if (existing) {

      return res.status(400).json({
        message: 'Username taken'
      });

    }

    const hashed = await bcrypt.hash(
      password,
      10
    );

    const user = new User({
      username,
      password: hashed
    });

    await user.save();

    res.json({
      message: 'Account created'
    });

  } catch (err) {

    res.status(500).json({
      message: 'Server error'
    });

  }

});

app.post('/login', async (req, res) => {

  try {

    const { username, password } = req.body;

    const user = await User.findOne({
      username
    });

    if (!user) {

      return res.status(400).json({
        message: 'User not found'
      });

    }

    const valid = await bcrypt.compare(
      password,
      user.password
    );

    if (!valid) {

      return res.status(400).json({
        message: 'Wrong password'
      });

    }

    const token = jwt.sign(

      {
        id: user._id,
        username: user.username
      },

      process.env.JWT_SECRET,

      {
        expiresIn: '30d'
      }

    );

    res.json({

      token,

      username: user.username,

      bestWPM: user.bestWPM,

      highScore: user.highScore,

      accuracy: user.accuracy

    });

  } catch (err) {

    res.status(500).json({
      message: 'Server error'
    });

  }

});

app.post('/submit-score', auth, async (req, res) => {

  try {

    const {
      wpm,
      score,
      accuracy
    } = req.body;

    const user = await User.findById(
      req.user.id
    );

    if (!user) {

      return res.status(404).json({
        message: 'User not found'
      });

    }

    if (Number(wpm) > user.bestWPM) {
      user.bestWPM = Number(wpm);
    }

    if (Number(score) > user.highScore) {
      user.highScore = Number(score);
    }

    if (Number(accuracy) > user.accuracy) {
      user.accuracy = Number(accuracy);
    }

    await user.save();

    res.json({
      message: 'Score saved'
    });

  } catch (err) {

    res.status(500).json({
      message: 'Server error'
    });

  }

});

app.get('/leaderboard', async (req, res) => {

  try {

    const top = await User.find()

      .sort({
        bestWPM: -1,
        highScore: -1
      })

      .limit(10)

      .select(
        'username bestWPM highScore accuracy'
      );

    res.json(top);

  } catch (err) {

    res.status(500).json({
      message: 'Server error'
    });

  }

});

app.get('/rank/:username', async (req, res) => {

  try {

    const user = await User.findOne({
      username: req.params.username
    });

    if (!user) {

      return res.json({
        rank: null
      });

    }

    const better = await User.countDocuments({

      $or: [

        {
          bestWPM: {
            $gt: user.bestWPM
          }
        },

        {
          bestWPM: user.bestWPM,
          highScore: {
            $gt: user.highScore
          }
        }

      ]

    });

    res.json({
      rank: better + 1
    });

  } catch (err) {

    res.status(500).json({
      message: 'Server error'
    });

  }

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    'Server running on port ' + PORT
  );

});
