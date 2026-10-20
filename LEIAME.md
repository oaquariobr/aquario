# Aquário do Brasil

Cada @ que comenta no Instagram [@oaquariobr](https://www.instagram.com/oaquariobr/) vira um bicho num aquário 3D. Todo dia às 21h (Brasília) acontece a maré: os bichos caçam uns aos outros.

## Como funciona

| Peça | Arquivo | Onde roda |
| --- | --- | --- |
| Site 3D | `public/index.html`, `public/models.js` | Cloudflare (arquivos estáticos do Worker) |
| Robô dos comentários | `worker.js` | Cloudflare Worker, a cada 1 minuto |
| Maré oficial | `robo.mjs` + `.github/workflows/mare.yml` | GitHub Actions, às 20h05 (espera até 20h58) |
| Motor da batalha | `mare.js` | usado pelo robô da maré e pelo site |
| Regras compartilhadas | `regras.js` | espécie pelo @, estratégias, resumo, Hall da Fama |

## Configuração

- Cloudflare Worker `aquario-api`: ligações `DB` (D1 `aquario`) e `KV` (KV `aquario`), segredos `IG_TOKEN` e `ADMIN_KEY`. O `wrangler.toml` já tem os IDs.
- GitHub: variável `AQUA_API` (endereço do Worker) e segredo `ADMIN_KEY` (o mesmo do Worker).
- Para testar uma maré na hora: Actions → Maré diária → Run workflow → forcar = 1.

Modelos 3D: licença CC BY 4.0, créditos no menu do site.
