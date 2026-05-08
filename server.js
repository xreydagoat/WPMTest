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
 username: { type: String, unique: true, required: true, trim: true },
 password: { type: String, required: true },
 bestWPM: { type: Number, default: 0 },
 highScore: { type: Number, default: 0 },
 accuracy: { type: Number, default: 0 }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

function auth(req,res,next){
 const header = req.headers.authorization || '';
 const token = header.startsWith('Bearer ') ? header.slice(7) : header;
 if(!token) return res.status(401).json({message:'No token'});
 try {
   const verified = jwt.verify(token, process.env.JWT_SECRET);
   req.user = verified;
   next();
 } catch(err){
   res.status(401).json({message:'Invalid token'});
 }
}

const authAndLeaderboardInjection = String.raw`
<style>
  .auth-panel-btn{font-family:VT323,monospace;font-size:1.45rem;background:rgba(24,24,27,.86);border:2px solid var(--gold);border-radius:999px;padding:.45rem .95rem;color:var(--gold);box-shadow:0 0 25px rgba(251,191,36,.18);cursor:pointer}.auth-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:10000;align-items:center;justify-content:center;padding:1rem}.auth-card{background:#18181b;border:5px solid var(--main);border-radius:24px;padding:1.4rem;width:min(92vw,440px);box-shadow:0 0 55px rgba(0,0,0,.6)}.auth-card h2{font-size:3rem;color:var(--main);text-align:center;margin:.2rem 0 1rem}.auth-card input{width:100%;font-family:VT323,monospace;font-size:1.5rem;background:#09090b;color:white;border:2px solid #3f3f46;border-radius:14px;padding:.85rem;margin:.4rem 0}.auth-card button{width:100%;font-size:1.6rem;border-radius:14px;padding:.85rem;margin:.4rem 0;background:var(--main);color:#050505}.auth-card .ghost{background:#27272a;color:white;border:2px solid #3f3f46}.auth-msg{font-size:1.3rem;text-align:center;color:var(--gold);min-height:1.5rem}.leader-row{display:grid;grid-template-columns:44px 1fr 70px 80px;gap:.4rem;align-items:center;font-size:1.4rem;border-bottom:1px solid #333;padding:.45rem 0}.leader-head{color:var(--gold)}.leader-self{border:2px solid var(--gold);border-radius:14px;padding:.7rem;margin:.7rem 0;color:var(--gold);font-size:1.5rem;text-align:center}.account-chip{color:var(--gold);font-size:1.35rem;align-self:center}
</style>
<div id="auth-overlay" class="auth-overlay">
  <div class="auth-card">
    <h2 id="auth-title">LOGIN</h2>
    <input id="auth-username" placeholder="username" autocomplete="username">
    <input id="auth-password" placeholder="password" type="password" autocomplete="current-password">
    <div class="auth-msg" id="auth-msg"></div>
    <button onclick="authSubmit()" id="auth-submit">LOGIN</button>
    <button onclick="toggleAuthMode()" class="ghost" id="auth-switch">Need an account? Sign up</button>
    <button onclick="closeAuth()" class="ghost">CLOSE</button>
  </div>
</div>
<div id="leader-overlay" class="auth-overlay">
  <div class="auth-card" style="width:min(92vw,560px)">
    <h2>LEADERBOARD</h2>
    <div id="my-rank" class="leader-self">Login to see your rank.</div>
    <div class="leader-row leader-head"><span>#</span><span>USER</span><span>WPM</span><span>SCORE</span></div>
    <div id="leader-list"></div>
    <button onclick="loadLeaderboard()">REFRESH</button>
    <button onclick="closeLeaderboard()" class="ghost">CLOSE</button>
  </div>
</div>
<script>
(function(){
  let signupMode=false;
  const tokenKey='nitroToken';
  const userKey='nitroUser';
  window.currentNitroUser=localStorage.getItem(userKey)||'';

  function addAuthButtons(){
    const top=document.querySelector('.top-actions');
    if(!top || document.getElementById('login-btn')) return;
    const chip=document.createElement('span');
    chip.id='account-chip';
    chip.className='account-chip';
    chip.textContent=window.currentNitroUser ? '👤 '+window.currentNitroUser : 'Guest';
    const login=document.createElement('button');
    login.id='login-btn';
    login.type='button';
    login.className='auth-panel-btn';
    login.textContent=window.currentNitroUser ? '🚪 LOGOUT' : '🔐 LOGIN';
    login.onclick=function(){ window.currentNitroUser ? logout() : openAuth(false); };
    const board=document.createElement('button');
    board.type='button';
    board.className='auth-panel-btn';
    board.textContent='🏁 LEADERBOARD';
    board.onclick=openLeaderboard;
    top.prepend(board); top.prepend(login); top.prepend(chip);
  }

  function updateAccountUI(){
    const chip=document.getElementById('account-chip');
    const btn=document.getElementById('login-btn');
    if(chip) chip.textContent=window.currentNitroUser ? '👤 '+window.currentNitroUser : 'Guest';
    if(btn) btn.textContent=window.currentNitroUser ? '🚪 LOGOUT' : '🔐 LOGIN';
  }

  window.openAuth=function(signup=false){ signupMode=signup; document.getElementById('auth-overlay').style.display='flex'; renderAuthMode(); };
  window.closeAuth=function(){ document.getElementById('auth-overlay').style.display='none'; };
  window.toggleAuthMode=function(){ signupMode=!signupMode; renderAuthMode(); };
  function renderAuthMode(){
    document.getElementById('auth-title').textContent=signupMode?'SIGN UP':'LOGIN';
    document.getElementById('auth-submit').textContent=signupMode?'CREATE ACCOUNT':'LOGIN';
    document.getElementById('auth-switch').textContent=signupMode?'Already have an account? Login':'Need an account? Sign up';
    document.getElementById('auth-msg').textContent='';
  }
  function setAuthMsg(m){ document.getElementById('auth-msg').textContent=m; }

  window.authSubmit=async function(){
    const username=document.getElementById('auth-username').value.trim();
    const password=document.getElementById('auth-password').value;
    if(username.length<3 || password.length<4){ setAuthMsg('Use 3+ letters and 4+ password characters.'); return; }
    const url=signupMode?'/signup':'/login';
    try{
      const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
      const data=await res.json();
      if(!res.ok){ setAuthMsg(data.message||'Something went wrong.'); return; }
      if(signupMode){ setAuthMsg('Account made. Now login.'); signupMode=false; renderAuthMode(); return; }
      localStorage.setItem(tokenKey,data.token); localStorage.setItem(userKey,data.username);
      window.currentNitroUser=data.username; highScore=Math.max(highScore, Number(data.highScore||0)); bestWPM=Math.max(bestWPM, Number(data.bestWPM||0));
      if(highScoreEl) highScoreEl.textContent=String(highScore);
      updateAccountUI(); closeAuth(); loadLeaderboard();
      if(typeof toast==='function') toast('Logged in as '+data.username);
    }catch(e){ setAuthMsg('Server not ready yet.'); }
  };

  window.logout=function(){ localStorage.removeItem(tokenKey); localStorage.removeItem(userKey); window.currentNitroUser=''; updateAccountUI(); if(typeof toast==='function') toast('Logged out.'); };

  window.submitScoreOnline=async function(){
    const token=localStorage.getItem(tokenKey); if(!token) return;
    const accuracy = totalAttempts > 0 ? Math.round((totalCorrectChars / totalAttempts) * 100) : 100;
    const score = Math.floor(totalEffective * 100 + bestWPM * 10 + maxCombo * 5 - totalMistakes * 8);
    try{
      await fetch('/submit-score',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({wpm:bestWPM,score,accuracy})});
      loadLeaderboard();
    }catch(e){}
  };

  window.openLeaderboard=function(){ document.getElementById('leader-overlay').style.display='flex'; loadLeaderboard(); };
  window.closeLeaderboard=function(){ document.getElementById('leader-overlay').style.display='none'; };
  window.loadLeaderboard=async function(){
    try{
      const res=await fetch('/leaderboard'); const list=await res.json();
      document.getElementById('leader-list').innerHTML=list.map((u,i)=>'<div class="leader-row"><span>'+(i+1)+'</span><span>'+escapeHtml(u.username)+'</span><span>'+Math.round(u.bestWPM||0)+'</span><span>'+Math.round(u.highScore||0)+'</span></div>').join('') || '<div class="auth-msg">No scores yet.</div>';
      if(window.currentNitroUser){
        const r=await fetch('/rank/'+encodeURIComponent(window.currentNitroUser)); const rank=await r.json();
        document.getElementById('my-rank').textContent='YOUR RANK: #'+(rank.rank||'?')+' • '+window.currentNitroUser;
      } else document.getElementById('my-rank').textContent='Login to see your rank.';
    }catch(e){ document.getElementById('leader-list').innerHTML='<div class="auth-msg">Leaderboard unavailable.</div>'; }
  };
  function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  window.addEventListener('load',function(){
    addAuthButtons(); updateAccountUI();
    const oldWin=window.showWinModal;
    if(typeof oldWin==='function') window.showWinModal=function(){ oldWin(); submitScoreOnline(); };
  });
})();
</script>
`;

