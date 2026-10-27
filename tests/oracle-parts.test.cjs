// Scomposizione della previsione (parts): ogni fattore del motore deve essere
// misurabile separatamente dal martedi, senza cambiare il numero pubblicato.
// Gira sul motore vero estratto da app.html, come gli altri test .cjs.
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
  const end = html.indexOf('\n}', start);
  return html.slice(start, end + 2);
}
function constante(name) {
  const start = html.indexOf('const ' + name + ' = ');
  assert(start >= 0, name + ' presente');
  return html.slice(start, html.indexOf('];', start) + 2);
}
const vg = (giornata, votes) => ({ giornata, votes });
// stesso tracciato dei voti admin nel cloud: record.events letto da FantaLeagueRules.formSignal
const voto = (team, v, gf = 0, ass = 0) => ({ team, events: { vote: v, goals: gf, assists: ass, softAssists: 0, goldAssists: 0 } });

function motore(opts = {}) {
  const c = {
    FantaLeagueRules: require('../assets/league-rules.js'),
    votiGlobaliInMemoria: opts.voti || [],
    calendario: { giornate: [{ num: 8, matches: [{ home: 'Inter', away: 'Lecce' }, { home: 'Verona', away: 'Napoli' }] }] },
    findCurrentGiornataIdx: () => 0,
    oracleState: { history: [], calib: { samples: 0 } },
    infermeriaDi: name => (opts.infermeria || {})[name] || null,
    consigliGiornataCorrente: () => opts.consigli || null,
    listone: null,
  };
  vm.createContext(c);
  for (const name of ['quotationToFm', 'normTeamName', 'rosterNormalizeName', 'oracleMatchContext', 'computeTeamRatings',
    'oracleFormSamples', 'oraclePredictPlayer', 'compattaParts', 'statMisura', 'misuraPerFattore', 'consAdjDi', 'infDubbioDi',
    'pVotoDaPerc', 'tassoVotoStagione', 'probabiliCopronoSquadra', 'pVotoDi', 'calibrazionePVoto']) vm.runInContext(fn(name), c);
  vm.runInContext(constante('PVOTO_CALIBRAZIONE'), c);
  vm.runInContext('const VALORE_SENZA_VOTO = 5.0;', c);
  if (opts.probabili) vm.runInContext('var probabiliState = ' + JSON.stringify({ map: opts.probabili }) + ';', c);
  vm.runInContext(constante('FATTORI_MOTORE'), c);
  return c;
}
// Listone minimo: Inter forte, Lecce debole, cosi avversario e clean sheet si accendono.
const listone = [];
['Inter', 'Napoli'].forEach(t => { for (let i = 0; i < 8; i++) listone.push({ name: t + ' A' + i, team: t, role: i % 2 ? 'A' : 'C', fmReal: 7.4 }, { name: t + ' D' + i, team: t, role: i % 2 ? 'D' : 'P', fmReal: 6.8 }); });
['Lecce', 'Verona'].forEach(t => { for (let i = 0; i < 8; i++) listone.push({ name: t + ' A' + i, team: t, role: i % 2 ? 'A' : 'C', fmReal: 5.6 }, { name: t + ' D' + i, team: t, role: i % 2 ? 'D' : 'P', fmReal: 5.5 }); });
const somma = parts => Object.keys(parts).reduce((s, k) => s + parts[k], 0);
const predici = (c, p, titSig = {}) => c.oraclePredictPlayer(p, c.computeTeamRatings(listone), new Set(), titSig);

