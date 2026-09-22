#!/bin/bash
# Passo 5/5 -- chave de deploy restrita do Verbete.
#
#   bash deploy/vps/05-deploy-key.sh
#
# Gera ~/.ssh/verbete_deploy (se ainda nao existir) e prende a publica no
# authorized_keys da VPS com:
#
#   restrict,command="/srv/verbete/bin/deploy-wrapper.sh" ssh-ed25519 AAAA... verbete_deploy
#
# `restrict` desliga tudo: tty, encaminhamento de porta e de agente, X11 e os
# arquivos de rc do usuario. `command=` ignora o que o cliente pediu e sempre
# executa o wrapper, que recebe o pedido original em $SSH_ORIGINAL_COMMAND e
# decide se aceita. As duas coisas juntas sao a tranca -- uma sem a outra nao
# serve.
#
# Idempotente: reconhece a linha pelo comentario `verbete_deploy` e nao duplica.
# No fim, tenta abusar da chave de proposito e exige que a VPS recuse.
set -euo pipefail

VPS=qyro@179.198.97.215
KEY=~/.ssh/qyro_vps
DEPLOY_KEY=~/.ssh/verbete_deploy
WRAPPER_REMOTO=/srv/verbete/bin/deploy-wrapper.sh

if [ ! -f "${DEPLOY_KEY}" ]; then
  echo ">>> gerando ${DEPLOY_KEY}"
  ssh-keygen -t ed25519 -N '' -C verbete_deploy -f "${DEPLOY_KEY}"
else
  echo ">>> ${DEPLOY_KEY} ja existe; reaproveitando"
fi
chmod 600 "${DEPLOY_KEY}"
PUB=$(cat "${DEPLOY_KEY}.pub")

echo ">>> conferindo se o wrapper esta instalado na VPS"
ssh -i "${KEY}" -o BatchMode=yes "${VPS}" "test -x ${WRAPPER_REMOTO}" || {
  echo "o wrapper nao esta em ${WRAPPER_REMOTO}; rode o 03-layout.sh antes" >&2
  exit 1
}

echo ">>> registrando a chave no authorized_keys"
ssh -i "${KEY}" -o BatchMode=yes "${VPS}" "PUB='${PUB}' bash -s" <<'REMOTE'
set -euo pipefail
AK=$HOME/.ssh/authorized_keys
LINHA="restrict,command=\"/srv/verbete/bin/deploy-wrapper.sh\" $PUB"

if grep -q ' verbete_deploy$' "$AK" 2>/dev/null; then
  if grep -qxF "$LINHA" "$AK"; then
    echo "    ja esta la, identica"
  else
    echo "    ja existe uma linha verbete_deploy DIFERENTE desta:" >&2
    grep ' verbete_deploy$' "$AK" | sed 's/^/      /' >&2
    echo "    revise na mao antes de continuar (nao vou sobrescrever chave)" >&2
    exit 1
  fi
else
  # O authorized_keys pode nao existir ainda; sem a guarda o `cp` derruba o
  # script inteiro por causa do set -e.
  [ -e "$AK" ] && cp -a "$AK" "$AK.bak-$(date +%F-%H%M%S)"
  install -d -m 700 "$(dirname "$AK")"
  # Garante a quebra de linha antes de anexar: o $( ) come o \n final, entao
  # `tail -c1` so devolve algo se o ultimo byte NAO for uma quebra.
  if [ -s "$AK" ] && [ -n "$(tail -c1 "$AK")" ]; then printf '\n' >> "$AK"; fi
  printf '%s\n' "$LINHA" >> "$AK"
  chmod 600 "$AK"
  echo "    adicionada"
fi

echo
echo "--- chaves cadastradas ---"
awk '{print "  " $NF}' "$AK"
REMOTE

echo
echo ">>> agora tentando ABUSAR da chave (todas estas tentativas tem de falhar)"
abuso() {
  local desc=$1 cmd=$2 saida rc
  if [ -n "${cmd}" ]; then
    saida=$(ssh -i "${DEPLOY_KEY}" -o BatchMode=yes -o ConnectTimeout=15 "${VPS}" "${cmd}" 2>&1) || rc=$?
  else
    saida=$(ssh -i "${DEPLOY_KEY}" -o BatchMode=yes -o ConnectTimeout=15 "${VPS}" 2>&1 </dev/null) || rc=$?
  fi
  rc=${rc:-0}
  if [ "${rc}" -eq 0 ]; then
    printf '  PASSOU (RUIM!)  %s\n' "${desc}"
    return 1
  fi
  printf '  recusado   %s\n             %s\n' "${desc}" "${saida%%$'\n'*}"
}

ruim=0
abuso "shell interativo"                    ""                                   || ruim=1
abuso "comando qualquer"                    "id"                                 || ruim=1
abuso "ler o .env do qyro"                  "cat /srv/qyro/shared/.env"          || ruim=1
abuso "rsync de leitura"                    "rsync --server --sender -logDtpre.iLsfxC . /srv/qyro/shared/" || ruim=1
abuso "rsync para o diretorio do wrapper"   "rsync --server -logDtpre.iLsfxC . /srv/verbete/bin/"          || ruim=1
abuso "rsync com travessia"                 "rsync --server -logDtpre.iLsfxC . /srv/verbete/app/../bin/"   || ruim=1
# Posicional a mais: o rsync faz chdir() no primeiro e escreve LA, com o
# destino permitido intacto. Nenhuma opcao proibida aparece nesta cadeia --
# so a contagem de posicionais barra.
abuso "posicional a mais (chdir para o .ssh)" \
  "rsync --server -logDtpre.iLsfxC --delete /home/qyro/.ssh . /srv/verbete/app/" || ruim=1
abuso "'.' duplicado (escreve no home do qyro)" \
  "rsync --server -logDtpre.iLsfxC --delete . . /srv/verbete/app/"               || ruim=1
# Depois de um `--`, o rsync trata tudo como caminho, inclusive palavra que
# comeca com hifen -- e uma contagem de posicionais que so olha o hifen nao ve
# esta aqui. O wrapper recusa o `--` inteiro.
abuso "'--' escondendo posicional com hifen" \
  "rsync --server -logDtpre.iLsfxC --delete -- -d/../../home/qyro/.ssh . /srv/verbete/app/" || ruim=1

[ "${ruim}" -eq 0 ] || { echo; echo "UMA TENTATIVA DE ABUSO PASSOU. Nao use esta chave." >&2; exit 1; }

echo
echo ">>> e agora o caminho legitimo, em ensaio (--dry-run: nao escreve nada)"
RAIZ=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
if [ -d "${RAIZ}/dist" ]; then
  rsync -rlptz --dry-run --delete -e "ssh -i ${DEPLOY_KEY} -o BatchMode=yes" \
    "${RAIZ}/dist/" "${VPS}:/srv/verbete/app/" | tail -5
  echo "    o ensaio passou pelo wrapper"
else
  echo "    (sem dist/ aqui; rode 'pnpm build' e repita para testar)"
fi

echo
echo "Chave privada: ${DEPLOY_KEY}  (vai no secret VPS_SSH_KEY quando houver CI)"
echo "Proximo passo: bash deploy/vps/06-verificar.sh"
