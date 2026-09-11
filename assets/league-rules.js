/* Regole osservate in sola lettura su Leghe Fantacalcio. Nessun accesso alla sessione esterna. */
(function(root) {
  'use strict';
  const premier = Object.freeze({
    id: 'premier-ticino-league-v1', name: 'Premier Ticino League',
    source: 'https://leghe.fantacalcio.it/premier-ticino-league/settings',
    voteSource:'Fantacalcio', yellowWithoutVote:false, benchLimit:null,
    modules: ['3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-2-3','5-3-2','5-4-1'],
    goals: {P:20,D:4,C:3.5,A:3}, penalties:3,
    assists: {normal:1,soft:0.5,gold:1.5}, cleanSheet:1,
    substitutions:5, substitutionMode:'Traditional', switchMode:'Plus',
    defenseBands:[[6,1],[6.25,2],[6.5,3],[6.75,4],[7,6],[7.25,6]],
    firstGoal:66, goalStep:6, drawGap:4,
  });
  const fagioli = Object.freeze({
    id:'fagioli-per-tutti-v1', name:'Fagioli per tutti',
    source:'https://leghe.fantacalcio.it/fagioli-per-tutti/settings', voteSource:'Italia',
    modules:['3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-3-2','5-4-1'],
    goals:{P:5,D:4,C:3,A:3}, penalties:3, assists:{normal:1,soft:1,gold:1},cleanSheet:1,
    substitutions:5,substitutionMode:'Traditional',switchMode:'Disattivato',benchLimit:14,
    yellowWithoutVote:true,defenseBands:[[6,0.5],[6.25,1],[6.5,1.5],[6.75,2],[7,2.5],[7.25,3]],
    firstGoal:66,goalStep:6,drawGap:4,
  });
  function resolve(name, id) {
    const profiles=[premier,fagioli];
    const normalize=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
    // Un nome verificato ha precedenza su un eventuale riferimento vecchio.
    return profiles.find(p=>normalize(p.name)===normalize(name)) || profiles.find(p=>p.id===id) || null;
  }
  function eventsForRecord(record,rules) {
    if(!record||!rules)return null;
    // Fonte unica decisa dall'utente: i voti Fantacalcio pubblicati dall'admin.
    // voteSource del profilo resta la fonte ufficiale della lega, solo informativa.
    if(record.sources && record.sources.Fantacalcio)return record.sources.Fantacalcio.events || null;
    if(!record.voteSource || record.voteSource==='Fantacalcio')return record.events || null;
    return null;
  }
  function score(events, role, rules) {
    if (!rules || !events || !['P','D','C','A'].includes(role)) return null;
    if(events.noVote===true && events.vote===null && rules.yellowWithoutVote && events.yellow>0 && events.red===0) return 5.5;
    const needed=['vote','goals','penaltyGoals','assists','softAssists','goldAssists','goalsConceded','penaltiesSaved','penaltiesMissed','ownGoals','yellow','red'];
    if (needed.some(k=>typeof events[k]!=='number'||!Number.isFinite(events[k]))) return null;
    if (events.vote<1 || events.vote>10 || needed.slice(1).some(k=>events[k]<0||!Number.isInteger(events[k]))) return null;
    if (events.penaltyGoals>events.goals) return null;
    if (role==='P' && typeof events.cleanSheet!=='boolean') return null;
    return events.vote + (events.goals-events.penaltyGoals)*rules.goals[role]
      + events.penaltyGoals*rules.penalties + events.assists*rules.assists.normal
      + events.softAssists*rules.assists.soft + events.goldAssists*rules.assists.gold
      + (role==='P' && events.cleanSheet ? rules.cleanSheet : 0)
      - events.goalsConceded + events.penaltiesSaved*3 - events.penaltiesMissed*3
      - events.ownGoals*2 - events.yellow*0.5 - events.red;
  }
  function readEvents(row, headers) {
    const h=headers.map(v=>String(v).trim().toLowerCase());
    const fields={vote:['voto','v'],goals:['gf','gol segnati'],penaltyGoals:['rf','rigori segnati'],
      assists:['assist normali','ass'],softAssists:['assist soft'],goldAssists:['assist gold'],
      goalsConceded:['gs','gol subiti'],penaltiesSaved:['rp','rigori parati'],penaltiesMissed:['rs','rigori sbagliati'],
      ownGoals:['au','autogol'],yellow:['amm','ammonizioni'],red:['esp','espulsioni'],cleanSheet:['porta inviolata']};
    const events={};
    Object.entries(fields).forEach(([key,names])=>{
      const idx=h.findIndex(v=>names.includes(v));
      const raw=idx<0?null:row[idx];
      const n=raw===null||raw===undefined||String(raw).trim()===''?null:Number(String(raw).replace(',','.').replace(/\*$/, '').trim());
      events[key]=n!==null&&Number.isFinite(n)?n:null;
    });
    // Nel tracciato compatto Gf indica i gol su azione e Rf i rigori realizzati.
    if(h.includes('gf') && h.includes('rf') && events.goals!==null && events.penaltyGoals!==null) events.goals += events.penaltyGoals;
    // Ass è un totale aggregato: non contiene la classificazione soft/gold.
    if(h.includes('ass') && !h.includes('assist normali') && !h.includes('assist soft') && !h.includes('assist gold') && events.assists!==null) {
      events.softAssists=0;events.goldAssists=0;events.assistsAggregated=true;
    }
    const voteIndex=h.findIndex(v=>fields.vote.includes(v));
    events.noVote=voteIndex>=0 && /^(sv|s\.v\.?)$/i.test(String(row[voteIndex]).trim());
    events.cleanSheet=events.cleanSheet===1?true:events.cleanSheet===0?false:null;
    if(!h.includes('porta inviolata') && typeof events.vote==='number' && events.vote>=1 && events.vote<=10 && events.goalsConceded!==null) {
      events.cleanSheet=events.goalsConceded===0;events.cleanSheetDerived=true;
    }
    return events;
  }
  // Pesi euristici identici per ogni lega; non rappresentano fantapunti attesi.
  function formSignal(record) {
    const e=eventsForRecord(record,premier);
    const valid=v=>typeof v==='number'&&Number.isFinite(v);
    if(e&&valid(e.vote)&&e.vote>=1&&e.vote<=10) {
      const fields=['goals','assists','softAssists','goldAssists'];
      const complete=fields.every(k=>valid(e[k])&&e[k]>=0);
      const activity=complete?Math.min(1.5,0.6*e.goals+0.4*(e.assists+e.softAssists+e.goldAssists)):0;
      return {score:Math.max(4,Math.min(9.5,e.vote+activity)),proxy:!complete};
    }
    if(valid(record?.v)) return {score:Math.max(4,Math.min(9.5,6+(record.v-6)*0.5)),proxy:true};
    return null;
  }
  function defense(picks, rules, voteOf) {
    if (!rules) return {bonus:0,available:true};
    const defenders=picks.filter(p=>p.role==='D');
    if (defenders.length<4) return {bonus:0,available:true};
    const keeper=picks.find(p=>p.role==='P');
    const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=10;
    const votes=defenders.map(voteOf).filter(valid).sort((a,b)=>b-a);
    const kv=keeper ? voteOf(keeper) : null;
    if (votes.length<4 || !valid(kv)) return {bonus:0,available:false};
    const mean=(kv+votes.slice(0,3).reduce((a,b)=>a+b,0))/4;
    let bonus=0;rules.defenseBands.forEach(([min,b])=>{if(mean>=min)bonus=b;});
    return {bonus,mean,available:true};
  }
  function matchScore(home,away,rules) {
    if(!rules||![home,away].every(Number.isFinite))return null;
    const goals=n=>n<rules.firstGoal?0:1+Math.floor((n-rules.firstGoal)/rules.goalStep);
    let h=goals(home),a=goals(away);
    if(h===a&&h>0&&Math.abs(home-away)>=rules.drawGap){if(home>away)h++;else a++;}
    return {home:h,away:a};
  }
  function combinations(items,n) {
    if(items.length<n)return [items.slice()];
    const out=[];
    function walk(at,picks){if(picks.length===n){out.push(picks);return;}
      for(let i=at;i<=items.length-(n-picks.length);i++)walk(i+1,picks.concat(items[i]));}
    walk(0,[]);return out;
  }
  // Copertura panchina: quante assenze ATTESE per ruolo (somma delle
  // probabilita di forfait dei titolari) restano senza un cambio sano.
  // Un buco atteso costa come uno slot vuoto: giocare in 10 azzera il voto.
  // Nato da un caso vero (set 2026): 8 C di cui 4 infortunati, il 3-4-3
  // schierava i 4 sani lasciando in panchina solo infortunati — bastava un
  // forfait per restare in 10, e il confronto moduli non lo vedeva.
  function copertura(picks,by,riskOf) {
    if(typeof riskOf!=='function')return null;
    const perRuolo={};let penalita=0;
    ['P','D','C','A'].forEach(r=>{
      const rischio=x=>Math.max(0,Math.min(1,riskOf(x)||0));
      const attese=picks.filter(x=>x.role===r).reduce((s,x)=>s+rischio(x),0);
      const sani=by[r].filter(x=>!picks.includes(x)&&rischio(x)<0.5).length;
      const scoperte=Math.max(0,attese-sani);
      perRuolo[r]={sani,attese,scoperte};
      penalita+=scoperte*6;
    });
    return {perRuolo,penalita};
  }
  // Solo P e D interagiscono col modificatore: esploriamo le loro combinazioni.
  function best(roster,formations,rules,scoreOf,voteOf,riskOf) {
    const by={P:[],D:[],C:[],A:[]};roster.forEach(p=>{if(by[p.role])by[p.role].push(p);});
    Object.values(by).forEach(a=>a.sort((x,y)=>scoreOf(y)-scoreOf(x)));
    let result=null;
    const modules=rules?rules.modules:Object.keys(formations).filter(m=>m!=='5-2-3');
    for(const modulo of modules){
      const req=formations[modulo]?.requirements;if(!req)continue;
      const others=by.C.slice(0,req.C).concat(by.A.slice(0,req.A));
      const ds=rules&&req.D>=4?combinations(by.D,req.D):[by.D.slice(0,req.D)];
      const ps=rules&&req.D>=4?combinations(by.P,1):[by.P.slice(0,1)];
      for(const d of ds)for(const p of ps){
        const picks=p.concat(d,others),filled=picks.length,needed=11;
        const modifier=defense(picks,rules,voteOf);
        const formTotal=picks.reduce((s,x)=>s+scoreOf(x),0);
        // Preferenza limitata a 0.9 sull'intera formazione, separata dalla forma.
        const leagueAdjustment=Math.min(0.9,modifier.bonus*0.15);
        const cov=copertura(picks,by,riskOf);
        const total=formTotal-(needed-filled)*6+leagueAdjustment-(cov?cov.penalita:0);
        if(!result||total>result.total)result={modulo,total,formTotal,leagueAdjustment,filled,needed,picks,modifier,copertura:cov};
      }
    }
    return result;
  }
  const api={formSignal,premier,fagioli,eventsForRecord,resolve,score,defense,matchScore,best,readEvents};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.FantaLeagueRules=api;
})(typeof globalThis!=='undefined'?globalThis:this);
