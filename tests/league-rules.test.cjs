const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../assets/league-rules.js'),rules=R.premier;
const html=fs.readFileSync(require('node:path').join(__dirname,'../app.html'),'utf8');
function fn(n){const a=html.indexOf('function '+n+'(');assert(a>=0);return html.slice(a,html.indexOf('\n}',a)+2);}
const events=()=>({vote:6,goals:0,penaltyGoals:0,assists:0,softAssists:0,goldAssists:0,goalsConceded:0,penaltiesSaved:0,penaltiesMissed:0,ownGoals:0,yellow:0,red:0,cleanSheet:false});
const formations=Object.fromEntries(rules.modules.map(m=>{const[d,c,a]=m.split('-').map(Number);return[m,{requirements:{P:1,D:d,C:c,A:a}}];}));
test('Profilo solo per il nome completo verificato, mai per altre Premier',()=>{
 assert.equal(R.resolve(' Premier Ticino League '),rules);assert.equal(R.resolve('Premier League'),null);assert.equal(R.resolve('Fagioli per Tutti'),R.fagioli);
 assert.equal(R.resolve('Lega rinominata',rules.id),rules);
});
test('Gol differenziati, rigore non contato due volte, assist e porta inviolata',()=>{
 for(const [role,bonus]of Object.entries(rules.goals))assert.equal(R.score({...events(),goals:1},role,rules),6+bonus);
 assert.equal(R.score({...events(),goals:1,penaltyGoals:1},'D',rules),9);
 assert.equal(R.score({...events(),assists:1,softAssists:1,goldAssists:1,yellow:1},'C',rules),8.5);
 assert.equal(R.score({...events(),cleanSheet:true},'P',rules),7);
 assert.equal(R.score({...events(),cleanSheet:true},'D',rules),6);
 assert.equal(R.score({...events(),penaltiesSaved:1,penaltiesMissed:1,ownGoals:1,red:1,goalsConceded:1},'P',rules),2);
});
test('Eventi mancanti, ambigui o invalidi non diventano zeri inventati',()=>{
 assert.equal(R.score({v:8},'D',rules),null);assert.equal(R.score({...events(),penaltyGoals:null},'D',rules),null);
 assert.equal(R.score({...events(),penaltyGoals:2},'D',rules),null);
 const e=R.readEvents([6,1,0],['Voto','Gf','Ass']);assert.equal(e.goals,1);assert.equal(e.penaltyGoals,null);assert.equal(e.assists,0);
 assert.equal(R.score(e,'D',rules),null);
});
test('Modificatore: confini esatti, quattro difensori validi e portiere',()=>{
 const team=[{role:'P'},...Array.from({length:4},()=>({role:'D'}))];
 for(const [mv,bonus]of [[5.99,0],[6,1],[6.249,1],[6.25,2],[6.5,3],[6.75,4],[7,6],[7.25,6]])assert.equal(R.defense(team,rules,()=>mv).bonus,bonus);
 assert.equal(R.defense(team.slice(0,4),rules,()=>7).bonus,0);
 assert.equal(R.defense(team,rules,p=>p===team[4]?null:7).available,false);
 assert.equal(R.defense(team,rules,p=>p.role==='P'?null:7).available,false);
});
test('Oracle sceglie giocatori diversi quando migliora il modificatore',()=>{
 const roster=[{name:'P',role:'P',score:6,mv:7}];
 for(let i=0;i<4;i++)roster.push({name:'D'+i,role:'D',score:i===3?6.2:6,mv:i===3?5:7});
 roster.push({name:'Bonus',role:'D',score:6.1,mv:5});
 for(let i=0;i<5;i++)roster.push({name:'C'+i,role:'C',score:6,mv:6});
 for(let i=0;i<3;i++)roster.push({name:'A'+i,role:'A',score:6,mv:6});
 const best=R.best(roster,{'4-3-3':formations['4-3-3']},{...rules,modules:['4-3-3']},p=>p.score,p=>p.mv);
 assert.equal(best.modifier.bonus,6);assert(!best.picks.some(p=>p.name==='Bonus'));assert(Math.abs(best.total-67.1)<1e-9);
 const normal=R.best(roster,{'4-3-3':formations['4-3-3']},null,p=>p.score,p=>p.mv);assert(normal.picks.some(p=>p.name==='Bonus'));
});
test('Soglie e limite pareggio escludono la fascia sotto 66',()=>{
 assert.deepEqual(R.matchScore(65,60,rules),{home:0,away:0});assert.deepEqual(R.matchScore(70,66,rules),{home:2,away:1});
 assert.deepEqual(R.matchScore(66,70,rules),{home:1,away:2});assert.deepEqual(R.matchScore(72,71,rules),{home:2,away:1});assert.deepEqual(R.matchScore(114,108,rules),{home:9,away:8});
});
test('App: il profilo segue lo stato della lega, e usa solo eventi completi della squadra corretta',()=>{
 const c={FantaLeagueRules:R,leagues:[{id:'p',name:rules.name},{id:'x',name:'Altra'},{id:'f',name:R.fagioli.name}],activeLeagueId:'p',oracleState:{},rosterNormalizeName:s=>s.toLowerCase(),normTeamName:s=>s.toLowerCase(),votiGlobaliInMemoria:[{giornata:1,votes:{rossi:{team:'Roma',events:{...events(),goals:1}}}}]};
 vm.createContext(c);for(const n of ['activeLeagueRules','leaguePlayerSamples','leagueExpectedVote'])vm.runInContext(fn(n),c);
 assert.equal(c.leaguePlayerSamples({name:'Rossi',role:'D',team:'Roma'})[0].score,10);
 assert.equal(c.leaguePlayerSamples({name:'Rossi',role:'D',team:'Inter'}).length,0);
 c.activeLeagueId='x';assert.equal(c.activeLeagueRules(),null);assert.equal(c.leaguePlayerSamples({name:'Rossi',role:'D',team:'Roma'}).length,0);
});
test('App: applicare Oracle mantiene i giocatori effettivamente ottimizzati sul campo e nelle liste',()=>{
 const picks=Array.from({length:11},(_,i)=>({name:'Chosen'+i,role:i===0?'P':i<5?'D':i<8?'C':'A'}));
 const bench={name:'Bench',role:'D'};
 const c={oracleState:{manualModulo:'3-4-3'},oracleSaveState(){},currentMode:'oracle',runOracleEngine(){},oracleBestFormation:()=>({modulo:'4-3-3',total:72,picks}),players:{starters:picks,bench:[bench]},setModulo(){},saveRosterToStorage(){},showPage(){},showToast(){},document:{getElementById:()=>null,querySelectorAll:()=>[]},setTimeout(){}};
 vm.createContext(c);vm.runInContext(fn('installOracleFormation'),c);vm.runInContext(fn('applyOracleFormation'),c);c.applyOracleFormation();assert.equal(c.oracleState.manualModulo,null);
 assert.deepEqual(c.players.starters,picks);assert.equal(c.players.bench[0],bench);assert.equal(c.players._lineupByRole.D.length,4);
});
test('App: forma uguale per Premier, Fagioli e lega standard; nessuna calibrazione in fantapunti',()=>{
 const c={FantaLeagueRules:R,leagues:[{id:'p',name:rules.name},{id:'x',name:'Altra'},{id:'f',name:R.fagioli.name}],activeLeagueId:'p',oracleState:{history:[],calib:{biasByRole:{D:0},samples:0}},rosterNormalizeName:s=>s.toLowerCase(),normTeamName:s=>s.toLowerCase(),votiGlobaliInMemoria:Array.from({length:10},(_,i)=>({giornata:i+1,votes:{rossi:{team:'Roma',events:{...events(),goals:1}}}})),quotationToFm:()=>6,oracleMatchContext:()=>null,infermeriaDi:()=>null,consigliGiornataCorrente:()=>null};
 vm.createContext(c);for(const n of ['activeLeagueRules','leaguePlayerSamples','oracleRecentVotes','oracleFormSamples','oraclePredictPlayer'])vm.runInContext(fn(n),c);
 const p={name:'Rossi',team:'Roma',role:'D',fmReal:6,pgv:10,mv:6};
 const premier=c.oraclePredictPlayer(p,{},new Set(),{});assert.equal(premier.expected,6.6);
 for(const id of ['x','f']) { c.activeLeagueId=id;c.oracleState.calib.biasByRole.D=0.8; assert.equal(c.oraclePredictPlayer(p,{},new Set(),{}).expected,premier.expected); }
 c.activeLeagueId='p';c.votiGlobaliInMemoria=[];const missing=c.oraclePredictPlayer(p,{},new Set(),{});assert.equal(missing.expected,6);assert(missing.factors.some(f=>f.includes('storico admin assente')));
});
test('Import voti: fonte Fantacalcio prioritaria, eventi conservati senza confondere assist aggregati',()=>{
 const rows=[['Nome','Voto','Gf','Gs','Rp','Rs','Au','Amm','Esp','Ass','rigori segnati','assist normali','assist soft','assist gold','porta inviolata'],['Rossi',6,1,0,0,0,0,0,0,0,0,0,0,0,0]];
 const c={FantaLeagueRules:R,rosterNormalizeName:s=>s.toLowerCase(),XLSX:{utils:{sheet_to_json:x=>x}}};vm.createContext(c);vm.runInContext(fn('estraiVotiDaWorkbook'),c);
 const result=c.estraiVotiDaWorkbook({SheetNames:['Statistico','Fantacalcio'],Sheets:{Statistico:[rows[0],['Rossi',4]],Fantacalcio:rows}},[{key:'rossi',name:'Rossi',team:'Roma'}]);
 assert.equal(result.trovati.rossi.v,9);assert.equal(R.score(result.trovati.rossi.events,'D',rules),10);
});
test('Fagioli: bonus diversi da Premier e profilo indipendente',()=>{
 const f=R.fagioli;
 assert.equal(R.resolve('Fagioli per tutti',rules.id),f);
 assert.equal(R.score({...events(),goals:1},'P',f),11);
 assert.equal(R.score({...events(),goals:1},'C',f),9);
 assert.equal(R.score({...events(),softAssists:1,goldAssists:1},'A',f),8);
 assert.equal(f.switchMode,'Disattivato');assert.equal(f.benchLimit,14);assert(!f.modules.includes('5-2-3'));
 const team=[{role:'P'},...Array.from({length:4},()=>({role:'D'}))];
 for(const [mv,b]of [[5.99,0],[6,.5],[6.25,1],[6.5,1.5],[6.75,2],[7,2.5],[7.25,3]])assert.equal(R.defense(team,f,()=>mv).bonus,b);
 assert.equal(R.defense(team,rules,()=>7).bonus,6);
});
test('Fonte unica: entrambe le leghe usano Fantacalcio, anche se Italia è disponibile',()=>{
 const record={events:{...events(),vote:7},sources:{Italia:{events:{...events(),vote:5}}}};
 assert.equal(R.eventsForRecord(record,R.fagioli).vote,7);assert.equal(R.eventsForRecord(record,rules).vote,7);
 assert.equal(R.eventsForRecord({events:events()},R.fagioli).vote,6);
 assert.equal(R.score({...events(),vote:null,noVote:true,yellow:1},'D',R.fagioli),5.5);
 assert.equal(R.score({...events(),vote:null,yellow:1},'D',R.fagioli),null);
 assert.equal(R.score({...events(),vote:null,noVote:true,yellow:1},'D',rules),null);
});
test('Import Excel mantiene i voti base di entrambe le fonti, anche con eventi incompleti',()=>{
 const header=['Nome','Voto','Gf','Gs','Rp','Rs','Au','Amm','Esp','Ass'];
 const c={FantaLeagueRules:R,rosterNormalizeName:s=>s.toLowerCase(),XLSX:{utils:{sheet_to_json:x=>x}}};
 vm.createContext(c);vm.runInContext(fn('estraiVotiDaWorkbook'),c);
 const result=c.estraiVotiDaWorkbook({SheetNames:['Italia','Fantacalcio'],Sheets:{Italia:[header,['Rossi',5,0,0,0,0,0,0,0,0]],Fantacalcio:[header,['Rossi',7,0,0,0,0,0,0,0,0]]}},[{key:'rossi',name:'Rossi',team:'Roma'}]);
 assert.equal(result.trovati.rossi.v,7);
 assert.equal(R.eventsForRecord(result.trovati.rossi,R.fagioli).vote,7);
 assert.equal(R.eventsForRecord(result.trovati.rossi,rules).vote,7);
});
test('Modificatore Fagioli usa Fantacalcio e può usare la media voto admin',()=>{
 const c={FantaLeagueRules:R,leagues:[{id:'f',name:'Fagioli per tutti'}],activeLeagueId:'f',oracleState:{},rosterNormalizeName:s=>s.toLowerCase(),normTeamName:s=>s.toLowerCase(),votiGlobaliInMemoria:[{giornata:1,votes:{rossi:{team:'Roma',sources:{Italia:{events:{vote:6.75}},Fantacalcio:{events:{vote:8}}}}}}]};
 vm.createContext(c);for(const n of ['activeLeagueRules','leagueExpectedVote'])vm.runInContext(fn(n),c);
 assert.equal(c.leagueExpectedVote({name:'Rossi',team:'Roma',role:'D',mv:8}),8);
 c.votiGlobaliInMemoria=[];assert.equal(c.leagueExpectedVote({name:'Rossi',role:'D',mv:8}),8);
});
test('Pannello Fagioli mostra il profilo giusto e nasconde 5-2-3',()=>{
 const box={innerHTML:''},button={style:{}};
 const c={activeLeagueRules:()=>R.fagioli,players:{starters:[],bench:[]},document:{getElementById:id=>id==='oracleRulesPanel'?box:button},escapeHtml:s=>s,leaguePlayerSamples:()=>[],leagueExpectedVote:()=>null};
 vm.createContext(c);vm.runInContext(fn('renderLeagueRules'),c);c.renderLeagueRules();
 assert(box.innerHTML.includes('Fagioli per tutti'));assert(box.innerHTML.includes('Italia'));assert(!box.innerHTML.includes('Premier'));assert(!box.innerHTML.includes('5-2-3'));assert.equal(button.style.display,'none');
 c.activeLeagueRules=()=>rules;c.renderLeagueRules();assert(box.innerHTML.includes('Premier Ticino League'));assert.equal(button.style.display,'');
});
test('Fantavoti admin senza eventi utilizzati da entrambe le leghe, senza falsa copertura bonus',()=>{
 const c={FantaLeagueRules:R,leagues:[{id:'f',name:'Fagioli per tutti'},{id:'p',name:rules.name}],activeLeagueId:'f',oracleState:{},rosterNormalizeName:s=>s.toLowerCase(),normTeamName:s=>s.toLowerCase(),votiGlobaliInMemoria:[{giornata:1,votes:{rossi:{v:7.5,team:'Roma'}}}]};
 vm.createContext(c);for(const n of ['activeLeagueRules','leaguePlayerSamples','leagueExpectedVote'])vm.runInContext(fn(n),c);
 const p={name:'Rossi',team:'Roma',role:'D'};
 for(const id of ['f','p']){c.activeLeagueId=id;assert.equal(c.leaguePlayerSamples(p)[0].score,7.5);assert.equal(c.leaguePlayerSamples(p,true).length,0);assert.equal(c.leagueExpectedVote(p),null);}
});
test('Formato admin compatto: Gf e Rf separati, Ass aggregati e voto base conservato',()=>{
 const header=['Cod.','Ruolo','Nome','Voto','Gf','Gs','Rp','Rs','Rf','Au','Amm','Esp','Ass'];
 const row=[1,'D','Test',6,1,0,0,0,1,0,1,0,2];
 const e=R.readEvents(row,header);
 assert.equal(e.vote,6);assert.equal(e.goals,2);assert.equal(e.penaltyGoals,1);assert.equal(e.assists,2);assert.equal(e.assistsAggregated,true);
 assert.equal(R.score(e,'D',R.premier),14.5);assert.equal(R.score(e,'D',R.fagioli),14.5);
 const keeper=R.readEvents([2,'P','Portiere',6,0,0,0,0,0,0,0,0,0],header);
 assert.equal(R.score(keeper,'P',R.premier),7);assert.equal(keeper.cleanSheetDerived,true);
 const missing=R.readEvents([2,'P','Portiere','SV',0,0,0,0,0,0,0,0,0],header);
 assert.equal(missing.cleanSheet,null);assert.equal(R.score(missing,'P',R.premier),null);
});
test('Import standard conteggia rigore una sola volta e conserva gli eventi nel record cloud',()=>{
 const headers=['Cod.','Ruolo','Nome','Voto','Gf','Gs','Rp','Rs','Rf','Au','Amm','Esp','Ass'];
 const c={FantaLeagueRules:R,rosterNormalizeName:s=>s.toLowerCase(),XLSX:{utils:{sheet_to_json:x=>x}}};vm.createContext(c);vm.runInContext(fn('estraiVotiDaWorkbook'),c);
 const result=c.estraiVotiDaWorkbook({SheetNames:['Fantacalcio'],Sheets:{Fantacalcio:[headers,[1,'D','Test',6,0,0,0,0,1,0,0,0,0]]}},[{key:'test',name:'Test',team:'Roma',cod:'1'}]);
 const saved=JSON.parse(JSON.stringify(result.trovati.test));assert.equal(saved.v,9);assert.equal(R.score(R.eventsForRecord(saved,R.premier),'D',R.premier),9);
});
test('Codici diversi non si confondono con cognomi simili e voto con asterisco resta leggibile',()=>{
 const headers=['Cod.','Ruolo','Nome','Voto','Gf','Gs','Rp','Rs','Rf','Au','Amm','Esp','Ass'];
 const rows=[headers,[1,'D','Rossi',6.5,0,0,0,0,0,0,0,0,0],[2,'A','Rossi Al.','6*',0,0,0,0,0,0,0,0,0]];
 const c={FantaLeagueRules:R,rosterNormalizeName:s=>s.toLowerCase(),XLSX:{utils:{sheet_to_json:x=>x}}};vm.createContext(c);vm.runInContext(fn('estraiVotiDaWorkbook'),c);
 const result=c.estraiVotiDaWorkbook({SheetNames:['Fantacalcio'],Sheets:{Fantacalcio:rows}},[{key:'rossi',name:'Rossi',cod:'1'}]);
 assert.equal(result.trovati.rossi.sources.Fantacalcio.events.vote,6.5);assert(result.nonAbbinati.includes('Rossi Al.'));
 assert.equal(R.readEvents(rows[2],headers).vote,6);
});

