const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const html=fs.readFileSync('app.html','utf8');
function fn(n){let i=html.indexOf('async function '+n+'(');if(i<0)i=html.indexOf('function '+n+'(');return html.slice(i,html.indexOf('\n}',i)+2);}
// 24/11/2026: la cache dei segnali di titolarita guardava solo QUANTI giocatori
// ha la rosa. Dopo uno scambio alla pari restituiva i segnali vecchi e i nuovi
// arrivati restavano senza segnale (G12 in Fagioli: cinque acquisti a 5.4).
function contesto(){
  const c={newsState:{lastUpdate:null},probabiliState:{ts:1,map:{calhanoglu:{perc:90},romano:{perc:100},belahyane:{perc:100}}},
    players:{starters:[{name:'CALHANOGLU',role:'C'}],bench:[{name:'ROMANO',role:'C'}]},
    getTitolaritaSignals:()=>({}),rosterNormalizeName:s=>String(s).toLowerCase()};
  vm.createContext(c);
  vm.runInContext('let _titCache = { sig: {}, key: null };\n'+fn('probabiliDi')+'\n'+fn('titolaritaSignals'),c);
  return c;
}
test('Titolarita: uno scambio alla pari in rosa invalida la cache',()=>{
  const c=contesto();
  const prima=c.titolaritaSignals();
  assert.equal(prima.ROMANO.perc,100);
  assert.equal(c.titolaritaSignals(),prima,'rosa invariata: stessa cache');
  c.players.bench=[{name:'BELAHYANE',role:'C'}]; // stesso numero di giocatori
  const dopo=c.titolaritaSignals();
  assert.ok(dopo.BELAHYANE,'il nuovo arrivato ha il suo segnale');
  assert.equal(dopo.BELAHYANE.perc,100);assert.equal(dopo.BELAHYANE.status,'in');
  assert.equal(dopo.ROMANO,undefined,'chi e uscito non resta in cache');
  assert.equal(dopo.CALHANOGLU.perc,90);
});
test('Titolarita: probabili aggiornate invalidano la cache anche a rosa ferma',()=>{
  const c=contesto();
  c.titolaritaSignals();
  c.probabiliState.map.romano={perc:35};c.probabiliState.ts=2;
  assert.equal(c.titolaritaSignals().ROMANO.status,'out');
});
test('Caricamento file di lega: rigoristi e forma travasati prima del salvataggio',()=>{
  const i=html.indexOf("source: 'uploaded',");const j=html.indexOf('saveListinoToStorage();',i);
  assert.ok(i>0&&j>i);
  assert.ok(html.slice(i,j).includes('arricchisciConDatiAdmin(listinoGlobaleInMemoria)'),'travaso tra la creazione del listone e il salvataggio');
});
