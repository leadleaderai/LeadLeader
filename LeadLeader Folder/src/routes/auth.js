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
const USER_RE = /^[A-Za-z0-9_]{3,32}$/;
const vP=p=>{const s=String(p||''); return s.length>=8 && s.length<=128}
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
    
    const wantLC = inUser.toLowerCase();
    const ownerUserLC = String(OWNER_USERNAME || '').toLowerCase();
    const ownerPass = String(OWNER_PASSWORD || '');
    
    // Owner check first, case-insensitive
    if(ownerUserLC && ownerPass && wantLC === ownerUserLC && inPass === ownerPass) {
      req.session.user = { id: 'owner', username: OWNER_USERNAME, role: 'owner' };
      log('auth', { ok: true, who: 'owner', ip: req.ip });
      return res.json({ok:true,role:'owner',redirect:'/owner/users'});
    }
    
    // Regular user path (case-insensitive lookup; try lc first then raw as fallback)
    await initStore();
    let user = await getByUsername(wantLC);
    if (!user) user = await getByUsername(inUser);
    
    if(!user || !user.passHash) {
      log('auth', { ok: false, who: wantLC, ip: req.ip, reason: 'bad_creds' });
      return res.status(401).json({ok:false,error:'Invalid username or password.'});
    }
    
    const ok = bcrypt.compareSync(inPass, user.passHash);
    if(!ok) {
      log('auth', { ok: false, who: wantLC, ip: req.ip, reason: 'bad_creds' });
      return res.status(401).json({ok:false,error:'Invalid username or password.'});
    }
    
    req.session.user = { id: user.id, username: user.username, role: user.role || 'user' };
    log('auth', { ok: true, who: user.username, ip: req.ip });
    return res.json({ok:true,role:req.session.user.role,redirect:'/dashboard'});
  }catch(e){
    log('auth', { ok: false, ip: req.ip, reason: 'exception', msg: e?.message });
    res.status(500).json({ok:false,error:'Something went wrong'})
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
    const username = String(req.body.username||'').trim();
    const password = String(req.body.password||'').trim();
    
    if (!USER_RE.test(username)) {
      return res.status(400).json({ok:false,error:'Username must be 3-32 alphanumeric characters or underscore'});
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ok:false,error:'Password must be at least 8 characters'});
    }
    
    if(REQUIRE_HCAPTCHA_SIGNUP){
      const tok=req.body['h-captcha-response']; 
      if(!tok) return res.status(400).json({ok:false,error:'Please complete the captcha'});
      const ok=await verifyHCaptcha(tok); 
      if(!ok) return res.status(400).json({ok:false,error:'Captcha verification failed'});
    }
    
    await initStore();
    
    // Case-insensitive uniqueness check
    const wantLC = username.toLowerCase();
    const existing = await getByUsername(wantLC) || await getByUsername(username);
    if (existing) {
      log('auth', { ok: false, who: wantLC, ip: req.ip, reason: 'user_exists', action: 'signup' });
      return res.status(409).json({ok:false,error:'That username is already taken'});
    }
    
    const passHash=bcrypt.hashSync(password,10);
    const created=await createUser({username,passHash,role:'user'});
    req.session.user = { id: created.id, username: created.username, role: 'user' };
    log('auth', { ok: true, who: username, ip: req.ip, action: 'signup' });
    res.json({ok:true,redirect:'/dashboard'});
  }catch(e){ 
    if(e.code==='E_EXISTS') {
      log('auth', { ok: false, who: username, ip: req.ip, reason: 'user_exists', action: 'signup' });
      return res.status(409).json({ok:false,error:'That username is already taken'});
    }
    log('auth', { ok: false, ip: req.ip, reason: 'exception', msg: e?.message, action: 'signup' });
    res.status(500).json({ok:false,error:'Something went wrong'})
  }
});

router.post('/auth/logout',(req,res)=>{ if(req.session) req.session.destroy(()=>{}); res.redirect('/') });
module.exports = router;
