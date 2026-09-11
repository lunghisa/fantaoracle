import nodemailer from 'nodemailer';
import {randomUUID} from 'node:crypto';
const BUCKET='fantaoracle-mail-jobs';
const validEmail=s=>typeof s==='string'&&s.length<=254&&/^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(s);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const reply=(code,error)=>res.status(code).json({error});
 if(req.method!=='POST')return reply(405,'Metodo non consentito');
 if(req.headers.origin&&req.headers.origin!=='https://fantaoracle.ch')return reply(403,'Origine non consentita');
 const env=process.env,url=env.SUPABASE_URL,anon=env.SUPABASE_ANON_KEY,key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!key)return reply(503,'Servizio non configurato');
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
 if(!token)return reply(401,'Accedi come admin');
 let transport;
 const remote=(path,opts={},admin=true)=>fetch(url+path,{...opts,signal:AbortSignal.timeout(10000),headers:{apikey:admin?key:anon,Authorization:'Bearer '+(admin?key:token),...opts.headers}});
 const read=async path=>{const r=await remote('/storage/v1/object/'+BUCKET+'/'+path);if(!r.ok)throw Error('storage');return r.json();};
 const write=async(path,data,upsert=false)=>remote('/storage/v1/object/'+BUCKET+'/'+path,{method:'POST',headers:{'Content-Type':'application/json','x-upsert':String(upsert)},body:JSON.stringify(data)});
 try{
  const a=await remote('/auth/v1/user',{},false);if(!a.ok)return reply(401,'Sessione scaduta');const user=await a.json();
  if(!user.id)return reply(401,'Sessione non valida');
  const p=await remote('/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=is_admin',{},false);if(!p.ok)throw Error('profile');
  if((await p.json())[0]?.is_admin!==true)return reply(403,'Funzione riservata agli admin');
  const action=req.body?.action;
  const configured=Boolean(env.SMTP_PASSWORD&&validEmail(env.SMTP_USER)&&validEmail(env.SMTP_FROM)&&env.SMTP_HOST==='mail.infomaniak.com'&&['587','465'].includes(env.SMTP_PORT));
  if(action==='status')return res.status(200).json({configured,from:validEmail(env.SMTP_FROM)?env.SMTP_FROM:null});
  if(!configured)return reply(503,'Completa le cinque variabili SMTP in produzione e ripubblica il sito');
  const smtp=()=>transport||(transport=nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT),secure:env.SMTP_PORT==='465',requireTLS:true,auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:15000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true}));
  if(action==='verify'){await smtp().verify();return res.status(200).json({ok:true,message:'Connessione e credenziali verificate. La consegna richiede una prova email.'});}
  async function recipients(){
   const emails=new Set();
   for(let page=1;page<=20;page++){
    const r=await remote('/auth/v1/admin/users?page='+page+'&per_page=100');if(!r.ok)throw Error('users');const {users}=await r.json();if(!Array.isArray(users))throw Error('users');
    for(const u of users)if(validEmail(u.email)&&u.email_confirmed_at&&!u.deleted_at&&(!u.banned_until||Date.parse(u.banned_until)<=Date.now()))emails.add(u.email.toLowerCase());
    if(users.length<100)return [...emails].sort();
   }
   throw Error('too many users');
  }
  async function ensureBucket(){const r=await remote('/storage/v1/bucket/'+BUCKET);if(r.ok)return;if(![400,404].includes(r.status))throw Error('bucket');const c=await remote('/storage/v1/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:BUCKET,name:BUCKET,public:false,file_size_limit:65536,allowed_mime_types:['application/json']})});if(!c.ok&&c.status!==409)throw Error('bucket');}
  if(action==='preview'){
   const subject=String(req.body.subject||'').trim(),text=String(req.body.text||'').trim();
   if(!subject||subject.length>120||/[\r\n]/.test(subject)||!text||text.length>5000)return reply(400,'Inserisci oggetto (massimo 120 caratteri) e messaggio (massimo 5000)');
   const list=await recipients();if(!list.length)return reply(400,'Nessun utente con email confermata');if(list.length>200)return reply(400,'Oltre 200 destinatari serve ampliare il sistema di invio. Nessun messaggio inviato.');
   await ensureBucket();const id=randomUUID(),draft={id,owner:user.id,subject,text,recipients:list,expires:Date.now()+3600000};
   if(!(await write(id+'.json',draft)).ok)throw Error('draft');
   return res.status(200).json({id,subject,text,count:list.length,from:env.SMTP_FROM,expires:draft.expires});
  }
  if(!['test','send'].includes(action))return reply(400,'Operazione non valida');
  const id=req.body.id;if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return reply(400,'Anteprima non valida');
  const draft=await read(id+'.json');if(draft.owner!==user.id)return reply(403,'Anteprima di un altro admin');if(draft.expires<Date.now())return reply(400,'Anteprima scaduta: preparane una nuova');
  if(action==='send'){
   if(req.body.confirm!==true)return reply(400,'Conferma l’invio a tutti');
   const test=await read(id+'-test-result.json');if(test.accepted!==1)return reply(400,'Prima invia la prova al tuo account');
   const live=await recipients();if(JSON.stringify(live)!==JSON.stringify(draft.recipients))return reply(409,'Elenco utenti cambiato: prepara una nuova anteprima');
  }
  if(action==='test'&&!validEmail(user.email))return reply(400,'Il tuo account non ha una email valida');
  // Atomic claim: no retry after an ambiguous SMTP result, even across instances.
  const lock=await write(id+'-'+action+'-lock.json',{at:Date.now(),owner:user.id});
  if(!lock.ok){if([400,409].includes(lock.status))return reply(409,'Operazione già avviata. Non ripetere l’invio: controlla la posta prima di creare un’altra anteprima.');throw Error('lock');}
  let info;
  try{
   info=await smtp().sendMail({from:{name:'FantaOracle',address:env.SMTP_FROM},replyTo:env.SMTP_FROM,to:action==='test'?user.email:env.SMTP_FROM,...(action==='send'?{bcc:draft.recipients}:{}),subject:(action==='test'?'[PROVA] ':'')+draft.subject,text:draft.text+'\n\n—\nFantaOracle · Comunicazione di servizio\nhttps://fantaoracle.ch',messageId:'<'+id+'-'+action+'@fantaoracle.ch>'});
  }catch(e){return reply(502,'Invio non confermato. Non ripetere subito: verifica la casella e i log Infomaniak. Il tentativo è bloccato per evitare duplicati.');}
  const result={accepted:info.accepted?.length||0,rejected:info.rejected?.length||0,at:Date.now()};
  if(!(await write(id+'-'+action+'-result.json',result)).ok)return reply(503,'Email affidata al server ma registrazione dell’esito fallita. Non ripetere l’invio.');
  return res.status(200).json({ok:true,...result,message:'Email affidata a Infomaniak. Questo non conferma ancora la consegna nella posta in arrivo.'});
 }catch(e){return reply(503,'Verifica email non riuscita: controlla configurazione e disponibilità dei servizi. Nessuna conferma di invio.');}
 finally{transport?.close();}
}
