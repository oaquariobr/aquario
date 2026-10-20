// Aquário do Brasil · robô dos comentários (Cloudflare Worker)
// - a cada minuto lê os comentários novos do Instagram e coloca os @ no aquário
// - guarda as estratégias (ATACAR, ESCONDER, CARDUME @amigo) para a próxima maré
// - entrega o estado do aquário para o site
// Ligações (bindings): DB = banco D1, KV = namespace KV. Segredos: IG_TOKEN, ADMIN_KEY.

const IG_PADRAO = "https://graph.instagram.com/v21.0";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" };
const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...h } });
const norm = n => "@" + String(n).trim().replace(/^@+/, "").toLowerCase();

function estrategiaDoTexto(txt) {
  const t = String(txt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/\bATACAR\b|\bATACA\b/.test(t)) return { estr: "atacar" };
  if (/\bESCONDER\b|\bESCONDE\b/.test(t)) return { estr: "esconder" };
  if (/\bCARDUME\b/.test(t)) { const m = String(txt).match(/@([A-Za-z0-9._]+)/); return m ? { estr: "cardume", amigo: norm(m[1]) } : null }
  return null;
}

let pronto = false;
async function schema(env) {
  if (pronto) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS entradas (name TEXT, temp INTEGER, ts INTEGER, PRIMARY KEY(name,temp))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS entradas_ts ON entradas(temp, ts)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS vistos (id TEXT PRIMARY KEY)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS estrategias (name TEXT, mare INTEGER, estr TEXT, amigo TEXT, ts INTEGER, PRIMARY KEY(name,mare))"),
  ]);
  pronto = true;
}
async function getMeta(env, k, def = null) { const r = await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(k).first(); return r ? r.v : def }
async function setMeta(env, obj) { await env.DB.batch(Object.entries(obj).map(([k, v]) => v === null ? env.DB.prepare("DELETE FROM meta WHERE k=?").bind(k) : env.DB.prepare("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, String(v)))) }

// ---------- leitura dos comentários ----------
async function igGet(env, url) {
  const base = env.IG_BASE || IG_PADRAO, tk = (await getMeta(env, "ig_token")) || env.IG_TOKEN;
  const u = new URL(url.startsWith("http") ? url : base + url); if (!u.searchParams.get("access_token")) u.searchParams.set("access_token", tk);
  const r = await fetch(u.toString()); const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = new Error((j.error && j.error.message) || ("HTTP " + r.status)); e.code = j.error && j.error.code; throw e }
  return j;
}
async function lerPost(env, mediaId, temp, ini, mare, maxPag) {
  let url = `/${mediaId}/comments?fields=id,text,username,timestamp&limit=50`, novos = 0;
  for (let p = 0; p < maxPag && url; p++) {
    const j = await igGet(env, url), cs = (j.data || []).filter(c => c.username);
    if (!cs.length) break;
    const vistos = new Set((await env.DB.prepare(`SELECT id FROM vistos WHERE id IN (${cs.map(() => "?").join(",")})`).bind(...cs.map(c => c.id)).all()).results.map(r => r.id));
    const ops = [];
    for (const c of cs) {
      if (vistos.has(c.id)) continue;
      ops.push(env.DB.prepare("INSERT OR IGNORE INTO vistos(id) VALUES(?)").bind(c.id));
      const ts = Date.parse(c.timestamp) || Date.now(), n = norm(c.username);
      if (ts < ini) continue; // comentário de antes desta temporada
      ops.push(env.DB.prepare("INSERT OR IGNORE INTO entradas(name,temp,ts) VALUES(?,?,?)").bind(n, temp, Date.now()));
      const e = estrategiaDoTexto(c.text);
      if (e) ops.push(env.DB.prepare("INSERT INTO estrategias(name,mare,estr,amigo,ts) VALUES(?,?,?,?,?) ON CONFLICT(name,mare) DO UPDATE SET estr=excluded.estr,amigo=excluded.amigo,ts=excluded.ts WHERE excluded.ts>=estrategias.ts").bind(n, mare, e.estr, e.amigo || null, ts));
      novos++;
    }
    if (ops.length) await env.DB.batch(ops);
    const asc = cs.length > 1 && Date.parse(cs[0].timestamp) < Date.parse(cs[cs.length - 1].timestamp);
    // na ordem do mais novo para o mais antigo dá para parar quando uma página inteira já foi vista
    if (!asc && vistos.size === cs.length) break;
    url = j.paging && j.paging.next || null;
  }
  return novos;
}
async function lerComentarios(env, rapido) {
  const agora = Date.now(), pausa = +(await getMeta(env, "pausa_ate", 0));
  if (agora < pausa) return { pausado: true };
  const temp = +(await getMeta(env, "temp", 1)), ini = +(await getMeta(env, "temp_inicio_ts", 0)), mare = +(await getMeta(env, "mareN", 0)) + 1;
  try {
    // a lista de posts é atualizada a cada 15 minutos
    let posts = JSON.parse(await getMeta(env, "posts", "[]")), pAt = +(await getMeta(env, "posts_ts", 0));
    if (!posts.length || agora - pAt > 15 * 60e3) {
      const j = await igGet(env, "/me/media?fields=id,timestamp&limit=6");
      posts = (j.data || []).map(m => m.id); await setMeta(env, { posts: JSON.stringify(posts), posts_ts: agora });
    }
    const min = Math.floor(agora / 60e3); let novos = 0;
    for (let i = 0; i < posts.length; i++) {
      // o post mais novo é lido sempre; os outros, a cada 5 minutos
      if (i > 0 && (rapido || min % 5 !== i % 5)) continue;
      novos += await lerPost(env, posts[i], temp, ini, mare, rapido ? 2 : 4);
    }
    await setMeta(env, { ultima_leitura: agora });
    return { novos };
  } catch (e) {
    // limite de uso do Instagram: espera 10 minutos antes de tentar de novo
    if ([4, 17, 32, 613].includes(e.code)) await setMeta(env, { pausa_ate: agora + 10 * 60e3 });
    await setMeta(env, { ultimo_erro: new Date().toISOString() + " " + e.message });
    return { erro: e.message };
  }
}
// a chave do Instagram vale 60 dias: renova a cada 20
async function renovarToken(env) {
  const at = +(await getMeta(env, "token_renovado", 0));
  if (Date.now() - at < 20 * 864e5) return;
  try {
    const j = await igGet(env, (env.IG_BASE ? env.IG_BASE.replace(/\/v[\d.]+$/, "") : "https://graph.instagram.com") + "/refresh_access_token?grant_type=ig_refresh_token");
    if (j.access_token) await setMeta(env, { ig_token: j.access_token, token_renovado: Date.now() });
  } catch (e) { await setMeta(env, { ultimo_erro: "renovar token: " + e.message }) }
}
// quando a maré termina, o estado novo (já calculado pelo robô da maré) passa a valer
async function promover(env) {
  const ps = +(await getMeta(env, "pend_start", 0)); if (!ps) return;
  const dur = +(await getMeta(env, "pend_dur", 70));
  if (Date.now() < ps + dur * 1000 + 15e3) return;
  const prox = await env.KV.get("proximo", "stream");
  if (prox) await env.KV.put("estado", prox);
  await setMeta(env, { pend_start: null, pend_dur: null });
}

// às 20h15 (Brasília) acorda o robô da maré no GitHub, que é mais pontual que o agendamento do próprio GitHub
async function dispararMare(env) {
  if (!env.GH_TOKEN || !env.GH_REPO) return;
  const br = new Date(Date.now() - 3 * 3600e3), dia = br.toISOString().slice(0, 10), min = br.getUTCHours() * 60 + br.getUTCMinutes();
  if (min < 20 * 60 + 15 || min > 20 * 60 + 50 || (await getMeta(env, "disparo_dia")) === dia) return;
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/mare.yml/dispatches`, {
    method: "POST", headers: { Authorization: "Bearer " + env.GH_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "aquario-do-brasil" },
    body: JSON.stringify({ ref: "main", inputs: { forcar: "0" } }) });
  await setMeta(env, r.ok ? { disparo_dia: dia } : { ultimo_erro: "disparo GitHub " + r.status });
}

async function rotina(env, rapido) { await schema(env); await promover(env); const r = await lerComentarios(env, rapido); if (!rapido) { await renovarToken(env); await dispararMare(env) } return r }

// ---------- rotas ----------
async function rotas(req, env, ctx) {
  const url = new URL(req.url), p = url.pathname.replace(/\/+$/, "") || "/";
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  await schema(env);
  if (p === "/estado") {
    await promover(env);
    const s = await env.KV.get("estado", "stream");
    if (!s) return json({ v: 1, temp: 1, mareN: 0, inicio: 0, MARES: 10, hora: 21, snap: 0, vivos: [], mortos: [], assassinos: {}, hall: [] }, 200, { "Cache-Control": "no-store" });
    return new Response(s, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=20", ...CORS } });
  }
  if (p === "/mare") { const s = await env.KV.get("mare", "stream"); return s ? new Response(s, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=5", ...CORS } }) : json({}) }
  if (p === "/novos") {
    const temp = +(await getMeta(env, "temp", 1)), desde = +(url.searchParams.get("desde") || 0);
    const r = await env.DB.prepare("SELECT name,ts FROM entradas WHERE temp=? AND ts>? ORDER BY ts LIMIT 5000").bind(temp, desde).all();
    return json({ temp, agora: Date.now(), novos: r.results.map(x => [x.name, x.ts]) }, 200, { "Cache-Control": "public, max-age=10" });
  }
  if (p === "/eu") {
    const n = norm(url.searchParams.get("n") || ""), temp = +(await getMeta(env, "temp", 1)), mare = +(await getMeta(env, "mareN", 0)) + 1;
    const e = await env.DB.prepare("SELECT ts FROM entradas WHERE name=? AND temp=?").bind(n, temp).first();
    const s = await env.DB.prepare("SELECT estr,amigo FROM estrategias WHERE name=? AND mare=?").bind(n, mare).first();
    return json({ name: n, entrou: !!e, estr: s ? s.estr : "auto", amigo: s ? s.amigo : null, mare });
  }
  if (p === "/ja-comentei" && req.method === "POST") {
    const body = await req.json().catch(() => ({})), n = norm(body.n || "");
    const temp = +(await getMeta(env, "temp", 1));
    let e = await env.DB.prepare("SELECT ts FROM entradas WHERE name=? AND temp=?").bind(n, temp).first();
    if (!e) {
      // no máximo uma leitura extra a cada 20 segundos, para não estourar o limite do Instagram
      const ult = +(await getMeta(env, "leitura_extra", 0));
      if (Date.now() - ult > 20e3) { await setMeta(env, { leitura_extra: Date.now() }); await lerComentarios(env, true); e = await env.DB.prepare("SELECT ts FROM entradas WHERE name=? AND temp=?").bind(n, temp).first() }
    }
    return json({ name: n, entrou: !!e, ts: e ? e.ts : null });
  }
  if (p.startsWith("/admin/")) {
    if (!env.ADMIN_KEY || req.headers.get("Authorization") !== "Bearer " + env.ADMIN_KEY) return json({ erro: "sem permissão" }, 401);
    if (p === "/admin/entradas") { const temp = +(url.searchParams.get("temp") || 1); const r = await env.DB.prepare("SELECT name,ts FROM entradas WHERE temp=? ORDER BY ts").bind(temp).all(); return json(r.results.map(x => [x.name, x.ts])) }
    if (p === "/admin/estrategias") { const m = +(url.searchParams.get("mare") || 0); const r = await env.DB.prepare("SELECT name,estr,amigo FROM estrategias WHERE mare=?").bind(m).all(); return json(r.results) }
    if (p.startsWith("/admin/kv/") && req.method === "PUT") { const k = p.slice(10); if (!["estado", "proximo", "mare"].includes(k)) return json({ erro: "chave" }, 400); await env.KV.put(k, req.body); return json({ ok: true }) }
    if (p === "/admin/meta" && req.method === "POST") { await setMeta(env, await req.json()); return json({ ok: true }) }
    if (p === "/admin/meta") { const r = await env.DB.prepare("SELECT k,v FROM meta WHERE k NOT IN ('ig_token')").all(); return json(Object.fromEntries(r.results.map(x => [x.k, x.v]))) }
    if (p === "/admin/ler") return json(await rotina(env, false));
  }
  if (p === "/") return json({ ok: true, nome: "Aquário do Brasil" });
  return json({ erro: "não encontrado" }, 404);
}

export default {
  async fetch(req, env, ctx) { try { return await rotas(req, env, ctx) } catch (e) { return json({ erro: e.message }, 500) } },
  async scheduled(ev, env, ctx) { ctx.waitUntil(rotina(env, false)) },
};
