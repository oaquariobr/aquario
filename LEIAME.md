# Aquário do Brasil

Cada @ que comenta no Instagram [@oaquariobr](https://www.instagram.com/oaquariobr/) vira um bicho num aquário 3D. Todo dia às 21h (Brasília) acontece a maré: os bichos caçam uns aos outros.

## Como funciona

| Peça | Arquivo | Onde roda |
| --- | --- | --- |
| Site 3D | `public/index.html`, `public/models.js` | Cloudflare (arquivos estáticos do Worker) |
| Robô dos comentários | `worker.js` | Cloudflare Worker, a cada 1 minuto |
| Maré oficial | `robo.mjs` + `.github/workflows/mare.yml` | GitHub Actions, às 20h05 (espera até 20h58); reservas às 20h35 e 21h10 |
| Motor da batalha | `mare.js` | usado pelo robô da maré e pelo site |
| Regras compartilhadas | `regras.js` | espécie pelo @, estratégias, resumo, Hall da Fama |

## Configuração

- Cloudflare Worker `aquario-api`: ligações `DB` (D1 `aquario`) e `KV` (KV `aquario`), segredos `IG_TOKEN` e `ADMIN_KEY`. O `wrangler.toml` já tem os IDs.
- GitHub: variável `AQUA_API` (endereço do Worker) e segredo `ADMIN_KEY` (o mesmo do Worker).
- Para testar uma maré na hora: Actions → Maré diária → Run workflow → forcar = 1.

## Detalhes importantes

- Os modelos 3D em `models.js` são comprimidos com meshopt; o site carrega o `meshopt_decoder.js` para abri-los.
- Comentários do próprio @oaquariobr são ignorados. O robô descobre sozinho se o Instagram entrega os comentários do mais novo para o mais antigo ou ao contrário.
- O elenco da maré é fechado por volta das 20h58. Quem comentar depois aparece no site na hora e luta na maré seguinte.
- Se o GitHub atrasar, a maré do dia ainda acontece até as 23h, começando 1 minuto depois de o robô rodar.

## Limites do plano grátis

- Worker: 100 mil pedidos por dia. Cada visita gasta cerca de 3 pedidos ao abrir e mais 1 por minuto com o site aberto, ou seja, aguenta umas 15 a 25 mil visitas por dia. Se passar disso, o plano pago do Workers (US$ 5 por mês) libera 10 milhões de pedidos.
- Tela: cerca de 29 mil bichos aparecem ao mesmo tempo. Acima disso o @ continua no jogo, mas não é desenhado.
- Respostas dentro de comentários não contam; vale só comentário direto no post.

Modelos 3D: licença CC BY 4.0, créditos no menu do site.