test('Assist: segnale sportivo positivo e limitato, indipendente dal valore in punti',()=>{
 const base={events:events()};const assisted={events:{...events(),assists:1}};
 assert.equal(R.formSignal(assisted).score-R.formSignal(base).score,0.40000000000000036);
 assert.equal(R.formSignal({events:{...events(),assists:100}}).score,7.5);
 assert.equal(R.formSignal({v:9}).proxy,true);
 assert.equal(R.formSignal({}),null);
});

test('Allineamento apertura: modulo automatico e undici seguono il consiglio; manuale resta per lega',()=>{
 const pick={name:'Test',role:'P'};
 const c={activeLeagueRules:()=>R.premier,oracleState:{},formations:{'4-3-3':{},'3-4-3':{}},currentModulo:'3-4-3',oracleBestFormation:()=>({modulo:'4-3-3',picks:[pick]}),players:{starters:[],bench:[pick]},document:{getElementById:()=>null,querySelectorAll:()=>[]},setModulo(m){c.currentModulo=m;}};
 vm.createContext(c);for(const n of ['installOracleFormation','alignOracleFormation'])vm.runInContext(fn(n),c);
 c.alignOracleFormation();assert.equal(c.currentModulo,'4-3-3');assert.equal(c.players.starters[0],pick);
 c.oracleState.manualModulo='3-4-3';c.alignOracleFormation();assert.equal(c.currentModulo,'3-4-3');
 c.oracleState={};c.alignOracleFormation();assert.equal(c.currentModulo,'4-3-3');
 c.oracleState.manualModulo='invalid';c.alignOracleFormation();assert.equal(c.oracleState.manualModulo,null);
});
test('Il render aggiorna campo e liste dopo il ricalcolo; snapshot dopo allineamento',()=>{
 const render=fn('renderOraclePage');assert(render.indexOf('runOracleEngine(true)')<render.indexOf('renderField()'));
 const run=fn('runOracleEngine');assert(run.indexOf('alignOracleFormation()')<run.indexOf('const idxSnap'));
 assert(fn('setModulo').includes('oracleState.manualModulo = m'));
 assert(fn('oracleLoadState').includes('saved.manualModulo'));
});