app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('index.html missing');
    res.send(html.replace('</body>', authAndLeaderboardInjection + '\n</body>'));
  });
});

app.use(express.static('./'));

app.post('/signup', async (req,res)=>{
 try {
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({message:'Username and password required'});
  if(username.length < 3) return res.status(400).json({message:'Username too short'});
  if(password.length < 4) return res.status(400).json({message:'Password too short'});

  const existing = await User.findOne({ username });
  if(existing) return res.status(400).json({message:'Username taken'});

  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashed });
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

  const token = jwt.sign({ id:user._id, username:user.username }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username:user.username, bestWPM:user.bestWPM, highScore:user.highScore, accuracy:user.accuracy });
 } catch(err){
  res.status(500).json({message:'Server error'});
 }
});

app.post('/submit-score', auth, async (req,res)=>{
 try {
  const { wpm, score, accuracy } = req.body;
  const user = await User.findById(req.user.id);
  if(!user) return res.status(404).json({message:'User not found'});

  if(Number(wpm) > user.bestWPM) user.bestWPM = Number(wpm);
  if(Number(score) > user.highScore) user.highScore = Number(score);
  if(Number(accuracy) > user.accuracy) user.accuracy = Number(accuracy);

  await user.save();
  res.json({message:'Score saved'});
 } catch(err){
  res.status(500).json({message:'Server error'});
 }
});

app.get('/leaderboard', async (req,res)=>{
 try {
  const top = await User.find().sort({ bestWPM:-1, highScore:-1 }).limit(10).select('username bestWPM highScore accuracy');
  res.json(top);
 } catch(err){
  res.status(500).json({message:'Server error'});
 }
});

app.get('/rank/:username', async (req,res)=>{
 try {
  const user = await User.findOne({ username: req.params.username });
  if(!user) return res.json({ rank: null });
  const better = await User.countDocuments({
    $or: [
      { bestWPM: { $gt: user.bestWPM } },
      { bestWPM: user.bestWPM, highScore: { $gt: user.highScore } }
    ]
  });
  res.json({ rank: better + 1 });
 } catch(err){
  res.status(500).json({message:'Server error'});
 }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{
 console.log('Server running on port ' + PORT);
});