test('La somma delle parti e la previsione pubblicata, con tutti i fattori accesi', () => {
  const voti = [5, 6, 7].map(g => vg(g, { lautaro: voto('Inter', 7, 1, 0), bastoni: voto('Inter', 6.5), krstovic: voto('Lecce', 6) }));
  const c = motore({ voti, consigli: { lautaro: { fascia: 1 }, krstovic: { fascia: 3 } }, infermeria: { Bastoni: { stato: 'infortunato' } } });
  const lautaro = predici(c, { name: 'Lautaro', team: 'Inter', role: 'A', quotation: 35, fmReal: 7.8, mv: 6.6, pgv: 3, rigorista: true }, { Lautaro: { status: 'doubt', perc: 55 } });
  assert.ok(Math.abs(somma(lautaro.parts) - lautaro.expected) < 1e-9, 'somma = expected');
  assert.ok(lautaro.parts.forma !== 0, 'forma dai 3 voti');
  assert.ok(lautaro.parts.oppAdj > 0, 'Lecce abbordabile');
  assert.equal(lautaro.parts.homeAdj, 0.15);
  assert.equal(lautaro.parts.csAdj, 0, 'clean sheet spento il 26/10');
  // ballottaggio al 55% → p 0.70 (taratura G7/G8): il numero e la media pesata con il voto mancato
  assert.equal(lautaro.pVoto, 0.7); assert.equal(lautaro.titStatus, 'doubt');
  assert.ok(Math.abs(lautaro.parts.titAdj - 0.3 * (5 - lautaro.expSeGioca)) < 0.02, 'titAdj = (1-p)(5-expSeGioca)');
  assert.ok(lautaro.factors.some(f => /prende voto al 70%/.test(f)));
  assert.equal(lautaro.parts.rigorista, 0.35);
  assert.equal(lautaro.parts.consenso, 0.3);
  assert.equal(lautaro.parts.infAdj, 0);
  // il numero pubblicato resta quello di prima: base + correzioni, 2 decimali
  const seGioca = lautaro.parts.base + lautaro.parts.forma + lautaro.parts.oppAdj + 0.15 + 0.35 + 0.3;
  assert.ok(Math.abs(lautaro.expSeGioca - seGioca) < 0.011, 'se gioca = base + correzioni');

  const bastoni = predici(c, { name: 'Bastoni', team: 'Inter', role: 'D', quotation: 18, fmReal: 6.7, mv: 6.2, pgv: 3 });
  assert.ok(Math.abs(somma(bastoni.parts) - bastoni.expected) < 1e-9);
  // infermeria: p 0.05, il peso del voto mancato va in infAdj (misura per fattore)
  assert.equal(bastoni.pVoto, 0.05);
  assert.ok(Math.abs(bastoni.parts.infAdj - 0.95 * (5 - bastoni.expSeGioca)) < 0.02);
  assert.equal(bastoni.parts.titAdj, 0);
  assert.equal(bastoni.parts.csAdj, 0, 'clean sheet spento il 26/10, anche per i difensori');
  assert.ok(!bastoni.factors.some(f => /clean sheet|difesa a rischio/.test(f)), 'nessuna riga clean sheet nei fattori');
  assert.equal(bastoni.parts.consenso, 0);

  const krstovic = predici(c, { name: 'Krstovic', team: 'Lecce', role: 'A', quotation: 14, fmReal: 6.4, mv: 6.0, pgv: 3 }, { Krstovic: { status: 'out', perc: 20 } });
  assert.ok(Math.abs(somma(krstovic.parts) - krstovic.expected) < 1e-9);
  assert.ok(krstovic.parts.oppAdj < 0, 'Inter ostica');
  assert.equal(krstovic.parts.homeAdj, -0.15);
  // panchina al 20% → p 0.27: niente piu -1.0 fisso
  assert.equal(krstovic.pVoto, 0.27);
  assert.ok(Math.abs(krstovic.parts.titAdj - 0.73 * (5 - krstovic.expSeGioca)) < 0.02);
  assert.equal(krstovic.parts.consenso, -0.3);
});

