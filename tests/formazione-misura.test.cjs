// Misura della FORMAZIONE consigliata, non solo del voto dei singoli
// (richiesta di Sacha del 9/11, caso Cristante). Funzioni pure estratte da
// app.html: punti con le sostituzioni, undici perfetto, undici ingenuo.
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
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
function blocco(inizio, fine) {
  const start = html.indexOf(inizio);
  assert(start >= 0, inizio + ' presente');
  return html.slice(start, html.indexOf(fine, start) + fine.length);
}
function ctx() {
  const c = { FantaLeagueRules: require('../assets/league-rules.js') };
  vm.createContext(c);
  vm.runInContext(blocco('const formations = {', '\n};').replace('const formations', 'var formations'), c);
  for (const n of ['rosterNormalizeName', 'puntiFormazione', 'ottimoAPosteriori', 'formazioneIngenua']) vm.runInContext(fn(n), c);
  return c;
}
const g = (key, role, name) => ({ key, role, name: name || key });
// 4-3-3 congelato: Mandas; De Winter, Valeri, Bartesaghi, Kamara; Cristante, Samardzic, Calhanoglu; Lontani, Kvernadze, Hojlund
const titolari = [g('mandas', 'P'), g('dewinter', 'D'), g('valeri', 'D'), g('bartesaghi', 'D'), g('kamara', 'D'),
  g('cristante', 'C'), g('samardzic', 'C'), g('calhanoglu', 'C'), g('lontani', 'A'), g('kvernadze', 'A'), g('hojlund', 'A')];
const panchina = [g('lucca', 'A'), g('romano', 'C'), g('matic', 'C'), g('ndour', 'C'), g('couto', 'D'), g('comert', 'D'), g('abankwah', 'D'), g('motta', 'P')];
// voti veri della G11 (schermata di Sacha): Bartesaghi e Samardzic senza voto
const voti = { mandas: 6, dewinter: 5.5, valeri: 5.5, kamara: 5.5, cristante: 7, calhanoglu: 6.5, lontani: 6, kvernadze: 5, hojlund: 5.5,
  lucca: 5.5, romano: 6, matic: 6, ndour: 5.5, couto: 5.5, abankwah: 6 };

test('Punti della formazione: sostituzioni per ruolo nell\'ordine della panchina, come su Leghe Fantacalcio', () => {
  const c = ctx();
  const r = c.puntiFormazione(titolari, panchina, voti, 5);
  // Bartesaghi (D) → Couto 5.5, Samardzic (C) → Romano 6: 64 di fantavoti (la schermata
  // dice 65 "solo voti" perche conta il 7 di Mandas senza il gol subito, e 65 finali col fattore campo)
  assert.equal(r.punti, 64);
  assert.equal(r.sostituzioni, 2);
  assert.equal(r.senzaVoto, 0);
  const entrati = r.schierati.filter(x => x.daPanchina).map(x => x.key);
  assert.equal(entrati.join(','), 'couto,romano');
});

test('Senza cambio dello stesso ruolo con voto si gioca in 10: lo slot vale zero', () => {
  const c = ctx();
  const r = c.puntiFormazione(titolari, panchina.filter(p => p.role !== 'D'), voti, 5);
  assert.equal(r.senzaVoto, 1);
  assert.equal(r.punti, 64 - 5.5);
  const bloccato = c.puntiFormazione(titolari, panchina, voti, 1);
  assert.equal(bloccato.sostituzioni, 1, 'tetto dei cambi della lega rispettato');
  assert.equal(bloccato.senzaVoto, 1);
});

test('Undici perfetto a posteriori: miglior modulo tra quelli della lega, solo chi ha preso voto', () => {
  const c = ctx();
  const rosa = titolari.concat(panchina);
  const best = c.ottimoAPosteriori(rosa, voti, ['4-3-3', '3-4-3', '3-5-2'], c.formations);
  assert.ok(best);
  // 3 D: Abankwah 6, De Winter 5.5, Valeri 5.5 (o Kamara/Couto) · C: Cristante 7, Calhanoglu 6.5, Romano 6, Matic 6 (+ Ndour 5.5)
  // A: Lontani 6, Hojlund 5.5, Lucca 5.5 (+ Kvernadze 5). 3-5-2: 6+17+31+11.5 = 65.5; 3-4-3: 6+17+25.5+17 = 65.5; 4-3-3: 6+22.5+19.5+17 = 65
  assert.equal(best.punti, 65.5);
  assert.ok(['3-4-3', '3-5-2'].includes(best.modulo));
  assert.equal(best.scelti.length, 11);
  assert.ok(!best.scelti.some(x => x.key === 'bartesaghi' || x.key === 'samardzic'), 'chi non ha voto non entra');
  const pochi = c.ottimoAPosteriori(rosa.filter(p => p.role !== 'P'), voti, ['4-3-3'], c.formations);
  assert.equal(pochi, null, 'senza portiere votato nessun undici completo');
});

