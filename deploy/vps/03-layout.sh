#!/bin/bash
# Passo 3/5 -- criar /srv/verbete e instalar o wrapper da chave de deploy.
#
#   bash deploy/vps/03-layout.sh
#
# Idempotente: pode rodar quantas vezes quiser. Reinstala o wrapper toda vez
# (e assim que se atualiza o wrapper depois de mexer nele aqui no repositorio).
#
# Layout, copiado do /srv/rpg desta mesma VPS:
#
#   /srv/verbete        root:root 755   -- so o root cria ou renomeia coisas aqui
#   /srv/verbete/app    qyro:qyro 755   -- o que o nginx serve; unico alvo do rsync
#   /srv/verbete/bin    root:root 755   -- scripts que o qyro executa e nao reescreve
#
# O dono importa: se /srv/verbete fosse do qyro, um deploy conseguiria trocar
# `app` por um link simbolico e fugir do diretorio. Sendo do root, nao consegue.
set -euo pipefail

# O endereco da origem NAO mora neste repositorio. O DNS deste host passa pela
# Cloudflare (nuvem laranja) e o proposito da nuvem laranja e justamente esconder
# o IP de origem -- ver 01-dns.sh. Defina antes de rodar, fora do git:
#
#   export VPS=usuario@ip-da-origem      # ou um Host apelidado em ~/.ssh/config
#   export VPS_KEY=~/.ssh/sua_chave      # opcional; o padrao esta abaixo
VPS="${VPS:?defina VPS=usuario@host antes de rodar (veja deploy/vps/README.md)}"
KEY="${VPS_KEY:-$HOME/.ssh/qyro_vps}"
RAIZ=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
WRAPPER="${RAIZ}/deploy/vps/deploy-wrapper.sh"

[ -r "${WRAPPER}" ] || { echo "nao achei ${WRAPPER}" >&2; exit 1; }
bash -n "${WRAPPER}" || { echo "o wrapper nao passa no bash -n; nao vou instalar" >&2; exit 1; }

echo ">>> rodando os testes do wrapper antes de subir"
bash "${RAIZ}/deploy/vps/test-deploy-wrapper.sh" >/dev/null || {
  echo "os testes do wrapper falharam; nao vou instalar. Rode:" >&2
  echo "  bash deploy/vps/test-deploy-wrapper.sh" >&2
  exit 1
}
echo "    passaram"

SOMA_LOCAL=$(shasum -a 256 "${WRAPPER}" | cut -d' ' -f1)

echo ">>> enviando o wrapper"
ssh -i "${KEY}" -o BatchMode=yes "${VPS}" 'rm -rf /tmp/verbete-provision && mkdir -p /tmp/verbete-provision'
scp -q -i "${KEY}" "${WRAPPER}" "${VPS}:/tmp/verbete-provision/deploy-wrapper.sh"

echo ">>> montando o layout"
ssh -i "${KEY}" -o BatchMode=yes "${VPS}" "sudo env SOMA_LOCAL='${SOMA_LOCAL}' bash -s" <<'REMOTE'
set -euo pipefail
S=/tmp/verbete-provision

install -d -m 755 -o root -g root /srv/verbete /srv/verbete/bin
install -d -m 755 -o qyro -g qyro /srv/verbete/app

install -m 755 -o root -g root "$S/deploy-wrapper.sh" /srv/verbete/bin/deploy-wrapper.sh

SOMA_REMOTA=$(sha256sum /srv/verbete/bin/deploy-wrapper.sh | cut -d' ' -f1)
if [ "$SOMA_REMOTA" != "$SOMA_LOCAL" ]; then
  echo "o wrapper instalado nao bate com o do repositorio" >&2
  exit 1
fi
echo "    wrapper conferido: $SOMA_REMOTA"

# Pagina temporaria, so para o site responder 200 antes do primeiro deploy de
# verdade. O primeiro `rsync --delete` a apaga sozinho.
if [ ! -e /srv/verbete/app/index.html ]; then
  cat > /srv/verbete/app/index.html <<'HTML'
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verbete</title>
<style>html{background:#e9e4da;color:#1a1815;font:16px/1.6 system-ui,sans-serif}
body{margin:0;display:grid;place-items:center;min-height:100vh;text-align:center;padding:1rem}</style>
</head><body><main><h1>Verbete</h1><p>Em breve.</p></main></body></html>
HTML
  chown qyro:qyro /srv/verbete/app/index.html
  chmod 644 /srv/verbete/app/index.html
  echo "    index.html provisorio criado"
else
  echo "    ja existe um index.html; nao mexi"
fi

rm -rf "$S"

echo
echo "--- como ficou ---"
ls -la /srv/verbete /srv/verbete/bin /srv/verbete/app
REMOTE

echo
echo "Proximo passo: bash deploy/vps/04-nginx.sh"
