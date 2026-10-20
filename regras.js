// Regras compartilhadas entre o site e o robô da maré.
// Tudo aqui precisa dar exatamente o mesmo resultado nos dois lados.
const REGRAS=(()=>{
  // espécies na mesma ordem e com as mesmas chances do site
  const SPECIES=[
    {id:"sardinha",nome:"Sardinha",p:33.5},{id:"palhaco",nome:"Peixe-palhaço",p:14},{id:"baiacu",nome:"Baiacu",p:12},
    {id:"golfinho",nome:"Golfinho",p:10},{id:"garoupa",nome:"Garoupa",p:9},{id:"tartaruga",nome:"Tartaruga-marinha",p:7},
    {id:"raia",nome:"Raia-águia",p:6},{id:"tubarao",nome:"Tubarão",p:5},{id:"orca",nome:"Orca",p:2.5},
    {id:"baleia",nome:"Baleia-azul",p:.9},{id:"megalodon",nome:"Megalodon",p:.1}];
  const LENDA={sardinha:"Sardinha Prateada",palhaco:"Palhaço Dourado",baiacu:"Baiacu Rei",golfinho:"Golfinho Alfa",garoupa:"Garoupa Ancestral",tartaruga:"Tartaruga Milenar",raia:"Raia Fantasma",tubarao:"Tubarão Rei",orca:"Orca Matriarca",baleia:"Baleia Anciã",megalodon:"Megalodon Primordial"};
  function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
  function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  const norm=n=>"@"+String(n).trim().replace(/^@+/,"").toLowerCase();
  // a espécie é sorteada pelo @; a cada temporada o sorteio muda
  function especie(name,temp){const r=rng(hash(norm(name)+(temp>1?"#t"+temp:"")))();let a=0;for(const sp of SPECIES){a+=sp.p/100;if(r<a)return sp.id}return SPECIES[0].id}
  // sorteio com as mesmas chances do começo, a partir de qualquer texto (roleta e renascer usam o @ + o número da maré)
  function sorteio(chave){const r=rng(hash(String(chave)))();let a=0;for(const sp of SPECIES){a+=sp.p/100;if(r<a)return sp.id}return SPECIES[0].id}
  // lê os comandos de pérolas no comentário
  function comandosDoTexto(txt){const t=String(txt||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase(),c=[];
    if(/\bROLETA\b/.test(t))c.push("roleta");if(/\bCURAR\b|\bCURA\b/.test(t))c.push("curar");if(/\bRENASCER\b/.test(t))c.push("renascer");return c}
  const nomeSp=id=>(SPECIES.find(s=>s.id===id)||{nome:id}).nome;
  const nomeDe=b=>b.lvl>=5?LENDA[b.sp]||nomeSp(b.sp):nomeSp(b.sp);
  // lê o comentário e devolve a estratégia escolhida (ou null)
  function estrategiaDoTexto(txt){
    const t=String(txt||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    if(/\bATACAR\b|\bATACA\b/.test(t))return {estr:"atacar"};
    if(/\bESCONDER\b|\bESCONDE\b/.test(t))return {estr:"esconder"};
    if(/\bCARDUME\b/.test(t)){const m=String(txt).match(/@([A-Za-z0-9._]+)/);return m?{estr:"cardume",amigo:norm(m[1])}:null}
    return null}
  // resumo de uma maré a partir dos eventos (o mesmo formato que o site mostra)
  function resumo(ev,fichas,n,temp,fimT,mares,vivos){
    const sp=nm=>fichas[nm]?fichas[nm].sp:null,nm=x=>fichas[x]?nomeDe(fichas[x]):"?";
    const VB={veneno:"envenenou",ferrao:"ferroou",revide:"derrubou",engoliu:"engoliu"};
    const killers={},lista=[],viradas=[],lendas=[],ving=[];let mortes=0,fugas=0,niveis=0;
    for(const e of ev){
      if(e.type==="morte"){mortes++;killers[e.a]=(killers[e.a]||0)+1;const verbo=VB[e.como]||"devorou";
        lista.push({a:e.a,b:e.b,as:nm(e.a),vs:nm(e.b),asp:sp(e.a),bsp:sp(e.b),verbo});
        if(e.como&&e.como!=="engoliu"&&viradas.length<4)viradas.push({a:e.a,asp:sp(e.a),as:nm(e.a),b:e.b,bsp:sp(e.b),bs:nm(e.b),verbo})}
      else if(e.type==="fuga")fugas++;
      else if(e.type==="nivel"){niveis++;if(e.lvl>=5)lendas.push({name:e.a,sp:sp(e.a),nome:LENDA[sp(e.a)]||nm(e.a)})}
      else if(e.type==="vinganca")ving.push({a:e.a,b:e.b,como:e.como})}
    const tp=Object.entries(killers).sort((a,b)=>b[1]-a[1])[0];
    return {n,mortes,fugas,niveis,vivos,fimT,meu:null,top:tp?{name:tp[0],sp:sp(tp[0]),nome:nm(tp[0]),k:tp[1]}:null,
      viradas,lendas,ving,lista,temp:{n:temp.n,k:temp.k,max:mares},hora:21,meuNome:null}}
  // ranking de fim de temporada
  function hall(nTemp,mares,vivos,mortos){
    const info=(b,vivo)=>({name:b.name,sp:b.sp,nome:nomeDe(b),lvl:b.lvl,kills:b.kills.length,survived:b.survived,vivo});
    const sobrev=vivos.slice().sort((a,b)=>b.lvl-a.lvl||b.survived-a.survived||b.kills.length-a.kills.length).slice(0,5).map(b=>info(b,true));
    const cacad=[...vivos.map(b=>info(b,true)),...mortos.map(b=>info(b,false))].filter(x=>x.kills).sort((a,b)=>b.kills-a.kills||b.lvl-a.lvl).slice(0,5);
    const lendas=vivos.filter(b=>b.lvl>=5).slice(0,5).map(b=>info(b,true));
    const ving=[...vivos,...mortos].filter(b=>b.vingou).slice(0,5).map(b=>({a:b.name,b:b.vingou.name,como:b.vingou.como}));
    return {n:nTemp,mares,sobrev,cacad,lendas,ving,mortos:mortos.length,vivos:vivos.length}}
  return {SPECIES,LENDA,hash,rng,norm,especie,sorteio,comandosDoTexto,nomeSp,nomeDe,estrategiaDoTexto,resumo,hall};
})();
if(typeof module!=="undefined")module.exports=REGRAS;
