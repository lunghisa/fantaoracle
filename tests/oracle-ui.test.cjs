const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
function fn(name) {
  const start = html.indexOf('function ' + name + '(');
  assert(start >= 0, name + ' presente');
  // Le funzioni testate hanno la graffa finale a inizio riga.
  const end = html.indexOf('\n}', start);
  return html.slice(start, end + 2);
}
function fixtureText(markup) { return markup.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function fixtureContext() {
  const c = {
    calendario: { currentIdx: 1, giornate: [
      {num: 3, matches: [{home: 'Inter', away: 'Roma'}]},
      {num: 4, matches: [{home: 'Inter', away: 'Milan'}]},
    ] },
    findCurrentGiornataIdx: () => 0,
    escapeHtml: s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  };
  vm.createContext(c);
  for (const name of ['normTeamName', 'oracleMatchContext', 'playerFixtureHtml']) vm.runInContext(fn(name), c);
  return c;
}
for (const file of ['app.html', 'index.html']) test(file + ': JavaScript compilabile', () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc=|application\/ld\+json/.test(m[1])) continue;
    new vm.Script(m[2], {filename: file});
  }
});
test('Partita corrente, indipendente dal calendario sfogliato; alias squadra', () => {
  const c = fixtureContext();
  assert.equal(fixtureText(c.playerFixtureHtml({team:'Internazionale'})), 'Internazionale\u2013Roma');
  assert.equal(c.oracleMatchContext({team:'Inter'}).giornata, 3);
});
test('Trasferta: solo la squadra del giocatore è in grassetto', () => {
  const c = fixtureContext();
  assert.equal(fixtureText(c.playerFixtureHtml({team:'Roma'})), 'Inter\u2013Roma');
  assert.match(c.playerFixtureHtml({team:'Roma'}, true), /<strong>Roma<\/strong>/);
  assert(!c.playerFixtureHtml({team:'Roma'}, true).includes('<strong>Inter</strong>'));
  assert.match(c.playerFixtureHtml({team:'Roma'}), /Inter in casa/);
});
test('Calendario o squadra mancanti: nessuna avversaria inventata', () => {
  const c = fixtureContext();
  assert.match(c.playerFixtureHtml({team:'Napoli'}), /Avversaria non disponibile/);
  c.calendario.giornate = [];
  assert.match(c.playerFixtureHtml({}), /Squadra non disponibile/);
});
test('Nomi provenienti dai dati vengono trattati come testo', () => {
  const c = fixtureContext();
  c.calendario.giornate[0].matches[0].away = '<img src=x onerror=alert(1)>';
  assert(!c.playerFixtureHtml({team:'Inter'}).includes('<img'));
  assert(!c.playerFixtureHtml({team:'<script>'}).includes('<script>'));
});
function element(id, active=false, page) {
  const values=new Set(active?['active']:[]);
  return {id, dataset:{page},style:{},attrs:{},classList:{
    add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x),
    toggle(x,on){on?values.add(x):values.delete(x)},
  }, setAttribute(k,v){this.attrs[k]=v}, removeAttribute(k){delete this.attrs[k]}};
}
test('Navigazione interna, accessi protetti e collegamenti obsoleti', () => {
  const names=['dashboard','ai','news','admin'];
  const pages=names.map(x=>element('page-'+x,x==='dashboard'));
  const tabs=names.map(x=>element('tab-'+x,x==='dashboard'));
  const mobile=names.map(x=>element('mobile-'+x,x==='dashboard',x));
  const all=[...pages,...tabs,...mobile,element('campoDopoOracle'),element('pageTitle')];
  const scrolls=[];
  const c={window:{scrollTo:options=>scrolls.push(options)},document:{getElementById:id=>all.find(e=>e.id===id)||null,querySelectorAll:s=>s==='.page'?pages:s==='.nav-tab'?tabs:mobile},currentUser:null,showToast:()=>{},trialGateBlocks:()=>false,openTrialGate:()=>{},updateContextBar:()=>{},currentMode:'oracle',renderField:()=>{},renderLists:()=>{},renderOraclePage:()=>{},newsState:{lastUpdate:new Date()},renderNews:()=>{},loadNews:()=>{},Date};
  vm.createContext(c);vm.runInContext(fn('showPage'),c);
  c.showPage('news',element('link-interno'));
  assert(tabs[2].classList.contains('active'));
  assert.equal(mobile[2].attrs['aria-current'],'page');
  c.showPage('inesistente');assert(pages[2].classList.contains('active'));
  c.showPage('admin');assert(pages[2].classList.contains('active'));
  c.trialGateBlocks=()=>true;c.showPage('ai');assert(pages[2].classList.contains('active'));
  c.trialGateBlocks=()=>false;c.showPage('campo');assert(pages[1].classList.contains('active'));
  assert.equal(tabs[2].attrs['aria-current'],undefined);
  for (const from of ['dashboard','news','ai']) {
    for (const to of ['dashboard','news','ai'].filter(x=>x!==from)) {
      c.showPage(from);
      const before=scrolls.length;
      c.showPage(to);
      assert.equal(scrolls.length,before+1);
      assert.equal(scrolls.at(-1).top,0);
      assert.equal(scrolls.at(-1).behavior,'instant');
    }
  }
  const before=scrolls.length;
  c.showPage('inesistente');c.showPage('admin');
  c.trialGateBlocks=()=>true;c.showPage('ai');
  assert.equal(scrolls.length,before);
});
test('Le liste titolari e panchina mostrano entrambe la partita', () => {
  const c=fixtureContext();
  const lists={starterList:{innerHTML:'',children:[],appendChild(x){this.children.push(x)}},benchList:{innerHTML:'',children:[],appendChild(x){this.children.push(x)}}};
  Object.assign(c,{
    players:{starters:[{name:'Titolare',team:'Inter',role:'D',score:6}],bench:[{name:'Riserva',team:'Roma',role:'C',score:6.5,oracle:7}]},
    currentMode:'oracle',getAlertedPlayerNames:()=>new Set(),titolaritaSignals:()=>({}),COLORI_RUOLO:{},
    updateRosterStats:()=>{},renderRosaCompleta:()=>{},
    document:{getElementById:id=>lists[id],createElement:()=>({style:{},addEventListener(){}})},
  });
  vm.runInContext(fn('renderLists'),c); c.renderLists();
  assert.match(fixtureText(lists.starterList.children[0].innerHTML), /Inter–Roma/);
  assert.match(fixtureText(lists.benchList.children[0].innerHTML), /Inter–Roma/);
  assert(!lists.starterList.children[0].innerHTML.includes('NaN'));
});
