#!/bin/bash
# Verificacao pos-provisionamento, pela internet (passando pela Cloudflare).
#
#   bash deploy/vps/06-verificar.sh
#
# Roda quantas vezes quiser; nao muda nada em lugar nenhum. Vale rodar de novo
# depois de cada deploy.
#
# A checagem que realmente importa e a ultima: os quatro sites que ja moravam
# nesta maquina continuam respondendo. O resto e sobre o Verbete.
set -euo pipefail

SITE=https://verbete.devduraes.com.br
VIZINHOS="qyrofinance.com.br amgseg.com.br nossario.com.br devduraes.com.br"
# O endereco da origem NAO mora neste repositorio. O DNS deste host passa pela
# Cloudflare (nuvem laranja) e o proposito da nuvem laranja e justamente esconder
# o IP de origem -- ver 01-dns.sh. Defina antes de rodar, fora do git:
#
#   export VPS=usuario@ip-da-origem      # ou um Host apelidado em ~/.ssh/config
#   export VPS_KEY=~/.ssh/sua_chave      # opcional; o padrao esta abaixo
VPS="${VPS:?defina VPS=usuario@host antes de rodar (veja deploy/vps/README.md)}"
KEY="${VPS_KEY:-$HOME/.ssh/qyro_vps}"

ok=0; ruim=0
sim() { printf '  ok      %s\n' "$1"; ok=$((ok + 1)); }
nao() { printf '  FALHOU  %s\n          %s\n' "$1" "$2"; ruim=$((ruim + 1)); }

cab() { curl -sS -I --max-time 20 "$1" 2>&1; }

echo "=== 1. o site responde ==================================================="
H=$(cab "${SITE}/") || true
printf '%s\n' "${H}" | grep -iE '^(HTTP|server|cf-ray|content-type)' | sed 's/^/  /' || true
case "${H}" in
  HTTP/2\ 200*|HTTP/1.1\ 200*) sim "200 em ${SITE}/" ;;
  *) nao "200 em ${SITE}/" "$(printf '%s' "${H}" | head -1)" ;;
esac

echo
echo "=== 2. o HTML nao pode ficar em cache ==================================="
# Com service worker, um index.html velho preso no navegador serve um build
# velho para sempre. Isto e o que impede.
if printf '%s' "${H}" | grep -qi 'cache-control:.*no-store'; then
  sim "no-store no /"
else
  nao "no-store no /" "$(printf '%s' "${H}" | grep -i cache-control || echo 'sem cache-control')"
fi

for caminho in /sw.js /manifest.webmanifest; do
  R=$(cab "${SITE}${caminho}") || true
  if printf '%s' "${R}" | grep -qi 'cache-control:.*no-store'; then
    sim "no-store em ${caminho}"
  else
    nao "no-store em ${caminho}" "$(printf '%s' "${R}" | grep -i cache-control || echo 'sem cache-control')"
  fi
done

echo
echo "=== 3. o manifest sai com o tipo certo =================================="
# /etc/nginx/mime.types desta VPS nao tem entrada para .webmanifest; quem
# resolve e o `default_type` do bloco `location = /manifest.webmanifest`.
R=$(cab "${SITE}/manifest.webmanifest") || true
if printf '%s' "${R}" | grep -qi 'content-type:.*application/manifest+json'; then
  sim "content-type application/manifest+json"
else
  nao "content-type do manifest" "$(printf '%s' "${R}" | grep -i content-type || echo 'sem content-type')"
fi

echo
echo "=== 4. os assets com hash podem ficar em cache para sempre =============="
ATIVO=$(curl -sS --max-time 20 "${SITE}/" | grep -o '/assets/[A-Za-z0-9._-]*\.js' | head -1 || true)
if [ -z "${ATIVO}" ]; then
  nao "achar um asset com hash no index.html" "(ainda e a pagina provisoria? faca o primeiro deploy)"
else
  R=$(cab "${SITE}${ATIVO}") || true
  if printf '%s' "${R}" | grep -qi 'cache-control:.*immutable'; then
    sim "immutable em ${ATIVO}"
  else
    nao "immutable em ${ATIVO}" "$(printf '%s' "${R}" | grep -i cache-control || echo 'sem cache-control')"
  fi
fi

echo
echo "=== 5. cabecalhos de seguranca =========================================="
for h in strict-transport-security x-frame-options x-content-type-options referrer-policy; do
  if printf '%s' "${H}" | grep -qi "^${h}:"; then
    sim "${h}"
  else
    nao "${h}" "ausente na resposta de /"
  fi
done

echo
echo "=== 6. deep link cai no index.html (fallback de SPA) ===================="
R=$(cab "${SITE}/uma/rota/que/nao/existe") || true
if printf '%s' "${R}" | head -1 | grep -q '200'; then sim "deep link devolve 200"
else nao "deep link devolve 200" "$(printf '%s' "${R}" | head -1)"; fi

echo
echo "=== 7. OS VIZINHOS (a checagem que importa de verdade) =================="
for d in ${VIZINHOS}; do
  linha=$(curl -sS -I --max-time 20 "https://${d}/" 2>&1 | head -1 || echo "sem resposta")
  printf '  %-24s %s\n' "${d}" "${linha}"
  case "${linha}" in
    *" 200"*|*" 301"*|*" 302"*|*" 308"*|*" 503"*) ok=$((ok + 1)) ;;
    *) nao "${d} respondendo" "${linha}"; ;;
  esac
done
echo "  (devduraes.com.br em 503 e o esperado: o vhost do rpg serve a pagina"
echo "   de manutencao enquanto nao existe processo PM2 rpg-web)"

echo
echo "=== 8. na VPS: certificado e configuracao ==============================="
if ssh -i "${KEY}" -o BatchMode=yes -o ConnectTimeout=15 "${VPS}" true 2>/dev/null; then
  ssh -i "${KEY}" -o BatchMode=yes "${VPS}" '
    sudo certbot certificates --cert-name devduraes.com.br 2>/dev/null \
      | grep -E "Domains|Expiry" | sed "s/^/  /"
    echo "  --- nginx -t ---"
    sudo nginx -t 2>&1 | sed "s/^/  /"
    echo "  --- sites-enabled ---"
    ls /etc/nginx/sites-enabled/ | sed "s/^/  /"
  '
else
  echo "  (sem acesso ssh agora; pulei)"
fi

echo
printf 'ok: %s   falhou: %s\n' "${ok}" "${ruim}"
[ "${ruim}" -eq 0 ] || exit 1
