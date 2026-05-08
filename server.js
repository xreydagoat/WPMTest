require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('./'));

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB connected'))
.catch(err => console.log(err));

const userSchema = new mongoose.Schema({
 username: { type: String, unique: true },
 password: String,
 bestWPM: { type: Number, default: 0 },
 highScore: { type: Number, default: 0 },
 accuracy: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

function auth(req,res,next){
 const token = req.headers.authorization;
 if(!token) return res.status(401).json({message:'No token'});
 try {
   const verified = jwt.verify(token, process.env.JWT_SECRET);
   req.user = verified;
   next();
 } catch(err){
   res.status(401).json({message:'Invalid token'});
 }
}

app.post('/signup', async (req,res)=>{
 try {
  const { username, password } = req.body;

  const existing = await User.findOne({ username });
  if(existing) return res.status(400).json({message:'Username taken'});

  const hashed = await bcrypt.hash(password, 10);

  const user = new User({
   username,
   password: hashed
  });

  await user.save();

  res.json({message:'Account created'});
 } catch(err){
  res.status(500).json({message:'Server error'});
 }
});

app.post('/login', async (req,res)=>{
 try {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if(!user) return res.status(400).json({message:'User not found'});

  const valid = await bcrypt.compare(password, user.password);
  if(!valid) return res.status(400).json({message:'Wrong password'});

  const token = jwt.sign({ id:user._id, username:user.username }, process.env.JWT_SECRET);

  res.json({
   token,
   username:user.username,
   bestWPM:user.bestWPM,
   highScore:user.highScore
  });
 } catch(err){
  res.status(500).json({message:'Server error'});
 }
});

app.post('/submit-score', auth, async (req,res)=>{
 try {
  const { wpm, score, accuracy } = req.body;

  const user = await User.findById(req.user.id);

  if(wpm > user.bestWPM) user.bestWPM = wpm;
  if(score > user.highScore) user.highScore = score;
  if(accuracy > user.accuracy) user.accuracy = accuracy;

  await user.save();

  res.json({message:'Score saved'});
 } catch(err){
  res.status(500).json({message:'Server error'});
 }
});

app.get('/leaderboard', async (req,res)=>{
 try {
  const top = await User.find()
   .sort({ bestWPM:-1 })
   .limit(10)
   .select('username bestWPM highScore accuracy');

  res.json(top);
 } catch(err){
  res.status(500).json({message:'Server error'});
 }
});

app.get('/rank/:username', async (req,res)=>{
 try {
  const users = await User.find().sort({ bestWPM:-1 });

  const rank = users.findIndex(u => u.username === req.params.username) + 1;

  res.json({ rank });
 } catch(err){
  res.status(500).json({message:'Server error'});
 }
});

app.listen(3000, ()=>{
 console.log('Server running on port 3000');
});