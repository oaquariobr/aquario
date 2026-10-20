// ===== MOTOR DA MARÉ =====
// Função pura e determinística: mesmo elenco + mesmo número de maré = mesmo resultado em qualquer computador.
// Usada no site (protótipo) e, no futuro, no robô que calcula a maré oficial.
const MARE=(()=>{
  // atributos por espécie: vida, ataque, defesa, esquiva, nível na cadeia, quem caça, chance de sair para caçar, habilidade
  const STATS={
    sardinha: {hp:30, atk:3, def:1, dodge:.30,tier:1,hunts:[],      chance:0,  hab:"cardume"},
    palhaco:  {hp:35, atk:3, def:2, dodge:.18,tier:1,hunts:[],      chance:0,  hab:"anemona"},
    baiacu:   {hp:55, atk:4, def:3, dodge:.14,tier:1,hunts:[],      chance:0,  hab:"veneno"},
    golfinho: {hp:90, atk:14,def:6, dodge:.30,tier:2,hunts:[1],     chance:.35,hab:"dupla"},
    garoupa:  {hp:110,atk:16,def:8, dodge:.08,tier:2,hunts:[1],     chance:.35,hab:"emboscada"},
    raia:     {hp:100,atk:10,def:8, dodge:.15,tier:2,hunts:[1],     chance:.15,hab:"ferrao"},
    tartaruga:{hp:150,atk:6, def:18,dodge:.05,tier:2,hunts:[],      chance:0,  hab:"casco"},
    tubarao:  {hp:180,atk:30,def:10,dodge:.05,tier:3,hunts:[1,2],   chance:.6, hab:"fome"},
    orca:     {hp:260,atk:38,def:14,dodge:.10,tier:4,hunts:[1,2,3], chance:.6, hab:"fome"},
    baleia:   {hp:600,atk:5, def:22,dodge:0,  tier:4,hunts:["sardinha"],chance:.4,hab:"gigante"},
    megalodon:{hp:520,atk:55,def:20,dodge:.05,tier:5,hunts:[1,2,3,4],chance:1, hab:"fome",tries:2},
  };
  const HAB={
    cardume:"Cardume: quanto mais sardinhas vivas, mais fácil escapar",
    anemona:"Anêmona: chance de se esconder e o ataque falhar",
    veneno:"Veneno: quem morde se envenena e pode até morrer; muitos cospem o baiacu",
    dupla:"Ataque em dupla: morde duas vezes",
    emboscada:"Emboscada: a primeira mordida causa o dobro",
    ferrao:"Ferrão: contra-ataca quem tenta morder",
    casco:"Casco: defesa altíssima",
    fome:"Fome: perde vida se passar a maré sem comer",
    gigante:"Gigante: engole sardinhas inteiras de uma vez",
  };
  // estratégia escolhida para a próxima maré (no site real vem do comentário no post do dia)
  const ESTR={auto:"Automático",atacar:"Atacar",esconder:"Esconder",cardume:"Cardume"};
  const ESTR_TXT={auto:"Sem estratégia: nada muda",atacar:"Caça mais e ganha 50% mais experiência, mas fica mais exposto",
    esconder:"Fica nos corais: é menos caçado e esquiva mais, mas ganha metade da experiência",cardume:"Junto com um amigo que também escolheu você: os dois esquivam mais"};
  const XP_NIVEL=[0,40,100,180,300]; // xp necessário para os níveis 2..5
  const MAXN=5;
  function rngOf(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  function hashStr(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
  const mult=l=>1+.15*(l-1); // cada nível: +15% vida, ataque e defesa
  // cria a ficha de um bicho novo
  function novo(name,sp){const S=STATS[sp];return {name,sp,lvl:1,xp:0,hp:S.hp,alive:true,kills:[],escapes:0,survived:0,killedBy:null,diedAt:null,bornAt:null,hidden:false,estr:"auto",amigo:null,rival:null,vingou:null}}
  const maxHp=b=>Math.round(STATS[b.sp].hp*mult(b.lvl));
  const atk=b=>STATS[b.sp].atk*mult(b.lvl), def=b=>STATS[b.sp].def*mult(b.lvl);
  function ganhaXp(b,x,ev,t){if(b.lvl>=MAXN||!b.alive)return;b.xp+=Math.round(x*(b.estr==="atacar"?1.5:1));
    while(b.lvl<MAXN&&b.xp>=XP_NIVEL[b.lvl]){const old=maxHp(b);b.lvl++;b.hp+=maxHp(b)-old;ev.push({t,type:"nivel",a:b.name,lvl:b.lvl})}}
  // roda uma maré: recebe o elenco (objeto nome -> ficha) e o número da maré; devolve os eventos em ordem de tempo
  function rodar(roster,mareN,dur=70){
    const R=rngOf(hashStr("mare#"+mareN)^Object.keys(roster).length),ev=[];
    const vivos=Object.values(roster).filter(b=>b.alive);
    const porTier={};for(const b of vivos){const tr=STATS[b.sp].tier;(porTier[tr]??=[]).push(b)}
    const sardVivas=vivos.filter(b=>b.sp==="sardinha").length,sardFrac=sardVivas/Math.max(1,vivos.length);
    const comeu=new Set();
    const mutuo=b=>{if(b.estr!=="cardume"||!b.amigo)return false;const o=roster[b.amigo];return !!(o&&o.alive&&o.estr==="cardume"&&o.amigo===b.name)};
    const bonusEsq=b=>(b.estr==="esconder"?.1:b.estr==="atacar"?-.06:0)+(mutuo(b)?.12:0);
    // vingança: quem renasceu e abate o próprio assassino ganha bônus
    // abater o assassino vale bônus cheio; sobreviver a um ataque dele vale meia vingança
    const vinga=(k,v,t,meia)=>{if(k.rival&&k.rival===v.name&&k.alive){ev.push({t,type:"vinganca",a:k.name,b:v.name,como:meia?"sobreviveu":"abateu"});
      k.vingou={name:v.name,sp:v.sp,mare:mareN,como:meia?"sobreviveu":"abateu"};k.rival=null;ganhaXp(k,meia?30:60,ev,t);if(!meia)k.hp=maxHp(k)}};
    const alvoDe=(a,lista)=>{let tot=0;const w=lista.map(b=>{const x=(a.rival===b.name?6:1)*(b.rival===a.name?3:1)*(b.estr==="esconder"?.55:1);tot+=x;return x});
      let r=R()*tot;for(let i=0;i<lista.length;i++){r-=w[i];if(r<=0)return lista[i]}return lista[lista.length-1]};
    // quem sai para caçar nesta maré, em ordem aleatória
    const vivoRival=b=>b.rival&&roster[b.rival]&&roster[b.rival].alive;
    const chanceDe=b=>b.estr==="esconder"?0:Math.min(1,STATS[b.sp].chance+(b.estr==="atacar"?.25:0)+(vivoRival(b)?.3:0));
    const cacadores=vivos.filter(b=>STATS[b.sp].chance>0&&R()<chanceDe(b));for(let q=cacadores.length-1;q>0;q--){const w=R()*(q+1)|0;[cacadores[q],cacadores[w]]=[cacadores[w],cacadores[q]]}
    cacadores.forEach((a,k)=>{
      const S=STATS[a.sp],tries=S.tries||1;
      for(let tr=0;tr<tries;tr++){
        if(!a.alive)break;
        let alvos=S.hunts.flatMap(h=>typeof h==="string"?vivos.filter(b=>b.sp===h&&b.alive):(porTier[h]||[]).filter(b=>b.alive));
        alvos=alvos.filter(b=>b!==a&&b.sp!==a.sp);if(!alvos.length)break;
        const v=alvoDe(a,alvos);
        let t=Math.min(dur-8,3+(k+tr*.5)/Math.max(1,cacadores.length)*(dur-14)+R()*4);
        ev.push({t,type:"caca",a:a.name,b:v.name});t+=3+R()*2;
        // gigante: engole a sardinha de uma vez
        if(S.hab==="gigante"){
          if(R()<STATS.sardinha.dodge+sardFrac*.5+bonusEsq(v)){ev.push({t,type:"fuga",a:a.name,b:v.name,como:"cardume"});v.escapes++;ganhaXp(v,8,ev,t);vinga(v,a,t+.3,true);continue}
          v.hp=0;v.alive=false;v.killedBy={name:a.name,sp:a.sp};v.diedAt=mareN;a.kills.push({name:v.name,sp:v.sp,mare:mareN});comeu.add(a);
          ev.push({t,type:"morte",a:a.name,b:v.name,como:"engoliu"});ganhaXp(a,20,ev,t);vinga(a,v,t);continue}
        let first=true;
        for(let round=0;round<3&&v.alive&&a.alive;round++){
          const VS=STATS[v.sp];
          // defesas do alvo
          if(VS.hab==="anemona"&&R()<.35){ev.push({t,type:"fuga",a:a.name,b:v.name,como:"anemona"});v.escapes++;ganhaXp(v,8,ev,t);break}
          const esq=bonusEsq(v)+VS.dodge+(VS.hab==="cardume"?sardFrac*.5:0)+(v.lvl-1)*.03-(round*.05);
          if(R()<esq){ev.push({t,type:"fuga",a:a.name,b:v.name,como:VS.hab==="cardume"?"cardume":"esquiva"});v.escapes++;ganhaXp(v,8,ev,t);break}
          const bites=S.hab==="dupla"?2:1;
          for(let bi=0;bi<bites&&v.alive;bi++){
            let dmg=Math.max(1,Math.round(atk(a)*(.8+R()*.4)-def(v)*.5));
            if(first&&S.hab==="emboscada")dmg*=2;first=false;
            v.hp=Math.max(0,v.hp-dmg);ev.push({t,type:"mordida",a:a.name,b:v.name,dmg,hp:v.hp,max:maxHp(v)});t+=.7;
            if(v.hp<=0){v.alive=false;v.killedBy={name:a.name,sp:a.sp};v.diedAt=mareN;a.kills.push({name:v.name,sp:v.sp,mare:mareN});comeu.add(a);
              ev.push({t,type:"morte",a:a.name,b:v.name});ganhaXp(a,20+10*Math.max(0,STATS[v.sp].tier-S.tier+1),ev,t);vinga(a,v,t);break}
          }
          // reação do alvo: veneno, ferrão ou mordida de volta
          if(a.alive){let rd=0,como=null;
            if(VS.hab==="veneno"){rd=Math.round(20+maxHp(a)*.22+4*v.lvl);como="veneno"}else if(VS.hab==="ferrao"){rd=15+3*v.lvl;como="ferrao"}
            else if(v.alive&&VS.atk>=10){rd=Math.max(1,Math.round(atk(v)*.4-def(a)*.5));como="revide"}
            if(rd){a.hp=Math.max(0,a.hp-rd);ev.push({t,type:"revide",a:v.name,b:a.name,dmg:rd,hp:a.hp,max:maxHp(a),como});t+=.5;
              if(a.hp<=0){a.alive=false;a.killedBy={name:v.name,sp:v.sp};a.diedAt=mareN;v.kills.push({name:a.name,sp:a.sp,mare:mareN});
                ev.push({t,type:"morte",a:v.name,b:a.name,como});ganhaXp(v,60,ev,t);vinga(v,a,t)}
              // quem sente o veneno muitas vezes cospe o baiacu e desiste
              else if(como==="veneno"&&v.alive&&R()<.55){ev.push({t,type:"fuga",a:a.name,b:v.name,como:"cuspiu"});v.escapes++;ganhaXp(v,8,ev,t);break}}}
          t+=.6;
        }
        if(v.alive)vinga(v,a,t,true);
      }
    });
    // fim da maré: fome, recuperação e experiência por sobreviver
    for(const b of vivos){if(!b.alive)continue;
      if(STATS[b.sp].hab==="fome"&&!comeu.has(b)){b.hp=Math.max(1,b.hp-Math.round(maxHp(b)*.12))}
      b.hp=Math.min(maxHp(b),b.hp+Math.round(maxHp(b)*.3));b.survived++;ganhaXp(b,b.estr==="esconder"?5:mutuo(b)?15:10,ev,dur)}
    // a estratégia vale só para esta maré: na próxima a pessoa escolhe de novo
    for(const b of vivos){b.estr="auto";b.amigo=null}
    ev.sort((x,y)=>x.t-y.t);
    return ev;
  }
  return {STATS,HAB,ESTR,ESTR_TXT,XP_NIVEL,MAXN,novo,rodar,maxHp,atk,def};
})();
if(typeof module!=="undefined")module.exports=MARE;
