const fs = require('fs'); const fsp = fs.promises; const path = require('path');
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Log on module load
console.log(JSON.stringify({
  level: 'info',
  event: 'users_store_init',
  dataDir: DATA_DIR,
  usersFile: USERS_FILE,
  envDataDir: process.env.DATA_DIR || 'not set (using default)'
}));

function safeUsers(x){return x&&Array.isArray(x.users)?x:{users:[]}}
async function atomicWrite(f,c){const t=`${f}.tmp-${Date.now()}`;await fsp.writeFile(t,c,'utf8');await fsp.rename(t,f)}
async function initStore(){
  await fsp.mkdir(DATA_DIR,{recursive:true}); 
  try{
    await fsp.access(USERS_FILE);
    console.log(JSON.stringify({level:'info',event:'users_file_exists',path:USERS_FILE}));
  }catch{
    await atomicWrite(USERS_FILE,JSON.stringify({users:[]},null,2));
    console.log(JSON.stringify({level:'info',event:'users_file_created',path:USERS_FILE}));
  }
}
async function readAll(){await initStore(); return safeUsers(JSON.parse(await fsp.readFile(USERS_FILE,'utf8')))}
async function writeAll(d){await atomicWrite(USERS_FILE,JSON.stringify(d,null,2))}
function nowIso(){return new Date().toISOString()}
async function getByUsername(u){const db=await readAll();return db.users.find(x=>x.username.toLowerCase()===String(u||'').toLowerCase())||null}
async function listAll(){const db=await readAll(); return db.users.map(({passHash,...rest})=>rest)}
async function createUser({username,passHash,role='user'}){const db=await readAll(); if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase())){const e=new Error('User exists');e.code='E_EXISTS';throw e} const id=`u_${Math.random().toString(36).slice(2)}`; const user={id,username,passHash,role,createdAt:nowIso()}; db.users.push(user); await writeAll(db); return {id,username,role,createdAt:user.createdAt}}
async function setRole(username,role){const db=await readAll(); const u=db.users.find(x=>x.username.toLowerCase()===username.toLowerCase()); if(!u){const e=new Error('Not found');e.code='E_NOTFOUND';throw e} u.role=role; await writeAll(db); return {id:u.id,username:u.username,role:u.role,createdAt:u.createdAt}}
async function renameUser(oldName,newName){const db=await readAll(); const u=db.users.find(x=>x.username.toLowerCase()===oldName.toLowerCase()); if(!u){const e=new Error('Not found');e.code='E_NOTFOUND';throw e} if(db.users.some(x=>x.username.toLowerCase()===newName.toLowerCase())){const e=new Error('User exists');e.code='E_EXISTS';throw e} u.username=newName; await writeAll(db); return {id:u.id,username:u.username,role:u.role,createdAt:u.createdAt}}
async function resetPassword(username,passHash){const db=await readAll(); const u=db.users.find(x=>x.username.toLowerCase()===username.toLowerCase()); if(!u){const e=new Error('Not found');e.code='E_NOTFOUND';throw e} u.passHash=passHash; await writeAll(db); return {id:u.id,username:u.username,role:u.role,createdAt:u.createdAt}}
async function deleteUser(username){const db=await readAll(); const idx=db.users.findIndex(x=>x.username.toLowerCase()===username.toLowerCase()); if(idx===-1){const e=new Error('Not found');e.code='E_NOTFOUND';throw e} const deleted=db.users.splice(idx,1)[0]; await writeAll(db); return {id:deleted.id,username:deleted.username}}
module.exports={initStore,getByUsername,listAll,createUser,setRole,renameUser,resetPassword,deleteUser,USERS_FILE:USERS_FILE,DATA_DIR:DATA_DIR}