test('Undici ingenuo: fantamedia tra i disponibili, infortunati e panchinari delle probabili esclusi', () => {
  const c = ctx();
  const mk = (name, role, fm, team) => ({ name, role, fmReal: fm, team: team || 'X' });
  const all = [mk('Mandas', 'P', 6.2), mk('Motta', 'P', 5.9),
    mk('De Winter', 'D', 6.1), mk('Valeri', 'D', 6.0), mk('Bartesaghi', 'D', 6.3), mk('Kamara', 'D', 5.9), mk('Couto', 'D', 5.8), mk('Comert', 'D', 5.7),
    mk('Cristante', 'C', 6.6), mk('Samardzic', 'C', 6.8), mk('Calhanoglu', 'C', 6.9), mk('Romano', 'C', 6.0), mk('Matic', 'C', 6.1), mk('Ndour', 'C', 6.0),
    mk('Lontani', 'A', 7.2), mk('Kvernadze', 'A', 6.4), mk('Hojlund', 'A', 7.0), mk('Lucca', 'A', 6.5)];
  const fuori = new Set(['Samardzic', 'Bartesaghi']);
  const ing = c.formazioneIngenua(all, c.FantaLeagueRules.fagioli, p => p.fmReal, p => !fuori.has(p.name));
  assert.ok(ing);
  assert.equal(ing.titolari.length, 11);
  const nomi = ing.titolari.map(t => t.name);
  assert.ok(!nomi.includes('Samardzic') && !nomi.includes('Bartesaghi'), 'gli indisponibili restano fuori');
  assert.ok(nomi.includes('Lontani') && nomi.includes('Hojlund') && nomi.includes('Calhanoglu'), 'le fantamedie alte entrano');
  assert.ok(c.FantaLeagueRules.fagioli.modules.includes(ing.modulo), 'modulo ammesso dalla lega');
  assert.equal(ing.panchina.length, 7);
  assert.equal(ing.panchina[0].role, 'A', 'panchina in ordine A, C, D, P come quella Oracle');
});

test('Misura del martedì: legge gli snapshot di tutte le leghe, misura la proposta Oracle e a parte il campo scelto dall\'utente', async () => {
  const c = ctx();
  vm.runInContext(fn('ottimoAPosteriori'), c);
  const snapOk = { dateISO: '2026-11-06T17:39:15Z', dopoCalcio: false, modulo: '4-3-3', moduli: ['4-3-3', '3-4-3', '3-5-2'], sostituzioni: 5,
    lineup: titolari, bench: panchina, consigliata: { modulo: '4-3-3', titolari, panchina }, ingenua: { modulo: '4-3-3', titolari, panchina } };
  // campo scelto dall'utente: Lucca (5.5) al posto di Lontani (6), la proposta Oracle resta l'altra
  const scambia = (lista, a, b) => lista.map(x => x.key === a ? g(b, x.role) : x);
  const snapManuale = Object.assign({}, snapOk, { manuale: true, modulo: '4-3-3', lineup: scambia(titolari, 'lontani', 'lucca'), bench: scambia(panchina, 'lucca', 'lontani') });
  // foto del 9/11, senza proposta separata: il campo potrebbe essere una scelta dell'utente, non si misura
  const snapVecchio = Object.assign({}, snapOk); delete snapVecchio.consigliata;
  const stati = [
    { league_id: 'L1', user_id: 'U1', state: { snapshots: { 11: snapOk, 10: { lineup: titolari, modulo: '4-3-3' } } } },
    { league_id: 'L2', user_id: 'U2', state: { snapshots: { 11: Object.assign({}, snapOk, { dopoCalcio: true }) } } },
    { league_id: 'L3', user_id: 'U3', state: { snapshots: { 11: snapManuale } } },
    { league_id: 'L4', user_id: 'U4', state: { snapshots: { 11: snapVecchio } } },
  ];
  const leghe = [{ id: 'L1', league_name: 'Fagioli Per Tutti', team_name: 'SSC Dinomite' }, { id: 'L2', league_name: 'Premier', team_name: 'X' }, { id: 'L3', league_name: 'Zeta', team_name: 'Y' }, { id: 'L4', league_name: 'Vecchia', team_name: 'W' }];
  const client = { from: t => ({ select: () => {
    const data = t === 'oracle_states' ? stati : leghe;
    return Promise.resolve({ data, error: null });
  } }) };
  c.currentUser = { id: 'admin' };
  c.console = console;
  const src = html.slice(html.indexOf('async function misuraFormazioniLeghe('), html.indexOf('\n}', html.indexOf('async function misuraFormazioniLeghe(')) + 2);
  vm.runInContext(src, c);
  const votesRow = {}; Object.keys(voti).forEach(k => { votesRow[k] = { v: voti[k] }; });
  const out = await c.misuraFormazioniLeghe([{ giornata: 10, votes: votesRow }, { giornata: 11, votes: votesRow }], client);
  assert.equal(out.length, 2, 'L1 e L3: G10 senza panchina, L2 scritto dopo il calcio, L4 senza proposta Oracle separata');
  assert.equal(out[0].campo, null, 'campo uguale alla proposta: niente colonna a parte');
  assert.equal(out[1].lega, 'Zeta · Y');
  assert.equal(out[1].oracle.punti, 64, 'la colonna Oracle resta la proposta, non il campo dell\'utente');
  assert.equal(out[1].campo.punti, 63.5);
  assert.equal(out[0].lega, 'Fagioli Per Tutti · SSC Dinomite');
  assert.equal(out[0].g, 11);
  assert.equal(out[0].oracle.punti, 64);
  assert.equal(out[0].ingenua.punti, 64);
  assert.equal(out[0].ottimo.punti, 65.5);
  assert.ok(out[0].lasciati.length >= 1, 'chi era nel perfetto e non in campo');
});
