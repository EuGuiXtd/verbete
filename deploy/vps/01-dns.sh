#!/bin/bash
# Passo 1/5 -- registro DNS do Verbete na Cloudflare.
#
#   CF_DNS_TOKEN=cfut_... bash deploy/vps/01-dns.sh
#   CF_DNS_TOKEN=cfut_... bash deploy/vps/01-dns.sh --conferir   # so olha, nao muda
#
# Roda na maquina local; nao toca a VPS. Idempotente: se o registro ja existir
# certo, nao faz nada; se existir errado, corrige; se nao existir, cria.
#
# O token e o `devduraes-certbot` do senhas.md (Zone Read + DNS Edit na zona
# devduraes.com.br). Vem por variavel de ambiente de proposito -- token nenhum
# entra neste repositorio.
#
# PROXIED (nuvem laranja) nao e preferencia estetica: o ufw da VPS so abre
# 80/443 para as faixas da Cloudflare. Um registro cinza aponta o navegador
# direto para 179.198.97.215, o firewall derruba o pacote e o site simplesmente
# nao responde.
set -euo pipefail

ZONA=devduraes.com.br
NOME=verbete.devduraes.com.br
ALVO=devduraes.com.br   # CNAME para o apex, que ja e um A proxied para a VPS

SO_CONFERIR=nao
[ "${1-}" = "--conferir" ] && SO_CONFERIR=sim

: "${CF_DNS_TOKEN:?exporte CF_DNS_TOKEN (token devduraes-certbot do senhas.md)}"
command -v curl    >/dev/null || { echo "precisa de curl" >&2; exit 1; }
command -v python3 >/dev/null || { echo "precisa de python3" >&2; exit 1; }

api() {
  local metodo=$1 caminho=$2
  shift 2
  curl -sS -X "${metodo}" "https://api.cloudflare.com/client/v4${caminho}" \
    -H "Authorization: Bearer ${CF_DNS_TOKEN}" \
    -H "Content-Type: application/json" "$@"
}

echo ">>> procurando a zona ${ZONA}"
ZONA_ID=$(api GET "/zones?name=${ZONA}" | python3 -c '
import json, sys
d = json.load(sys.stdin)
if not d.get("success"):
    sys.exit("Cloudflare recusou: %s" % d.get("errors"))
print(d["result"][0]["id"] if d["result"] else "")
')
[ -n "${ZONA_ID}" ] || { echo "o token nao enxerga a zona ${ZONA}" >&2; exit 1; }
echo "    zone id ${ZONA_ID}"

echo ">>> procurando ${NOME}"
ATUAL=$(api GET "/zones/${ZONA_ID}/dns_records?name=${NOME}")
LEITURA=$(printf '%s' "${ATUAL}" | python3 -c '
import json, sys
alvo = sys.argv[1]
d = json.load(sys.stdin)
if not d.get("success"):
    sys.exit("Cloudflare recusou: %s" % d.get("errors"))
res = d["result"]
if not res:
    print("AUSENTE\t\t")
else:
    r = res[0]
    certo = (r["type"] == "CNAME"
             and r["content"].rstrip(".").lower() == alvo.lower()
             and bool(r["proxied"]))
    print("%s\t%s\t%s %s -> %s proxied=%s"
          % ("CERTO" if certo else "DIFERENTE", r["id"],
             r["type"], r["name"], r["content"], r["proxied"]))
' "${ALVO}")

ESTADO=$(printf '%s' "${LEITURA}" | cut -f1)
REG_ID=$(printf '%s' "${LEITURA}" | cut -f2)
DESCR=$(printf '%s' "${LEITURA}" | cut -f3)
echo "    ${ESTADO} ${DESCR}"

if [ "${SO_CONFERIR}" = "sim" ]; then
  echo "    (--conferir: nada foi alterado)"
  [ "${ESTADO}" = "CERTO" ] || exit 1
  exit 0
fi

CORPO=$(python3 -c '
import json, sys
print(json.dumps({"type": "CNAME", "name": sys.argv[1], "content": sys.argv[2],
                  "ttl": 1, "proxied": True,
                  "comment": "Verbete (jogo estatico) - deploy/vps/01-dns.sh"}))
' "${NOME}" "${ALVO}")

conferir_resposta() {
  python3 -c '
import json, sys
d = json.load(sys.stdin)
if not d.get("success"):
    sys.exit("Cloudflare recusou: %s" % d.get("errors"))
r = d["result"]
print("    ok:", r["type"], r["name"], "->", r["content"], "proxied =", r["proxied"])
'
}

case "${ESTADO}" in
  CERTO)
    echo "    nada a fazer" ;;
  AUSENTE)
    echo ">>> criando CNAME ${NOME} -> ${ALVO} (proxied)"
    api POST "/zones/${ZONA_ID}/dns_records" --data "${CORPO}" | conferir_resposta ;;
  *)
    echo ">>> registro existe mas esta diferente; corrigindo"
    api PUT "/zones/${ZONA_ID}/dns_records/${REG_ID}" --data "${CORPO}" | conferir_resposta ;;
esac

echo
echo ">>> conferindo a resolucao (pode levar ~1 min para propagar)"
# Proxied: o IP que aparece aqui e o da borda da Cloudflare (104.x / 172.x),
# NAO 179.198.97.215. Ver o IP da VPS aqui significa nuvem cinza -- volte e
# corrija, senao o ufw derruba todo acesso ao site.
dig +short "${NOME}" 2>/dev/null || nslookup "${NOME}" 2>/dev/null || true
echo
echo "Proximo passo: bash deploy/vps/02-certificate.sh"
