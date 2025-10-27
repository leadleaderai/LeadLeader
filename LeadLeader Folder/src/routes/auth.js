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
const setSession=(req,u,r,id)=>{req.session.user={username:u,role:r,id}}
const requireAuth=(req,res,next)=>req.session?.user?next():res.status(302).redirect('/auth/login');

router.get('/auth/login',(req,res)=>res.render('login',{title:'Log in'}));

router.post('/auth/login', limiterByKey('login:ip'), async (req,res)=>{
  try{
    const inUser = String(req.body.username || '').trim();
    const inPass = String(req.body.password || '').trim();
    
    // Login validation: presence only
    if(!inUser || !inPass) {
      return res.status(400).json({ok:false,error:'Please enter username and password.'});
    }
    
    const want = inUser.toLowerCase();
    
    // Owner path
    if(OWNER_USERNAME && OWNER_PASSWORD) {
      if(want === String(OWNER_USERNAME).toLowerCase() && inPass === String(OWNER_PASSWORD)) {
        setSession(req, OWNER_USERNAME, 'owner', null);
        log('auth', { ok: true, who: 'owner', ip: req.ip });
        return res.json({ok:true,role:'owner',redirect:'/owner/users'});
      }
    }
    
    // Regular users
    await initStore();
    const user = await getByUsername(want);
    if(!user || !user.passHash) {
      log('auth', { ok: false, who: want, ip: req.ip, reason: 'bad_creds' });
      return res.status(401).json({ok:false,error:'Invalid username or password.'});
    }
    
    const ok = bcrypt.compareSync(inPass, user.passHash);
    if(!ok) {
      log('auth', { ok: false, who: want, ip: req.ip, reason: 'bad_creds' });
      return res.status(401).json({ok:false,error:'Invalid username or password.'});
    }
    
    setSession(req, user.username, user.role||'user', user.id);
    log('auth', { ok: true, who: user.username, ip: req.ip });
    res.json({ok:true,role:user.role||'user',redirect:'/dashboard'});
  }catch(e){
    log('auth', { ok: false, ip: req.ip, reason: 'exception', msg: e?.message });
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
    
    if(!vU(inUser)) return res.status(400).json({ok:false,error:'Username must be 3-32 alphanumeric characters or underscore'});
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
    setSession(req, created.username, 'user', created.id);
    log('auth', { ok: true, who: created.username, ip: req.ip });
    res.json({ok:true,redirect:'/dashboard'});
  }catch(e){ 
    if(e.code==='E_EXISTS') {
      log('auth', { ok: false, who: inUser, ip: req.ip, reason: 'user_exists' });
      return res.status(409).json({ok:false,error:'Username already taken'});
    }
    log('auth', { ok: false, ip: req.ip, reason: 'exception', msg: e?.message });
    res.status(500).json({ok:false,error:'Signup failed. Please try again.'})
  }
});

router.post('/auth/logout',(req,res)=>{ if(req.session) req.session.destroy(()=>{}); res.redirect('/') });
module.exports = router;
