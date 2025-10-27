const express = require('express'); const bcrypt = require('bcryptjs'); const fs = require('fs'); const path = require('path');
const { listAll, setRole, renameUser, resetPassword, deleteUser, setPlan, getPlan } = require('../utils/usersStore');
const { sendMessage } = require('../utils/store/messagesStore');
const { tail } = require('../utils/logger');
const { limiterByKey } = require('../utils/limiters');
const router = express.Router();
const OWNER_USERNAME = process.env.OWNER_USERNAME || 'LeadLeaderCeo';
const requireOwner=(req,res,next)=> req.session?.user?.role==='owner'? next(): res.status(302).redirect('/auth/login');

router.get('/users', requireOwner, async (req,res)=>{ const users=await listAll(); res.render('owner_users',{title:'Owner: Users',users,ownerName:OWNER_USERNAME})});
router.post('/users/role', requireOwner, async (req,res)=>{ try{ const {username,role}=req.body||{}; if(username===OWNER_USERNAME) return res.status(400).json({ok:false,error:'Cannot modify owner'}); if(!['user','mod'].includes(role)) return res.status(400).json({ok:false,error:'Bad role'}); const out=await setRole(username,role); res.json({ok:true,user:out}) }catch(e){res.status(500).json({ok:false,error:e.message||'Failed role update'})}});
router.post('/users/rename', requireOwner, async (req,res)=>{ try{ const {oldName,newName}=req.body||{}; if(oldName===OWNER_USERNAME||newName===OWNER_USERNAME) return res.status(400).json({ok:false,error:'Cannot rename owner'}); const out=await renameUser(oldName,newName); res.json({ok:true,user:out}) }catch(e){res.status(e.code==='E_EXISTS'?409:500).json({ok:false,error:e.message||'Failed rename'})}});
router.post('/users/reset', requireOwner, async (req,res)=>{ try{ const {username,newPassword}=req.body||{}; if(username===OWNER_USERNAME) return res.status(400).json({ok:false,error:'Cannot reset owner'}); if(!newPassword||newPassword.length<8) return res.status(400).json({ok:false,error:'Bad password'}); const passHash=bcrypt.hashSync(newPassword,10); const out=await resetPassword(username,passHash); res.json({ok:true,user:out}) }catch(e){res.status(500).json({ok:false,error:e.message||'Failed reset'})}});
router.post('/users/delete', requireOwner, async (req,res)=>{ try{ const {username}=req.body||{}; if(username===OWNER_USERNAME) return res.status(400).json({ok:false,error:'Cannot delete owner'}); const out=await deleteUser(username); res.json({ok:true,user:out}) }catch(e){res.status(e.code==='E_NOTFOUND'?404:500).json({ok:false,error:e.message||'Failed to delete user'})}});
router.post('/users/plan', requireOwner, async (req,res)=>{ try{ const {username,plan}=req.body||{}; if(username===OWNER_USERNAME) return res.status(400).json({ok:false,error:'Cannot modify owner'}); if(!['free','pro','biz'].includes(plan)) return res.status(400).json({ok:false,error:'Bad plan'}); const out=await setPlan(username,plan); res.json({ok:true,user:out}) }catch(e){res.status(500).json({ok:false,error:e.message||'Failed plan update'})}});
router.post('/dm', requireOwner, limiterByKey('owner-dm:ip'), async (req,res)=>{ try{ const {toUserId,body}=req.body||{}; if(!toUserId||!body) return res.status(400).json({ok:false,error:'Missing toUserId or body'}); const msg=await sendMessage({fromUserId:null,toUserId,body,createdAt:new Date().toISOString()}); res.json({ok:true,message:msg}) }catch(e){res.status(500).json({ok:false,error:e.message||'Failed to send DM'})}});
router.get('/logs', requireOwner, limiterByKey('owner-logs:ip'), async (req,res)=>{ 
  try{ 
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    
    // Read log file
    const logPath = fs.existsSync('/app/data/logs/app.ndjson') ? '/app/data/logs/app.ndjson' : '/tmp/app.log';
    let items = [];
    
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      // Redact secrets from log entries
      const redactSecrets = (str) => {
        return str
          .replace(/SG\.[A-Za-z0-9_-]+/g, '[REDACTED_SG]')
          .replace(/AKIA[A-Z0-9]{16}/g, '[REDACTED_AWS]')
          .replace(/sk-[A-Za-z0-9]{48}/g, '[REDACTED_SK]')
          .replace(/"password":"[^"]+"/g, '"password":"[REDACTED]"')
          .replace(/"passHash":"[^"]+"/g, '"passHash":"[REDACTED]"');
      };
      
      items = lines.slice(offset, offset + limit).map(line => {
        try {
          return JSON.parse(redactSecrets(line));
        } catch {
          return { raw: line };
        }
      });
    }
    
    const nextOffset = items.length === limit ? offset + limit : null;
    
    // Return JSON or HTML
    if (req.accepts('json') && !req.accepts('html')) {
      res.json({ ok: true, items, nextOffset });
    } else {
      res.render('owner_logs', { title: 'Owner: Logs', logs: items.map(i => JSON.stringify(i)) });
    }
  } catch(e) {
    if (req.accepts('json') && !req.accepts('html')) {
      res.status(500).json({ ok: false, error: e.message });
    } else {
      res.status(500).render('owner_logs', { title: 'Owner: Logs', logs: [], error: e.message });
    }
  }
});
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