test('Senza calendario e senza voti: forma preseason, nessun fattore inventato, clamp che chiude i conti', () => {
  const c = motore();
  const r = predici(c, { name: 'Nuovo', team: 'Cagliari', role: 'C', quotation: 6, formaPreseason: 0.8 });
  assert.ok(Math.abs(somma(r.parts) - r.expected) < 1e-9);
  assert.equal(r.parts.forma, 0.5, 'preseason tagliata a ±0.5');
  assert.equal(r.parts.oppAdj, 0); assert.equal(r.parts.homeAdj, 0); assert.equal(r.parts.csAdj, 0);
  assert.ok(Math.abs(r.parts.clamp) <= 0.005, 'solo arrotondamento');
  // fuoriclasse rigorista, consigliato, in casa, titolare certo: oltre 9.5, il taglio finisce in clamp
  const c2 = motore({ consigli: { bomber: { fascia: 1 } } });
  const b = predici(c2, { name: 'Bomber', team: 'Inter', role: 'A', quotation: 40, fmReal: 9.4, mv: 7.0, pgv: 12, rigorista: true }, { Bomber: { status: 'in', perc: 95 } });
  assert.equal(b.expected, 9.5);
  assert.ok(b.parts.clamp < -0.3, 'il clamp ha lavorato');
  assert.ok(Math.abs(somma(b.parts) - b.expected) < 1e-9);
});

test('Foto: compattaParts tiene 3 decimali e scarta gli zeri; togliere una parte ricostruisce exp', () => {
  const c = motore();
  const r = predici(c, { name: 'Nuovo', team: 'Inter', role: 'A', quotation: 20, fmReal: 7.1, mv: 6.5, pgv: 8, rigorista: true });
  const foto = c.compattaParts(r.parts);
  assert.equal(foto.csAdj, undefined); assert.equal(foto.titAdj, undefined); assert.equal(foto.bias, undefined);
  assert.equal(foto.rigorista, 0.35); assert.equal(foto.homeAdj, 0.15);
  assert.ok(Math.abs(somma(foto) - r.expected) < 0.005 * Object.keys(r.parts).length);
  assert.ok(Math.abs((r.expected - foto.rigorista) - (r.expected - 0.35)) < 1e-9);
  assert.equal(Object.keys(c.compattaParts(null)).length, 0);
});

test('Per fattore: conteggio dei toccati e MAE/scarto senza il fattore; foto vecchie senza parts → null', () => {
  const c = motore();
  // 4 confronti: il rigorista (+0.35) sposta due giocatori; togliendolo l'errore cala
  // per uno (sovrastimato) e sale per l'altro (sottostimato).
  const coppie = [
    { key: 'a', exp: 7.0, reale: 6.5, parts: { base: 6.5, rigorista: 0.35, homeAdj: 0.15 } },
    { key: 'b', exp: 6.5, reale: 7.0, parts: { base: 6.3, rigorista: 0.35, homeAdj: -0.15 } },
    { key: 'c', exp: 6.0, reale: 6.0, parts: { base: 6.15, homeAdj: -0.15 } },
    { key: 'd', exp: 6.8, reale: 6.0, parts: { base: 6.35, consenso: 0.3, homeAdj: 0.15 } },
  ];
  const voci = coppie.concat([{ key: 'e', exp: 5.0, parts: { base: 6.5, infAdj: -1.5 } }]);
  const pf = c.misuraPerFattore(coppie, voci);
  assert.equal(pf.n, 4);
  const riga = k => pf.righe.find(r => r.k === k);
  assert.equal(riga('rigorista').toccati, 2); assert.equal(riga('rigorista').inFoto, 2);
  assert.equal(riga('infAdj').toccati, 0); assert.equal(riga('infAdj').inFoto, 1);
  assert.equal(riga('homeAdj').toccati, 4);
  assert.equal(riga('oppAdj').toccati, 0); assert.ok(Math.abs(riga('oppAdj').dMae) < 1e-12, 'fattore assente: nessuna variazione');
  // consenso: solo d, sovrastimato di 0.8 → senza, errore 0.5: MAE cala di 0.3/4
  assert.ok(Math.abs(riga('consenso').dMae - (-0.3 / 4)) < 1e-9);
  assert.ok(Math.abs(riga('consenso').biasSenza - (pf.bias - 0.3 / 4)) < 1e-9);
  assert.ok(riga('consenso').dBias < 0, 'lo scarto si avvicina a zero');
  // rigorista: a cala di 0.35, b sale di 0.35 → MAE invariato
  assert.ok(Math.abs(riga('rigorista').dMae) < 1e-9);
  assert.equal(c.misuraPerFattore(coppie.map(x => ({ key: x.key, exp: x.exp, reale: x.reale })), []), null);
  assert.equal(c.misuraPerFattore([], []), null);
  assert.equal(vm.runInContext('FATTORI_MOTORE.map(f => f[0]).join()', c), 'forma,oppAdj,homeAdj,csAdj,infAdj,titAdj,rigorista,consenso');
});

