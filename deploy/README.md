# deploy/

Artefatos de implantação do Verbete. Nada aqui entra no build.

- **`nginx/verbete`** — vhost de `verbete.devduraes.com.br`. Instalado em
  `/etc/nginx/sites-available/verbete` na VPS pelo `vps/04-nginx.sh`.
- **`vps/`** — os scripts de provisionamento, na ordem 01→05, mais a
  verificação e o wrapper da chave de deploy.

**Comece pelo runbook: [`vps/README.md`](vps/README.md).** Ele explica a ordem,
o que cada passo espera encontrar, como saber que deu certo e como desfazer.

Os scripts são rodados por você, à mão, um de cada vez. São idempotentes.
