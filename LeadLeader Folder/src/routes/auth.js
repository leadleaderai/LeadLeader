const express = require('express'); const bcrypt = require('bcryptjs');
const fetch = global.fetch;
const { initStore, getByUsername, createUser } = require('../utils/usersStore');
const { limiterByKey } = require('../utils/limiters');
const { log } = require('../utils/logger');
const router = express.Router();
const OWNER_USERNAME = process.env.OWNER_USERNAME || 'LeadLeaderCeo';
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || '';
const SIGNUP_ENABLED = String(process.env.SIGNUP_ENABLED || 'true')==='true';
const REQUIRE_HCAPTCHA_SIGNUP = String(process.env.REQUIRE_HCAPTCHA_SIGNUP || 'false')==='true';
const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET || '';
const HCAPTCHA_SITEKEY = process.env.HCAPTCHA_SITEKEY || '';
const vU = u=>/^[a-z0-9_]{3,32}$/i.test(String(u||'')); const vP=p=>{const s=String(p||''); return s.length>=8 && s.length<=128}
const setSession=(req,u,r)=>{req.session.user={username:u,role:r}}
const requireAuth=(req,res,next)=>req.session?.user?next():res.status(302).redirect('/auth/login');

router.get('/auth/login',(req,res)=>res.render('login',{title:'Log in'}));

router.post('/auth/login', limiterByKey('login:ip'), async (req,res)=>{
  try{
    const {username,password}=req.body||{};
    const inUser = (username||'').trim();
    const inPass = (password||'').trim();
    
    if(!inUser || inUser.length < 3 || inUser.length > 32) {
      return res.status(400).json({ok:false,error:'Username must be 3-32 characters'});
    }
    if(!inPass || inPass.length < 8 || inPass.length > 128) {
      return res.status(400).json({ok:false,error:'Password must be 8-128 characters'});
    }
    
    const ownerUser = (OWNER_USERNAME||'').trim();
    const ownerPass = (OWNER_PASSWORD||'').trim();
    
    // Case-insensitive owner check
    if(inUser.toLowerCase() === ownerUser.toLowerCase()){
      if(!ownerPass) return res.status(403).json({ok:false,error:'Owner account not configured'});
      if(inPass !== ownerPass) {
        log('auth_login', { ok: false, username: inUser, role: 'owner', ip: req.ip });
        return res.status(401).json({ok:false,error:'Invalid credentials'});
      }
      setSession(req, ownerUser, 'owner');
      log('auth_login', { ok: true, username: ownerUser, role: 'owner', ip: req.ip });
      return res.json({ok:true,role:'owner',redirect:'/owner/users'});
    }
    
    await initStore();
    const user=await getByUsername(inUser);
    if(!user) {
      log('auth_login', { ok: false, username: inUser, ip: req.ip });
      return res.status(401).json({ok:false,error:'Invalid credentials'});
    }
    const ok=bcrypt.compareSync(inPass,user.passHash||'');
    if(!ok) {
      log('auth_login', { ok: false, username: inUser, ip: req.ip });
      return res.status(401).json({ok:false,error:'Invalid credentials'});
    }
    setSession(req, user.username, user.role||'user');
    log('auth_login', { ok: true, username: user.username, role: user.role||'user', ip: req.ip });
    res.json({ok:true,role:user.role||'user',redirect:'/dashboard'});
  }catch(e){
    log('auth_login', { ok: false, error: e.message, ip: req.ip });
    res.status(500).json({ok:false,error:'Login failed. Please try again.'})
  }
});

router.get('/auth/signup',(req,res)=> {
  if(!SIGNUP_ENABLED) return res.status(404).send('Signups disabled');
  res.render('signup',{title:'Sign up',requireHCaptcha:REQUIRE_HCAPTCHA_SIGNUP,sitekey:HCAPTCHA_SITEKEY});
});

async function verifyHCaptcha(tok){
  if(!HCAPTCHA_SECRET) return false;
  const r=await fetch('https://hcaptcha.com/siteverify',{method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({secret:HCAPTCHA_SECRET,response:tok})});
  const j=await r.json(); return !!j.success;
}

router.post('/auth/signup', limiterByKey('signup:ip'), async (req,res)=>{
  try{
    if(!SIGNUP_ENABLED) return res.status(404).json({ok:false,error:'Signups are currently disabled'});
    const {username,password}=req.body||{};
    const inUser = (username||'').trim();
    const inPass = (password||'').trim();
    
    if(!vU(inUser)) return res.status(400).json({ok:false,error:'Username must be 3-32 alphanumeric characters'});
    if(!vP(inPass)) return res.status(400).json({ok:false,error:'Password must be 8-128 characters'});
    
    if(REQUIRE_HCAPTCHA_SIGNUP){
      const tok=req.body['h-captcha-response']; 
      if(!tok) return res.status(400).json({ok:false,error:'Please complete the captcha'});
      const ok=await verifyHCaptcha(tok); 
      if(!ok) return res.status(400).json({ok:false,error:'Captcha verification failed'});
    }
    await initStore(); 
    const passHash=bcrypt.hashSync(inPass,10);
    const created=await createUser({username:inUser,passHash,role:'user'});
    setSession(req, created.username, 'user');
    log('auth_signup', { ok: true, username: created.username, ip: req.ip });
    res.json({ok:true,redirect:'/dashboard'});
  }catch(e){ 
    if(e.code==='E_EXISTS') {
      log('auth_signup', { ok: false, error: 'user_exists', username: inUser, ip: req.ip });
      return res.status(409).json({ok:false,error:'Username already taken'});
    }
    log('auth_signup', { ok: false, error: e.message, ip: req.ip });
    res.status(500).json({ok:false,error:'Signup failed. Please try again.'})
  }
});

router.post('/auth/logout',(req,res)=>{ if(req.session) req.session.destroy(()=>{}); res.redirect('/') });
router.get('/dashboard', requireAuth, (req,res)=>res.render('dashboard_future',{title:'Dashboard (Preview)'}));
module.exports = router;
