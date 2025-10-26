const express = require('express'); const bcrypt = require('bcryptjs');
const { listAll, setRole, renameUser, resetPassword, deleteUser } = require('../utils/usersStore');
const { tail } = require('../utils/logger');
const router = express.Router();
const OWNER_USERNAME = process.env.OWNER_USERNAME || 'LeadLeaderCeo';
const requireOwner=(req,res,next)=> req.session?.user?.role==='owner'? next(): res.status(302).redirect('/auth/login');

router.get('/users', requireOwner, async (req,res)=>{ const users=await listAll(); res.render('owner_users',{title:'Owner: Users',users,ownerName:OWNER_USERNAME})});
router.post('/users/role', requireOwner, async (req,res)=>{ try{ const {username,role}=req.body||{}; if(username===OWNER_USERNAME) return res.status(400).json({ok:false,error:'Cannot modify owner'}); if(!['user','mod'].includes(role)) return res.status(400).json({ok:false,error:'Bad role'}); const out=await setRole(username,role); res.json({ok:true,user:out}) }catch(e){res.status(500).json({ok:false,error:e.message||'Failed role update'})}});
router.post('/users/rename', requireOwner, async (req,res)=>{ try{ const {oldName,newName}=req.body||{}; if(oldName===OWNER_USERNAME||newName===OWNER_USERNAME) return res.status(400).json({ok:false,error:'Cannot rename owner'}); const out=await renameUser(oldName,newName); res.json({ok:true,user:out}) }catch(e){res.status(e.code==='E_EXISTS'?409:500).json({ok:false,error:e.message||'Failed rename'})}});
router.post('/users/reset', requireOwner, async (req,res)=>{ try{ const {username,newPassword}=req.body||{}; if(username===OWNER_USERNAME) return res.status(400).json({ok:false,error:'Cannot reset owner'}); if(!newPassword||newPassword.length<8) return res.status(400).json({ok:false,error:'Bad password'}); const passHash=bcrypt.hashSync(newPassword,10); const out=await resetPassword(username,passHash); res.json({ok:true,user:out}) }catch(e){res.status(500).json({ok:false,error:e.message||'Failed reset'})}});
router.post('/users/delete', requireOwner, async (req,res)=>{ try{ const {username}=req.body||{}; if(username===OWNER_USERNAME) return res.status(400).json({ok:false,error:'Cannot delete owner'}); const out=await deleteUser(username); res.json({ok:true,user:out}) }catch(e){res.status(e.code==='E_NOTFOUND'?404:500).json({ok:false,error:e.message||'Failed to delete user'})}});
router.get('/logs', requireOwner, async (req,res)=>{ try{ const lines=await tail(200); res.render('owner_logs',{title:'Owner: Logs',logs:lines}) }catch(e){res.status(500).render('owner_logs',{title:'Owner: Logs',logs:[],error:e.message})}});
module.exports = router;

// Self-test: send email via SendGrid when header x-cron-secret matches CRON_SECRET
const sgMail = require('@sendgrid/mail');
try { const cfg = require('../utils/config'); if (cfg.SENDGRID_API_KEY) sgMail.setApiKey(cfg.SENDGRID_API_KEY); } catch {}
const CRON_SECRET = process.env.CRON_SECRET || '';
router.post('/selftest/email', async (req,res)=>{
  try{
    if(!CRON_SECRET || req.headers['x-cron-secret'] !== CRON_SECRET) return res.status(401).json({ok:false,error:'unauthorized'});
    const cfg = require('../utils/config');
    const recips = (cfg.RECIPIENTS||[]).map(r=>String(r)).filter(Boolean);
    if(!recips.length) return res.status(400).json({ok:false,error:'no recipients'});
    const subject = 'LeadLeader self-test ✓';
    const text = 'This is a self-test email from /owner/selftest/email';
    const html = '<div style="font-family:system-ui"><h2>LeadLeader Self-Test</h2><p>This is a self-test email from <code>/owner/selftest/email</code>.</p></div>';
    await sgMail.send({to:recips, from: cfg.SENDGRID_FROM || 'no-reply@leadleader.ai', subject, text, html});
    res.json({ok:true, sentTo: recips.length});
  }catch(e){ res.status(500).json({ok:false,error:e.message||'send failed'}); }
});
