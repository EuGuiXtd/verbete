#!/bin/bash
# Passo 4/5 -- instalar o vhost do Verbete e recarregar o nginx.
#
#   bash deploy/vps/04-nginx.sh
#
# Este e o passo perigoso da tarefa. O nginx desta VPS serve qyro, amgseg,
# nossario e rpg, todos em producao; uma configuracao invalida derruba os
# quatro junto. As travas aqui, em ordem:
#
#   1. `nginx -t` ANTES de qualquer reload.
#   2. Se o teste falhar, o symlink do verbete e removido e o teste refeito,
#      para a configuracao voltar a ser valida na hora -- e nao so quando
#      alguem recarregar o nginx horas depois (o deploy hook do certbot, por
#      exemplo, recarrega sozinho numa renovacao).
#   3. `systemctl reload nginx`, NUNCA restart.
#   4. Depois do reload, os quatro vizinhos sao consultados em 127.0.0.1 antes
#      de o script dizer que deu certo.
#
# Idempotente: reinstala o arquivo e refaz o symlink toda vez.
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
VHOST="${RAIZ}/deploy/nginx/verbete"

[ -r "${VHOST}" ] || { echo "nao achei ${VHOST}" >&2; exit 1; }

echo ">>> enviando o vhost"
ssh -i "${KEY}" -o BatchMode=yes "${VPS}" 'rm -rf /tmp/verbete-nginx && mkdir -p /tmp/verbete-nginx'
scp -q -i "${KEY}" "${VHOST}" "${VPS}:/tmp/verbete-nginx/verbete"

echo ">>> instalando e testando"
ssh -i "${KEY}" -o BatchMode=yes "${VPS}" 'sudo bash -s' <<'REMOTE'
set -euo pipefail
NOVO=/tmp/verbete-nginx/verbete
ALVO=/etc/nginx/sites-available/verbete
LINK=/etc/nginx/sites-enabled/verbete

# O certificado tem de existir antes: sem ele o nginx nao sobe o listener TLS
# e o `nginx -t` falha -- o que aqui significaria reload nenhum, mas melhor
# dizer o motivo certo.
if [ ! -e /etc/letsencrypt/live/devduraes.com.br/fullchain.pem ]; then
  echo "falta o certificado de devduraes.com.br; rode o 02-certificate.sh antes" >&2
  exit 1
fi
if ! openssl x509 -in /etc/letsencrypt/live/devduraes.com.br/fullchain.pem -noout -text \
     | grep -q 'DNS:\*\.devduraes\.com\.br'; then
  echo "o certificado nao cobre *.devduraes.com.br; rode o 02-certificate.sh antes" >&2
  exit 1
fi

# A raiz tem de existir ANTES do reload. Sem esta checagem, rodar o 04 antes do
# 03 so apareceria como 404 depois de o nginx ja ter sido recarregado.
if [ ! -d /srv/verbete/app ]; then
  echo "/srv/verbete/app nao existe; rode o 03-layout.sh antes" >&2
  exit 1
fi

# Backup so quando o conteudo muda de verdade. Fica em sites-available, que o
# nginx.conf NAO inclui (o include e `sites-enabled/*`), entao um .bak aqui e
# inerte.
if [ -e "$ALVO" ] && ! cmp -s "$NOVO" "$ALVO"; then
  cp -a "$ALVO" "$ALVO.bak-$(date +%F-%H%M%S)"
  echo "    guardei a versao anterior em $ALVO.bak-*"
fi

install -m 644 -o root -g root "$NOVO" "$ALVO"
ln -sfn "$ALVO" "$LINK"
rm -rf /tmp/verbete-nginx

echo "--- nginx -t ---"
if ! nginx -t; then
  echo >&2
  echo "TESTE FALHOU. Removendo o symlink do verbete e refazendo o teste," >&2
  echo "para a configuracao da maquina voltar a ser valida agora mesmo." >&2
  rm -f "$LINK"
  nginx -t
  echo "Configuracao valida de novo, SEM o verbete. Nada foi recarregado." >&2
  exit 1
fi

echo "--- systemctl reload nginx (reload, nunca restart) ---"
systemctl reload nginx
sleep 2
systemctl is-active nginx

echo
echo "--- os quatro vizinhos, direto em 127.0.0.1 (sem passar pela Cloudflare) ---"
falhou=0
for d in qyrofinance.com.br amgseg.com.br nossario.com.br devduraes.com.br; do
  cod=$(curl -sk --resolve "$d:443:127.0.0.1" -o /dev/null -w '%{http_code}' "https://$d/" || echo 000)
  printf '  %-22s %s\n' "$d" "$cod"
  case "$cod" in 2*|3*|503) ;; *) falhou=1 ;; esac
done

echo
echo "--- verbete, direto em 127.0.0.1 ---"
cod=$(curl -sk --resolve "verbete.devduraes.com.br:443:127.0.0.1" -o /dev/null \
      -w '%{http_code}' "https://verbete.devduraes.com.br/" || echo 000)
echo "  verbete.devduraes.com.br $cod"
case "$cod" in 2*) ;; *) falhou=1 ;; esac

[ "$falhou" -eq 0 ] || { echo "ALGO NAO RESPONDEU COMO ESPERADO -- veja acima" >&2; exit 1; }
echo
echo "todos responderam"
REMOTE

echo
echo "Proximo passo: bash deploy/vps/05-deploy-key.sh"
