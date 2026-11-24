const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const html=fs.readFileSync('app.html','utf8');
function fn(n){let i=html.indexOf('async function '+n+'(');if(i<0)i=html.indexOf('function '+n+'(');return html.slice(i,html.indexOf('\n}',i)+2);}
const formationsSrc=(()=>{const i=html.indexOf('const formations = {');return html.slice(i,html.indexOf('\n};',i)+3);})();
// 24/11/2026: al cambio lega currentModulo restava quello della lega precedente.
// renderField ribilanciava il campo sul modulo sbagliato e la spinta al cloud
// scriveva quel modulo sulla lega attiva (10/11: Premier 3-4-3 → 4-3-3).
const g=(name,role)=>({name,role});
const rosa343=[g('P1','P'),g('D1','D'),g('D2','D'),g('D3','D'),g('C1','C'),g('C2','C'),g('C3','C'),g('C4','C'),g('A1','A'),g('A2','A'),g('A3','A')];
const rosa433=[g('P9','P'),g('D6','D'),g('D7','D'),g('D8','D'),g('D9','D'),g('C6','C'),g('C7','C'),g('C8','C'),g('A6','A'),g('A7','A'),g('A8','A')];
function contesto(){
  const rose={premier:{starters:rosa343,bench:[g('D4','D'),g('C5','C')]},fagioli:{starters:rosa433,bench:[g('C9','C')]},vuota:{starters:[],bench:[]}};
  const manuali={premier:'3-4-3',fagioli:null,vuota:null};
  const c={leagues:[{id:'premier',name:'Premier'},{id:'fagioli',name:'Fagioli'},{id:'vuota',name:'Vuota'}],activeLeagueId:'fagioli',
    players:{starters:rosa433.slice(),bench:[g('C9','C')]},oracleState:{manualModulo:null},listone:{},votiGlobaliInMemoria:null,document:{getElementById:()=>null,querySelectorAll:()=>[]},
    ribilanci:0,rebalanceForFormation(){c.ribilanci++;},
    saveActiveLeague(){},renderCompSwitcher(){},loadListinoFromStorage(){},applicaVotiGlobali(){},updateListinoBadge(){},updateLeagueBanner(){},renderLists(){},
    renderCalendarioWidget(){},renderLeagueSwitcher(){},renderDashboardManage(){},closeLeagueMenu(){},showToast(){}};
  c.loadRosterFromStorage=()=>{const r=rose[c.activeLeagueId];c.players.starters=r.starters.slice();c.players.bench=r.bench.slice();};
  c.oracleLoadState=()=>{c.oracleState={manualModulo:manuali[c.activeLeagueId]};};
  // renderField ridotto alla sua guardia vera: se la formazione non regge, ribilancia
  c.renderField=()=>{if(!c.formazioneCoerente())c.rebalanceForFormation(c.modulo());};
  vm.createContext(c);
  vm.runInContext(formationsSrc+"\nlet currentModulo='4-3-3';function modulo(){return currentModulo;}function metti(m){currentModulo=m;}\n"
    +fn('formazioneCoerente')+'\n'+fn('moduloDellaRosaCaricata')+'\n'+fn('allineaModuloAllaRosa')+'\n'+fn('switchToLeague'),c);
  return c;
}
test('Cambio lega: il modulo segue la rosa della lega, nessun ribilanciamento',()=>{
  const c=contesto();
  c.switchToLeague('premier');
  assert.equal(c.modulo(),'3-4-3','Premier ha un 3-4-3 salvato');
  assert.equal(c.ribilanci,0,'il campo non viene ribilanciato');
  assert.deepEqual(c.players.starters.map(p=>p.name),rosa343.map(p=>p.name),'undici intatto');
  c.switchToLeague('fagioli');
  assert.equal(c.modulo(),'4-3-3');assert.equal(c.ribilanci,0);
  assert.deepEqual(c.players.starters.map(p=>p.name),rosa433.map(p=>p.name));
});
test('Cambio lega: rosa vuota torna al 4-3-3, undici incompleto tiene il modulo scelto a mano',()=>{
  const c=contesto();
  c.switchToLeague('premier');c.switchToLeague('vuota');
  assert.equal(c.modulo(),'4-3-3');
  // undici incompleto: 3 difensori e un buco a centrocampo, modulo a mano 3-4-3
  c.players.starters=rosa343.map((p,i)=>i===7?{name:'---',role:'C',isEmpty:true}:p);c.oracleState.manualModulo='3-4-3';c.metti('4-3-3');
  assert.equal(c.moduloDellaRosaCaricata(),'3-4-3');
  c.oracleState.manualModulo=null;
  assert.equal(c.moduloDellaRosaCaricata(),'3-4-3','senza scelta a mano: il modulo che regge, non il 4-3-3');
  // buco nel primo slot dopo i tre difensori: reggono sia 3-4-3 sia 4-3-3, resta quello attuale
  c.players.starters=rosa343.map((p,i)=>i===4?{name:'---',role:'C',isEmpty:true}:p);
  c.metti('4-3-3');assert.equal(c.moduloDellaRosaCaricata(),'4-3-3');
  c.metti('3-4-3');assert.equal(c.moduloDellaRosaCaricata(),'3-4-3');
});
test('Eliminazione della lega attiva: anche li il modulo viene riallineato',()=>{
  const i=html.indexOf('// Se era attiva: passa alla prima rimasta');const j=html.indexOf('renderLeagueSwitcher();',i);
  assert.ok(i>0&&html.slice(i,j).includes('allineaModuloAllaRosa();'));
});
