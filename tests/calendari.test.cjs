const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../app.html'),'utf8');
function fn(name){let s=html.indexOf('function '+name+'(');assert(s>=0);if(html.slice(s-6,s)==='async ')s-=6;return html.slice(s,html.indexOf('\n}',s)+2);}
function context(){
 const data=new Map(),box={innerHTML:''},messages=[];
 const c={console:{log(){},warn(){},error(){}},Uint8Array,Date,COMPETIZIONI_STORAGE_KEY:'comp',ORACLE_STATE_KEY:'oracle',LISTINO_STORAGE_KEY:'listino',activeLeagueId:'lega',leagues:[{id:'lega',name:'Lega'}],currentUser:{},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},showToast:m=>messages.push(m),scheduleCloudSync(){},renderCompSwitcher(){},confirm:()=>false,prompt:()=>null,saveLeaguesRegistry(){},saveActiveLeague(){},slugifyLeague:()=> 'lega',escapeHtml:s=>s,escapeAttr:s=>s,nomeLegaVisibile:l=>l.name,document:{getElementById:()=>box},XLSX:{read:bytes=>({SheetNames:['Foglio'],Sheets:{Foglio:bytes[0]}}),utils:{sheet_to_json:n=>n===99?[]:[['Calendario Gara '+n],['1ª Giornata lega','','','1ª Giornata serie a'],['Squadra A','0','0','Squadra B']]}}};
 c.nsKey=k=>k+'__'+c.activeLeagueId;
 vm.createContext(c);
 for(const n of ['loadCompetizioni','saveCompetizioni','leggiCalendarioLega','nomeCompetizioneDaFoglio','handleCompetizioneUpload','readLocalLeaguesSnapshot','pullFromCloud','renderCalendariCaricati'])vm.runInContext(fn(n),c);
 return {c,box,messages};
}
const file=(n,hook)=>({name:n+'.xlsx',async arrayBuffer(){if(hook)hook();return Uint8Array.of(n).buffer;}});
const upload=(c,files)=>c.handleCompetizioneUpload({target:{files,value:'selected'}});
test('Tre file nella stessa lega sono conservati e visibili, anche dopo il recupero cloud',async()=>{
 const {c,box}=context();await upload(c,[file(1),file(2),file(3)]);
 assert.equal(c.loadCompetizioni().length,3);c.renderCalendariCaricati();for(let n=1;n<=3;n++)assert(box.innerHTML.includes('Gara '+n));
 const snapshot=c.readLocalLeaguesSnapshot()[0];assert.equal(snapshot.competizioni.length,3);
 const other=context().c;other.leagues=[];await other.pullFromCloud([{id:'cloud-id',league_name:'Lega',competizioni:snapshot.competizioni}]);
 assert.equal(JSON.stringify(other.loadCompetizioni()),JSON.stringify(c.loadCompetizioni()));
 assert.match(html, /id="competizioneUploadInput"[^>]*\bmultiple\b/);
});
test('Nome duplicato: aggiunta distinta, annullamento e aggiornamento esplicito',async()=>{
 const {c}=context();await upload(c,[file(1)]);c.prompt=()=> 'Coppa';await upload(c,[file(1)]);assert.equal(c.loadCompetizioni().length,2);
 c.prompt=()=>null;await upload(c,[file(1)]);assert.equal(c.loadCompetizioni().length,2);
 c.confirm=()=>true;await upload(c,[file(1)]);assert.equal(c.loadCompetizioni().length,2);
});
test('Un file non valido non impedisce di caricare gli altri',async()=>{
 const {c,messages}=context();await upload(c,[file(1),file(99),file(3)]);assert.equal(c.loadCompetizioni().length,2);assert.match(messages.at(-1),/99.xlsx: nessuna partita/);
});
test('Cambiare lega durante la lettura non sposta i calendari',async()=>{
 const {c}=context();c.leagues.push({id:'altra',name:'Altra'});await upload(c,[file(1,()=>c.activeLeagueId='altra'),file(2),file(3)]);assert.equal(c.loadCompetizioni('lega').length,3);assert.equal(c.loadCompetizioni('altra').length,0);
});
test('Calendari omonimi restano separati per lega, anche aggiornando e recuperando dal cloud',async()=>{
 const {c}=context();c.leagues.push({id:'altra',name:'Altra'});
 await upload(c,[file(1)]);
 const original=JSON.stringify(c.loadCompetizioni('lega'));
 c.activeLeagueId='altra';
 c.confirm=()=>{throw new Error('Non deve chiedere di sostituire il calendario di un’altra lega');};
 await upload(c,[file(1)]);
 assert.equal(c.loadCompetizioni('altra').length,1);
 // Stesso titolo, ma partite diverse nella seconda lega.
 c.XLSX.utils.sheet_to_json=()=>[['Calendario Gara 1'],['2ª Giornata lega','','','8ª Giornata serie a'],['Squadra C','0','0','Squadra D']];
 c.confirm=()=>true;await upload(c,[file(1)]);
 assert.equal(JSON.stringify(c.loadCompetizioni('lega')),original);
 assert.equal(c.loadCompetizioni('altra')[0].partite[0].casa,'Squadra C');
 const snapshots=c.readLocalLeaguesSnapshot();
 const other=context().c;other.leagues=[];other.slugifyLeague=s=>s.toLowerCase();
 await other.pullFromCloud(snapshots.map((l,i)=>({id:'cloud-'+i,league_name:l.name,competizioni:l.competizioni})));
 assert.equal(JSON.stringify(other.loadCompetizioni('lega')),original);
 assert.equal(other.loadCompetizioni('altra')[0].nome,'Gara 1');
 assert.equal(other.loadCompetizioni('altra')[0].partite[0].casa,'Squadra C');
});
