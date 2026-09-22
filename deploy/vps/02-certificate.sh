#!/bin/bash
# Passo 2/5 -- ampliar o certificado devduraes.com.br para cobrir o wildcard.
#
#   bash deploy/vps/02-certificate.sh              # vale
#   bash deploy/vps/02-certificate.sh --ensaio     # staging do Let's Encrypt
#   bash deploy/vps/02-certificate.sh --conferir   # so olha, nao muda nada
#
# A linhagem `devduraes.com.br` hoje cobre so o apex e o www. Este script a
# reemite incluindo *.devduraes.com.br, na MESMA linhagem (--cert-name), para
# que os caminhos em /etc/letsencrypt/live/devduraes.com.br/ continuem valendo
# e o vhost do rpg -- que ja serve devduraes.com.br em producao -- nao precise
# ser tocado.
#
# ATENCAO: isto substitui o certificado de um site que ja esta no ar. Ensaie
# com --ensaio antes (o staging nao mexe em nada em /etc/letsencrypt/live).
#
# Wildcard so sai por DNS-01, por isso o plugin dns-cloudflare e as credenciais
# em /root/.secrets/cloudflare-devduraes.ini (ja existem na VPS).
set -euo pipefail

# O endereco da origem NAO mora neste repositorio. O DNS deste host passa pela
# Cloudflare (nuvem laranja) e o proposito da nuvem laranja e justamente esconder
# o IP de origem -- ver 01-dns.sh. Defina antes de rodar, fora do git:
#
#   export VPS=usuario@ip-da-origem      # ou um Host apelidado em ~/.ssh/config
#   export VPS_KEY=~/.ssh/sua_chave      # opcional; o padrao esta abaixo
VPS="${VPS:?defina VPS=usuario@host antes de rodar (veja deploy/vps/README.md)}"
KEY="${VPS_KEY:-$HOME/.ssh/qyro_vps}"
LINHAGEM=devduraes.com.br

MODO=valer
case "${1-}" in
  --ensaio)   MODO=ensaio ;;
  --conferir) MODO=conferir ;;
  "")         ;;
  *) echo "uso: $0 [--ensaio|--conferir]" >&2; exit 2 ;;
esac

echo ">>> estado atual do certificado"
ssh -i "${KEY}" -o BatchMode=yes "${VPS}" \
  "sudo certbot certificates --cert-name ${LINHAGEM}" || true

echo
echo ">>> ${LINHAGEM} ja cobre o wildcard?"
if ssh -i "${KEY}" -o BatchMode=yes "${VPS}" \
     "sudo certbot certificates --cert-name ${LINHAGEM} 2>/dev/null | grep -q '\*\.${LINHAGEM}'"; then
  JA_TEM=sim
else
  JA_TEM=nao
fi
echo "    ${JA_TEM}"

if [ "${MODO}" = "conferir" ]; then
  if [ "${JA_TEM}" = "sim" ]; then
    echo "    (--conferir: o wildcard ja esta na linhagem; nada a fazer)"
    exit 0
  fi
  # Sair 1 aqui NAO e um erro: e o estado normal antes de provisionar. O codigo
  # de saida existe para dar para encadear (`... --conferir || ...`).
  echo "    (--conferir: ainda falta o wildcard -- e o esperado antes do passo 2."
  echo "     Nada foi alterado. Rode sem --conferir para emitir.)"
  exit 1
fi

if [ "${JA_TEM}" = "sim" ] && [ "${MODO}" = "valer" ]; then
  echo "    nada a fazer"
else
  EXTRA=""
  [ "${MODO}" = "ensaio" ] && EXTRA="--dry-run"
  echo
  echo ">>> rodando o certbot ${EXTRA:+(${EXTRA})}"
  # --non-interactive + --expand: sem eles o certbot para para perguntar se
  # pode ampliar a linhagem, e por ssh sem tty isso e um erro, nao um prompt.
  # --key-type ecdsa mantem o tipo de chave que a linhagem ja usa.
  ssh -i "${KEY}" -o BatchMode=yes "${VPS}" "sudo certbot certonly \
    --non-interactive --agree-tos --expand ${EXTRA} \
    --dns-cloudflare \
    --dns-cloudflare-credentials /root/.secrets/cloudflare-devduraes.ini \
    --dns-cloudflare-propagation-seconds 30 \
    --key-type ecdsa --cert-name ${LINHAGEM} \
    -d ${LINHAGEM} -d www.${LINHAGEM} -d '*.${LINHAGEM}'"
fi

echo
echo ">>> deploy hook do certbot"
# Um arquivo so cobre TODOS os certificados da maquina: o certbot roda os
# renewal-hooks/deploy/* uma vez por renovacao bem-sucedida, seja qual for a
# linhagem. Ele ja existe aqui desde 10/ago/2026; este passo so confirma.
ssh -i "${KEY}" -o BatchMode=yes "${VPS}" '
  H=/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
  if sudo test -x "$H"; then
    echo "    ok: $H existe e e executavel"
    sudo ls -la "$H"
  else
    echo "    FALTA: $H nao existe ou nao e executavel" >&2
    exit 1
  fi'

if [ "${MODO}" = "valer" ]; then
  echo
  echo ">>> testando o deploy hook de verdade"
  # `certbot renew --dry-run` NAO executa deploy hooks (a documentacao do
  # certbot diz isso explicitamente), entao a unica forma de saber se o hook
  # funciona e chama-lo na mao com RENEWED_LINEAGE definido. O que ele faz e
  # `nginx -t` seguido de `systemctl reload nginx` -- reload, nunca restart.
  ssh -i "${KEY}" -o BatchMode=yes "${VPS}" \
    "sudo env RENEWED_LINEAGE=/etc/letsencrypt/live/${LINHAGEM} \
       /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"
fi

echo
echo ">>> como ficou"
ssh -i "${KEY}" -o BatchMode=yes "${VPS}" \
  "sudo certbot certificates --cert-name ${LINHAGEM}"

echo
if [ "${MODO}" = "ensaio" ]; then
  echo "Ensaio concluido. Nada em /etc/letsencrypt/live foi alterado."
  echo "Para valer: bash deploy/vps/02-certificate.sh"
else
  echo "Proximo passo: bash deploy/vps/03-layout.sh"
fi
