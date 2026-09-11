// Avviso di servizio condiviso. Storage privato; scrittura riservata agli admin.
const BUCKET = 'fantaoracle-service-notices';
const FILE = 'current.json';
const TYPES = ['info','incident','maintenance','resolved'];
function cleanNotice(value) {
  if (!value || typeof value !== 'object') return null;
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const message = typeof value.message === 'string' ? value.message.trim() : '';
  const expiresAt = typeof value.expiresAt === 'string' ? value.expiresAt : '';
  if (!title || title.length > 120 || !message || message.length > 2000 || !TYPES.includes(value.type) || !Number.isFinite(Date.parse(expiresAt))) return null;
  return {title,message,type:value.type,expiresAt};
}
export default async function handler(req,res) {
  const url=process.env.SUPABASE_URL, anon=process.env.SUPABASE_ANON_KEY, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)){res.status(405).json({error:'Metodo non consentito'});return;}
  if(!url||!anon||!service){res.status(503).json({error:'Servizio avvisi non configurato'});return;}
  const storage=(path,options={})=>fetch(url+'/storage/v1/'+path,{...options,signal:AbortSignal.timeout(10000),headers:{apikey:service,Authorization:'Bearer '+service,...options.headers}});
  try {
    if(req.method==='GET') {
      const response=await storage('object/'+BUCKET+'/'+FILE);
      // A missing file/bucket is a normal initial state; never swallow other failures.
      if(response.status===400||response.status===404) {
        const error=await response.json().catch(()=>({}));
        if(response.status===404 || ['not_found','NoSuchBucket','NoSuchKey'].includes(error.code) || ['Object not found','Bucket not found'].includes(error.message)) {
          res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=30');res.status(200).json({notice:null});return;
        }
      }
      if(!response.ok) throw Error('storage read');
      const raw=await response.json();
      const notice=cleanNotice(raw);
      res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=30');
      res.status(200).json({notice:notice&&Date.parse(notice.expiresAt)>Date.now()?{...notice,id:raw.id}:null});return;
    }
    if(req.headers.origin && req.headers.origin!=='https://fantaoracle.ch'){res.status(403).json({error:'Origine non consentita'});return;}
    const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
    if(!token){res.status(401).json({error:'Accedi come admin'});return;}
    const authHeaders={apikey:anon,Authorization:'Bearer '+token};
    const auth=await fetch(url+'/auth/v1/user',{headers:authHeaders,signal:AbortSignal.timeout(10000)});
    if(!auth.ok){res.status(401).json({error:'Sessione scaduta'});return;}
    const user=await auth.json();
    if(!user.id){res.status(401).json({error:'Sessione non valida'});return;}
    const profile=await fetch(url+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=is_admin',{headers:authHeaders,signal:AbortSignal.timeout(10000)});
    if(!profile.ok) throw Error('profile read');
    const records=await profile.json();
    if(records[0]?.is_admin!==true){res.status(403).json({error:'Solo gli amministratori possono pubblicare avvisi'});return;}
    const withdraw=req.body?.action==='withdraw';
    const notice=withdraw?null:cleanNotice(req.body);
    if(!withdraw&&(!notice||Date.parse(notice.expiresAt)<=Date.now()||Date.parse(notice.expiresAt)>Date.now()+90*86400000)){res.status(400).json({error:'Inserisci titolo, messaggio e una scadenza entro 90 giorni'});return;}
    let bucket=await storage('bucket/'+BUCKET);
    if(!bucket.ok) {
      if(![400,404].includes(bucket.status))throw Error('bucket read');
      bucket=await storage('bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:BUCKET,name:BUCKET,public:false,file_size_limit:16384,allowed_mime_types:['application/json']})});
      if(!bucket.ok&&bucket.status!==409)throw Error('bucket create');
    }
    const payload=withdraw?{withdrawn:true}: {...notice,id:crypto.randomUUID()};
    const result=await storage('object/'+BUCKET+'/'+FILE,{method:'POST',headers:{'Content-Type':'application/json','x-upsert':'true'},body:JSON.stringify(payload)});
    if(!result.ok)throw Error('notice write');
    res.status(200).json({ok:true,notice:withdraw?null:payload});
  } catch(e) {console.warn('[notices] operation failed');res.status(503).json({error:'Avvisi momentaneamente non disponibili. Nessuna conferma di pubblicazione: verifica prima di riprovare.'});}
}
