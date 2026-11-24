const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const html=fs.readFileSync('app.html','utf8');
function fn(n){let i=html.indexOf('async function '+n+'(');if(i<0)i=html.indexOf('function '+n+'(');return html.slice(i,html.indexOf('\n}',i)+2);}
const formationsSrc=(()=>{const i=html.indexOf('const formations = {');return html.slice(i,html.indexOf('\n};',i)+3);})();
// 24/11/2026: i rigoristi (curati dall'admin nel listone globale) arrivavano
// solo nel file della lega attiva al login, e una volta travasati nel browser
// non salivano al cloud perche la firma del file non li vedeva.
test('Firma del file di lega: cambia quando cambiano rigoristi o forma, non altrimenti',()=>{
  const c={};vm.createContext(c);vm.runInContext(fn('firmaListinoPersonale'),c);
  const base={uploadedName:'lega.xlsx',uploadedDate:'2026-11-21',players:[{name:'CALHANOGLU',team:'Inter'},{name:'ROMANO',team:'Cagliari'}]};
  const f0=c.firmaListinoPersonale(base);
  assert.equal(c.firmaListinoPersonale(JSON.parse(JSON.stringify(base))),f0,'stesso file, stessa firma');
  const conRig=JSON.parse(JSON.stringify(base));conRig.players[0].rigorista=true;
  assert.notEqual(c.firmaListinoPersonale(conRig),f0,'un rigorista in piu cambia la firma');
  const falso=JSON.parse(JSON.stringify(base));falso.players[0].rigorista=false;falso.players[1].formaPreseason=0;
  assert.equal(c.firmaListinoPersonale(falso),f0,'campi a false/0 non cambiano la firma');
  const conForma=JSON.parse(JSON.stringify(base));conForma.players[1].formaPreseason=0.3;
  assert.notEqual(c.firmaListinoPersonale(conForma),f0);
  assert.equal(typeof c.firmaListinoPersonale({}),'string');
});
test('La spinta del file di lega usa la firma coi rigoristi',()=>{
  const i=html.indexOf('// 2c. Il file di lega.');const j=html.indexOf('listinoSpedito[cloudId] = firma;',i);
  assert.ok(i>0&&j>i);assert.ok(html.slice(i,j).includes('const firma = firmaListinoPersonale(ll.listinoPersonale);'));
});
test('Cambio lega: il file della lega che diventa attiva riceve i rigoristi, li salva e li spinge',()=>{
  const g=(name,role)=>({name,role});
  const rosa=[g('P1','P'),g('D1','D'),g('D2','D'),g('D3','D'),g('D4','D'),g('CALHANOGLU','C'),g('C2','C'),g('C3','C'),g('A1','A'),g('A2','A'),g('A3','A')];
  const file={fagioli:{source:'uploaded',players:[{name:'CALHANOGLU',team:'Inter'},{name:'ROMANO',team:'Cagliari'}]},premier:{source:'uploaded',players:[{name:'CALHANOGLU',team:'Inter',rigorista:true,formaPreseason:0},{name:'ROMANO',team:'Cagliari',rigorista:false,formaPreseason:0}]}};
  const c={leagues:[{id:'premier',name:'Premier'},{id:'fagioli',name:'Fagioli'}],activeLeagueId:'premier',console,
    listinoGlobaleInMemoria:[{name:'CALHANOGLU',team:'Inter',rigorista:true},{name:'ROMANO',team:'Cagliari',rigorista:false}],
    players:{starters:rosa.slice(),bench:[]},oracleState:{manualModulo:null},listone:file.premier,votiGlobaliInMemoria:null,document:{getElementById:()=>null,querySelectorAll:()=>[]},
    salvati:0,spinte:0,saveListinoToStorage(){c.salvati++;},scheduleCloudSync(){c.spinte++;},
    rosterNormalizeName:s=>String(s).toLowerCase(),normTeamName:s=>String(s||'').toLowerCase(),
    rebalanceForFormation(){},saveActiveLeague(){},renderCompSwitcher(){},applicaVotiGlobali(){},updateListinoBadge(){},updateLeagueBanner(){},renderLists(){},renderField(){},
    renderCalendarioWidget(){},renderLeagueSwitcher(){},renderDashboardManage(){},closeLeagueMenu(){},showToast(){},oracleLoadState(){},loadRosterFromStorage(){}};
  vm.createContext(c);
  vm.runInContext(formationsSrc+"\nlet currentModulo='4-3-3';function loadListinoFromStorage(){listone=archivio[activeLeagueId];}\n"
    +fn('arricchisciConDatiAdmin')+'\n'+fn('moduloDellaRosaCaricata')+'\n'+fn('allineaModuloAllaRosa')+'\n'+fn('switchToLeague'),Object.assign(c,{archivio:file}));
  c.switchToLeague('fagioli');
  assert.equal(c.listone.players[0].rigorista,true,'Calhanoglu rigorista nel file di Fagioli');
  assert.equal(c.listone.players[1].rigorista,false);
  assert.equal(c.salvati,1);assert.equal(c.spinte,1);
  c.switchToLeague('premier');
  assert.equal(c.salvati,1,'Premier li aveva gia: niente salvataggio');assert.equal(c.spinte,1);
  c.switchToLeague('fagioli');
  assert.equal(c.salvati,1,'secondo passaggio: niente da cambiare');
});