test('Consenso di piu fonti: lo score pesato decide il peso, fino a ±0.4', () => {
  assert.equal(motore().consAdjDi({ fascia: 1, score: 0.5 }), 0.3, 'SOS da solo: come prima');
  assert.equal(motore().consAdjDi({ fascia: 1, score: 1 }), 0.4, 'tutte d\'accordo: tetto 0.4');
  assert.equal(motore().consAdjDi({ fascia: 3, score: -0.25 }), -0.15);
  assert.equal(motore().consAdjDi({ fascia: 3 }), -0.3, 'giornate vecchie senza score');
  assert.equal(motore().consAdjDi({ inf: 'out' }), 0, 'solo infermeria: nessun consenso');
  const voti = [5, 6, 7].map(g => vg(g, { lautaro: voto('Inter', 7, 1, 0) }));
  const c = motore({ voti, consigli: { lautaro: { fascia: 1, score: 0.9 } } });
  const l = predici(c, { name: 'Lautaro', team: 'Inter', role: 'A', quotation: 35, fmReal: 7.8, mv: 6.6, pgv: 3 });
  assert.equal(l.parts.consenso, 0.4);
  assert.ok(Math.abs(somma(l.parts) - l.expected) < 1e-9);
});

test('Infermeria unita: "dubbio" da mezzo malus, il resto non cambia', () => {
  const voti = [5, 6, 7].map(g => vg(g, { bastoni: voto('Inter', 6.5) }));
  const c = motore({ voti, consigli: { bastoni: { inf: 'dubbio', infNota: 'affaticamento' } } });
  const b = predici(c, { name: 'Bastoni', team: 'Inter', role: 'D', quotation: 18, fmReal: 6.7, mv: 6.2, pgv: 3 });
  // dal 27/10: p = 0.6 × titolarita (storico 3/3 → 0.97) = 0.58, peso in infAdj
  assert.equal(b.pVoto, 0.58);
  assert.ok(Math.abs(b.parts.infAdj - 0.42 * (5 - b.expSeGioca)) < 0.02);
  assert.equal(b.parts.titAdj, 0);
  assert.equal(b.parts.consenso, 0);
  assert.ok(b.factors.some(f => /in dubbio/.test(f)));
  assert.ok(Math.abs(somma(b.parts) - b.expected) < 1e-9);
});

