// Aquário do Brasil · maré oficial
// Roda no GitHub Actions perto das 21h (Brasília): junta os bichos e as estratégias, calcula a maré
// com o mesmo motor do site e publica o resultado no Worker. O site toca a batalha às 21h em ponto.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const MARE = require("./mare.js");
const REGRAS = require("./regras.js");

const API = (process.env.AQUA_API || "").replace(/\/+$/, ""), KEY = process.env.ADMIN_KEY, FORCAR = process.env.FORCAR === "1";
if (!API || !KEY) { console.error("Faltam AQUA_API e ADMIN_KEY"); process.exit(1) }
const H = { Authorization: "Bearer " + KEY };
const get = async p => { const r = await fetch(API + p + (p.includes("?") ? "&" : "?") + "t=" + Date.now(), { headers: H }); if (!r.ok) throw new Error(p + " " + r.status); return r.json() };
const put = async (p, body) => { const r = await fetch(API + p, { method: "PUT", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(p + " " + r.status) };
const post = async (p, body) => { const r = await fetch(API + p, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(p + " " + r.status) };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// horários em Brasília (UTC-3, sem horário de verão)
const diaBR = t => new Date(t - 3 * 3600e3).toISOString().slice(0, 10);
function hoje21h(t) { const d = new Date(t - 3 * 3600e3); d.setUTCHours(21, 0, 0, 0); return d.getTime() + 3 * 3600e3 }

const meta = await get("/admin/meta");
const hoje = diaBR(Date.now());
if (!FORCAR && meta.ultima_mare_dia === hoje) { console.log("A maré de hoje já foi calculada."); process.exit(0) }

let inicio;
if (FORCAR) inicio = Date.now() + (+process.env.INICIO_EM || 60) * 1000;
else {
  inicio = hoje21h(Date.now());
  const falta = inicio - Date.now();
  // o GitHub às vezes atrasa: até 2h depois das 21h a maré do dia ainda acontece, 1 minuto depois do robô rodar
  if (falta > 3 * 3600e3 || falta < -2 * 3600e3) { console.log("Fora do horário da maré."); process.exit(0) }
  // espera até 2 minutos antes das 21h, para pegar as estratégias de última hora
  const alvo = inicio - 120e3;
  while (Date.now() < alvo) await sleep(Math.min(60e3, alvo - Date.now()));
  if (Date.now() > inicio - 20e3) inicio = Date.now() + 60e3; // atrasou: começa em 1 minuto
}

const foto = Date.now(); // momento em que o elenco é fechado
const ultimaEntrada = (await get("/admin/ultima-entrada")).id;
const estado = await get("/estado");
const temp = estado.temp || 1, MARES = 14, mareN = (estado.mareN || 0) + 1, PE = MARE.PEROLAS;
// entradas em páginas de 5000 (só até a foto: quem comentar depois entra na próxima maré)
const entradas = [];
for (let desde = 0; ;) { const pg = await get(`/admin/entradas?temp=${temp}&desde=${desde}`); for (const x of pg) if (x[2] <= ultimaEntrada) entradas.push(x); if (pg.length < 5000) break; desde = pg[pg.length - 1][2] }
const estr = await get("/admin/estrategias?mare=" + mareN);
// quem comentou para esta maré (sequência de dias e renascer) e os comandos de pérolas
const ativos = new Set();
for (let depois = ""; ;) { const pg = await get(`/admin/ativos?mare=${mareN}&depois=${encodeURIComponent(depois)}`); for (const n of pg) ativos.add(n); if (pg.length < 5000) break; depois = pg[pg.length - 1] }
const acoes = {}; for (const a of await get("/admin/acoes?mare=" + mareN)) (acoes[a.name] ??= new Set()).add(a.acao);
const carteira = estado.carteira || {}; // @ -> { p: pérolas, s: dias seguidos comentando, g: ganho na última maré, m: número dessa maré, r: maré da última roleta }
const cart = n => carteira[n] ??= { p: 0, s: 0 };

// elenco: quem já estava vivo + quem comentou e ainda não entrou
let mortosL = estado.mortos || [];
const mortosSet = new Set(mortosL.map(m => m.b.name)), roster = {}, pre = []; // pre = o que acontece antes da maré (renascer, roleta, cura)
for (const b of estado.vivos || []) roster[b.name] = b;
for (const [n] of entradas) if (!roster[n] && !mortosSet.has(n)) {
  const b = MARE.novo(n, REGRAS.especie(n, temp)); b.bornAt = mareN - 1;
  if (estado.assassinos && estado.assassinos[n]) b.rival = estado.assassinos[n];
  roster[n] = b;
}
// renascer: quem morreu numa maré anterior e comentou de novo volta como um bicho novo sorteado; quem o matou vira rival
mortosL = mortosL.filter(m => {
  const n = m.b.name; if (!ativos.has(n) || roster[n]) return true;
  const b = MARE.novo(n, REGRAS.sorteio(n + "#renasce" + mareN)); b.bornAt = mareN - 1; b.rival = m.b.killedBy ? m.b.killedBy.name : null;
  roster[n] = b; pre.push({ tipo: "renasce", name: n, sp: b.sp, rival: b.rival }); return false;
});
// gastos de pérolas (só quem está vivo e comentou o comando para esta maré)
for (const [n, set] of Object.entries(acoes)) {
  const b = roster[n]; if (!b || !b.alive) continue; const c = cart(n);
  if (set.has("roleta") && c.p >= PE.roleta && c.r !== mareN) {
    const sp = REGRAS.sorteio(n + "#roleta" + mareN); c.p -= PE.roleta; c.r = mareN;
    roster[n] = MARE.trocaEspecie(b, sp); pre.push({ tipo: "roleta", name: n, de: b.sp, para: sp });
  } else if (set.has("curar") && c.p >= PE.curar && b.hp < MARE.maxHp(b)) {
    c.p -= PE.curar; const ganhou = MARE.cura(b); pre.push({ tipo: "cura", name: n, hp: b.hp, max: MARE.maxHp(b), ganhou });
  }
}
for (const s of estr) if (roster[s.name] && roster[s.name].alive) { roster[s.name].estr = s.estr; roster[s.name].amigo = s.amigo || null }
const ordenado = {}; for (const n of Object.keys(roster).sort()) ordenado[n] = roster[n];
const vivosAntes = Object.keys(ordenado).filter(n => ordenado[n].alive);

const ev = MARE.rodar(ordenado, mareN, 70);
const como = {}; for (const e of ev) if (e.type === "morte") como[e.b] = e.como || null;
const vivos = Object.values(ordenado).filter(b => b.alive);
const novosMortos = Object.values(ordenado).filter(b => !b.alive && b.diedAt === mareN).map(b => ({ b, como: como[b.name] || null }));
const mortos = mortosL.concat(novosMortos);
const k = mareN - (estado.inicio || 0), fimT = k >= MARES;
const R = REGRAS.resumo(ev, ordenado, mareN, { n: temp, k }, fimT, MARES, vivos.length);
R.pre = pre.map(x => ({ tipo: x.tipo, name: x.name, de: x.de, para: x.para, sp: x.sp }));

// pérolas: quem sobreviveu ganha; a sequência de dias conta para todo mundo que comentou
const G = MARE.ganhos(ev, ordenado, vivosAntes);
for (const n of new Set([...Object.keys(carteira), ...ativos])) { const c = cart(n); c.s = ativos.has(n) ? (c.s || 0) + 1 : 0 }
for (const [n, g] of Object.entries(G)) { const c = cart(n), bonus = MARE.bonusSeq(c.s || 0), tot = g.sob + g.fug + g.ab + bonus; c.p += tot; c.g = tot; c.m = mareN; c.d = { ...g, seq: bonus } }
// carteira enxuta: tira quem não tem nada guardado nem sequência
for (const n of Object.keys(carteira)) { const c = carteira[n]; if (!c.p && !c.s && c.m !== mareN) delete carteira[n] }

let proximo = { v: 1, temp, mareN, inicio: estado.inicio || 0, MARES, hora: 21, snap: inicio, snapRow: ultimaEntrada, vivos, mortos, assassinos: estado.assassinos || {}, hall: estado.hall || [], carteira };
let metaNova = { pend_start: inicio, pend_dur: 70, mareN, ultima_mare_dia: hoje }, hallNovo = null;
if (fimT) {
  hallNovo = REGRAS.hall(temp, k, vivos, mortos.map(m => m.b));
  const assassinos = {}; for (const m of mortos) if (m.b.killedBy) assassinos[m.b.name] = m.b.killedBy.name;
  // na temporada nova cada um guarda no máximo 15 pérolas
  for (const c of Object.values(carteira)) { c.p = Math.min(c.p, PE.guardar); delete c.r }
  proximo = { v: 1, temp: temp + 1, mareN, inicio: mareN, MARES, hora: 21, snap: inicio, snapRow: ultimaEntrada, vivos: [], mortos: [], assassinos, hall: [hallNovo, ...(estado.hall || [])].slice(0, 10), carteira };
  metaNova = { ...metaNova, temp: temp + 1, temp_inicio_ts: foto };
}
await put("/admin/kv/mare", { n: mareN, start: inicio, dur: 70, temp, events: ev, R, hall: hallNovo, pre });
await put("/admin/kv/proximo", proximo);
await post("/admin/meta", metaNova);
console.log(`Maré #${mareN} pronta: ${Object.keys(ordenado).length} bichos, ${R.mortes} mortes, ${pre.length} ações de pérolas/renascer, começa ${new Date(inicio).toISOString()}${fimT ? " · fim da temporada " + temp : ""}`);
