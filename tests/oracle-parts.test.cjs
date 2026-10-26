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
    'oracleFormSamples', 'oraclePredictPlayer', 'compattaParts', 'statMisura', 'misuraPerFattore', 'consAdjDi', 'infDubbioDi']) vm.runInContext(fn(name), c);
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
  assert.equal(lautaro.parts.titAdj, 0, 'ballottaggio: niente piu -0.4 (26/10), solo meno fiducia');
  assert.equal(lautaro.titStatus, 'doubt');
  assert.equal(lautaro.parts.rigorista, 0.35);
  assert.equal(lautaro.parts.consenso, 0.3);
  assert.equal(lautaro.parts.infAdj, 0);
  // il numero pubblicato resta quello di prima: base + correzioni, 2 decimali
  const prima = lautaro.parts.base + lautaro.parts.forma + lautaro.parts.oppAdj + 0.15 + 0.35 + 0.3;
  assert.equal(lautaro.expected, parseFloat(prima.toFixed(2)));

  const bastoni = predici(c, { name: 'Bastoni', team: 'Inter', role: 'D', quotation: 18, fmReal: 6.7, mv: 6.2, pgv: 3 });
  assert.ok(Math.abs(somma(bastoni.parts) - bastoni.expected) < 1e-9);
  assert.equal(bastoni.parts.infAdj, -1.5);
  assert.equal(bastoni.parts.csAdj, 0, 'clean sheet spento il 26/10, anche per i difensori');
  assert.ok(!bastoni.factors.some(f => /clean sheet|difesa a rischio/.test(f)), 'nessuna riga clean sheet nei fattori');
  assert.equal(bastoni.parts.consenso, 0);

  const krstovic = predici(c, { name: 'Krstovic', team: 'Lecce', role: 'A', quotation: 14, fmReal: 6.4, mv: 6.0, pgv: 3 }, { Krstovic: { status: 'out', perc: 20 } });
  assert.ok(Math.abs(somma(krstovic.parts) - krstovic.expected) < 1e-9);
  assert.ok(krstovic.parts.oppAdj < 0, 'Inter ostica');
  assert.equal(krstovic.parts.homeAdj, -0.15);
  assert.equal(krstovic.parts.titAdj, -1.0);
  assert.equal(krstovic.parts.consenso, -0.3);
});

test('Senza calendario e senza voti: forma preseason, nessun fattore inventato, clamp che chiude i conti', () => {
  const c = motore();
  const r = predici(c, { name: 'Nuovo', team: 'Cagliari', role: 'C', quotation: 6, formaPreseason: 0.8 });
  assert.ok(Math.abs(somma(r.parts) - r.expected) < 1e-9);
  assert.equal(r.parts.forma, 0.5, 'preseason tagliata a ±0.5');
  assert.equal(r.parts.oppAdj, 0); assert.equal(r.parts.homeAdj, 0); assert.equal(r.parts.csAdj, 0);
  assert.ok(Math.abs(r.parts.clamp) <= 0.005, 'solo arrotondamento');
  // squalificato + panchina su una base bassa: il taglio a 4 finisce in clamp
  const c2 = motore({ infermeria: { Basso: { stato: 'squalificato' } } });
  const b = predici(c2, { name: 'Basso', team: 'Verona', role: 'D', quotation: 1, fmReal: 5.2, mv: 5.2, pgv: 12 }, { Basso: { status: 'out', perc: 10 } });
  assert.equal(b.expected, 4);
  assert.ok(b.parts.clamp > 0.3, 'il clamp ha lavorato');
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
  assert.equal(b.parts.infAdj, -0.75);
  assert.equal(b.parts.consenso, 0);
  assert.ok(b.factors.some(f => /in dubbio/.test(f)));
  assert.ok(Math.abs(somma(b.parts) - b.expected) < 1e-9);
});