test('Probabilità di prendere voto: taratura, storico, assenti dalle probabili, titolari certi intoccati', () => {
  const c = motore();
  for (const [perc, p] of [[0, 0.10], [20, 0.27], [55, 0.70], [80, 0.94], [100, 0.97]]) assert.ok(Math.abs(c.pVotoDaPerc(perc) - p) < 1e-9, 'perc ' + perc);
  assert.ok(c.pVotoDaPerc(37.5) > 0.27 && c.pVotoDaPerc(37.5) < 0.70, 'interpolazione');
  assert.ok(c.pVotoDaPerc(-5) === 0.10 && c.pVotoDaPerc(150) === 0.97, 'fuori scala');
  // titolare certo (85%): p 0.95 → nessun peso sul numero
  const sicuro = predici(c, { name: 'Sicuro', team: 'Inter', role: 'D', quotation: 10, fmReal: 6.4, mv: 6.1, pgv: 8 }, { Sicuro: { status: 'in', perc: 85 } });
  assert.ok(sicuro.pVoto >= 0.9); assert.equal(sicuro.parts.titAdj, 0); assert.equal(sicuro.expected, sicuro.expSeGioca);
  // senza probabili e senza storico: default, nessun peso
  const nuovo = predici(c, { name: 'Nuovo', team: 'Cagliari', role: 'C', quotation: 6 });
  assert.equal(nuovo.pVoto, 0.9); assert.equal(nuovo.parts.titAdj, 0);
  // storico: 3 giornate con voto su 3 → tasso 1 → p 0.97
  const voti = [5, 6, 7].map(g => vg(g, { fisso: voto('Lecce', 6) }));
  const c2 = motore({ voti });
  assert.equal(c2.tassoVotoStagione('fisso'), 1);
  assert.equal(predici(c2, { name: 'Fisso', team: 'Lecce', role: 'D', quotation: 5, fmReal: 6.0, mv: 6.0, pgv: 3 }).pVoto, 0.97);
  // probabili caricate (>=100) che coprono la squadra, giocatore assente → p bassa
  const map = {}; for (let i = 0; i < 100; i++) map['x' + i] = { nome: 'X' + i, team: i % 2 ? 'Inter' : 'Lecce', perc: 50 };
  const c3 = motore({ voti, probabili: map });
  const fuori = predici(c3, { name: 'Fuori', team: 'Inter', role: 'A', quotation: 12, fmReal: 6.8, mv: 6.2, pgv: 3 });
  assert.equal(fuori.pVotoFonte, 'assente dalle probabili'); assert.ok(fuori.pVoto <= 0.2);
  assert.ok(Math.abs(fuori.parts.titAdj - (1 - fuori.pVoto) * (5 - fuori.expSeGioca)) < 0.02);
  // squadra non coperta dalle probabili (turno a pezzi) → si ripiega sullo storico
  const nonCoperto = predici(c3, { name: 'Fisso', team: 'Cagliari', role: 'D', quotation: 5, fmReal: 6.0, mv: 6.0, pgv: 3 });
  assert.equal(nonCoperto.pVotoFonte, 'storico');
  // news senza percentuale
  assert.equal(predici(c, { name: 'Nuovo', team: 'Cagliari', role: 'C', quotation: 6 }, { Nuovo: { status: 'out' } }).pVoto, 0.3);
});

test('Calibrazione pv nella misura: per fascia, prevista contro chi ha preso voto; foto senza pv → null', () => {
  const c = motore();
  const voci = []; for (let i = 0; i < 60; i++) voci.push({ key: 'a' + i, pv: i < 30 ? 0.9 : 0.3 });
  const votati = new Set(voci.filter((v, i) => i < 28 || (i >= 30 && i < 39)).map(v => v.key));
  const cal = c.calibrazionePVoto(voci, votati);
  assert.equal(cal.n, 60);
  const alta = cal.righe.find(r => r.fascia === '0.8–1.0'), bassa = cal.righe.find(r => r.fascia === '0.2–0.4');
  assert.equal(alta.n, 30); assert.ok(Math.abs(alta.giocato - 28 / 30) < 1e-9); assert.ok(Math.abs(alta.prevista - 0.9) < 1e-9);
  assert.equal(bassa.n, 30); assert.ok(Math.abs(bassa.giocato - 9 / 30) < 1e-9);
  assert.equal(c.calibrazionePVoto(voci.map(v => ({ key: v.key })), votati), null);
  assert.equal(c.calibrazionePVoto(voci.slice(0, 10), votati), null, 'sotto 50 giocatori non si calibra');
});
