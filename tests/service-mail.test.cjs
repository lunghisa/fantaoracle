const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const id='12345678-1234-1234-1234-123456789012';
const draft={id,owner:'admin',subject:'Servizio',text:'Prova',expires:Date.now()+600000,recipients:['one@example.com']};
function setup(responses,options={}){
 const calls=[],sent=[],config=[];let code,body,verified=0;
 const env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'secret',SMTP_HOST:'mail.infomaniak.com',SMTP_PORT:'587',SMTP_USER:'support@fantaoracle.ch',SMTP_PASSWORD:'password',SMTP_FROM:'info@fantaoracle.ch',...options.env};
 const context={process:{env},AbortSignal,randomUUID:()=>id,nodemailer:{createTransport(c){config.push(c);return {async verify(){verified++;},async sendMail(m){sent.push(m);if(options.smtpFail)throw Error('ambiguous');return {accepted:['one@example.com'],rejected:[]};},close(){}};}},fetch:async(url,opts)=>{calls.push({url,opts});const r=responses.shift();assert(r,'Unexpected request '+url);return {status:r[0],ok:r[0]>=200&&r[0]<300,json:async()=>r[1]};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('api/service-mail.js','utf8').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler'),context);
 return {async run(payload,headers={authorization:'Bearer token'},method='POST'){await context.handler({method,headers,body:payload},{setHeader(){},status(n){code=n;return this;},json(b){body=b;}});return {code,body,calls,sent,config,verified};}};
}
const auth=()=>[[200,{id:'admin',email:'admin@example.com'}],[200,[{is_admin:true}]]];
test('Mail: anonymous, bad origin and non-admin cannot use SMTP',async()=>{
 assert.equal((await setup([]).run({action:'verify'},{})).code,401);
 assert.equal((await setup([]).run({action:'verify'},{origin:'https://evil.test'})).code,403);
 const r=await setup([[200,{id:'user'}],[200,[{is_admin:false}]]]).run({action:'verify'});assert.equal(r.code,403);assert.equal(r.config.length,0);
});
test('Mail: verification requires TLS, does not send, secrets absent from response',async()=>{const r=await setup(auth()).run({action:'verify'});assert.equal(r.code,200);assert.equal(r.verified,1);assert.equal(r.sent.length,0);assert.equal(r.config[0].requireTLS,true);assert.equal(r.config[0].secure,false);assert(!JSON.stringify(r.body).includes('password'));});
test('Mail: missing config fails closed and subject header injection rejected',async()=>{assert.equal((await setup(auth(),{env:{SMTP_PASSWORD:''}}).run({action:'verify'})).code,503);assert.equal((await setup(auth()).run({action:'preview',subject:'x\r\nBcc: x',text:'test'})).code,400);});
test('Mail: preview uses confirmed active recipients, deduplicates and stores privately',async()=>{
 const r=await setup([...auth(),[200,{users:[{email:'ONE@example.com',email_confirmed_at:'2026-01-01'},{email:'one@example.com',email_confirmed_at:'2026-01-01'},{email:'no@example.com'},{email:'banned@example.com',email_confirmed_at:'2026-01-01',banned_until:'2099-01-01'}]}],[404,{}],[200,{}],[200,{}]]).run({action:'preview',subject:'Servizio',text:'Testo'});
 assert.equal(r.code,200);assert.equal(r.body.count,1);assert.equal(r.sent.length,0);assert.equal(JSON.parse(r.calls[4].opts.body).public,false);assert(!JSON.stringify(r.body).includes('one@example.com'));
});
test('Mail: test cannot be redirected to client supplied recipient',async()=>{const r=await setup([...auth(),[200,draft],[200,{}],[200,{}]]).run({action:'test',id,to:'attacker@example.com'});assert.equal(r.code,200);assert.equal(r.sent[0].to,'admin@example.com');assert.equal(r.sent[0].bcc,undefined);});
test('Mail: collective requires confirmation, successful test, unchanged audience; hides recipients',async()=>{
 let r=await setup([...auth(),[200,draft]]).run({action:'send',id});assert.equal(r.code,400);
 r=await setup([...auth(),[200,draft],[200,{accepted:0}]]).run({action:'send',id,confirm:true});assert.equal(r.code,400);
 r=await setup([...auth(),[200,draft],[200,{accepted:1}],[200,{users:[]}]]).run({action:'send',id,confirm:true});assert.equal(r.code,409);assert.equal(r.sent.length,0);
 r=await setup([...auth(),[200,draft],[200,{accepted:1}],[200,{users:[{email:'one@example.com',email_confirmed_at:'2026-01-01'}]}],[200,{}],[200,{}]]).run({action:'send',id,confirm:true});assert.equal(r.code,200);assert.equal(r.sent[0].to,'info@fantaoracle.ch');assert.equal(r.sent[0].bcc[0],'one@example.com');
});
test('Mail: atomic lock stops repeats and ambiguous SMTP has no automatic retry',async()=>{
 let r=await setup([...auth(),[200,draft],[409,{}]]).run({action:'test',id});assert.equal(r.code,409);assert.equal(r.sent.length,0);
 r=await setup([...auth(),[200,draft],[200,{}]],{smtpFail:true}).run({action:'test',id});assert.equal(r.code,502);assert.equal(r.sent.length,1);
 r=await setup([...auth(),[200,{...draft,owner:'other'}]]).run({action:'test',id});assert.equal(r.code,403);assert.equal(r.sent.length,0);
});
