#!/bin/bash
# Local unit tests for deploy-wrapper.sh's argument parser.
#
# This runs on a laptop, not on the VPS. It is the only part of this task that
# can be tested for real before anything is provisioned, and it is the part
# where a bug is worst: the parser is what stands between a deploy key and a
# shell on a machine running four other production sites.
#
#   bash deploy/vps/test-deploy-wrapper.sh
#
# The wrapper is copied to a temp file with RSYNC_BIN pointed at a stub that
# records its argv instead of transferring anything, so the accept path can be
# checked without an rsync running. Nothing else in the copy is altered, and
# the substitution itself is asserted.
set -uo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WRAPPER="${SCRIPT_DIR}/deploy-wrapper.sh"
[ -r "${WRAPPER}" ] || { echo "nao achei ${WRAPPER}" >&2; exit 1; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/verbete-wrapper-test.XXXXXX")
trap 'rm -rf "${TMP}"' EXIT

STUB="${TMP}/rsync-stub"
ARGV_LOG="${TMP}/argv"
cat > "${STUB}" <<STUB_EOF
#!/bin/bash
printf '%s\n' "\$@" > "${ARGV_LOG}"
exit 0
STUB_EOF
chmod 755 "${STUB}"

UNDER_TEST="${TMP}/wrapper.sh"
sed "s#^readonly RSYNC_BIN=.*#readonly RSYNC_BIN=${STUB}#" "${WRAPPER}" > "${UNDER_TEST}"
chmod 755 "${UNDER_TEST}"
grep -q "^readonly RSYNC_BIN=${STUB}\$" "${UNDER_TEST}" \
  || { echo "a substituicao do rsync stub nao pegou -- teste invalido" >&2; exit 1; }
grep -q '^readonly RSYNC_BIN=/usr/bin/rsync' "${UNDER_TEST}" \
  && { echo "a copia ainda aponta para /usr/bin/rsync -- teste invalido" >&2; exit 1; }

pass=0
fail=0

# ok <descricao> <comando> — espera que o wrapper EXECUTE o rsync
ok() {
  local desc=$1 cmd=$2
  rm -f "${ARGV_LOG}"
  local out rc
  out=$(cd "${TMP}" && SSH_ORIGINAL_COMMAND="${cmd}" "${UNDER_TEST}" 2>&1)
  rc=$?
  if [ "${rc}" -ne 0 ]; then
    printf 'FALHOU  %s\n        esperava aceitar, saiu %s: %s\n' "${desc}" "${rc}" "${out}"
    fail=$((fail + 1))
    return
  fi
  printf 'ok      %s\n' "${desc}"
  pass=$((pass + 1))
}

# nao <descricao> <comando> <trecho esperado da recusa>
nao() {
  local desc=$1 cmd=$2 want=$3
  rm -f "${ARGV_LOG}"
  local out rc
  out=$(cd "${TMP}" && SSH_ORIGINAL_COMMAND="${cmd}" "${UNDER_TEST}" 2>&1)
  rc=$?
  if [ "${rc}" -eq 0 ]; then
    printf 'FALHOU  %s\n        PASSOU PELA TRAVA: %s\n' "${desc}" "${cmd}"
    fail=$((fail + 1))
    return
  fi
  if [ -f "${ARGV_LOG}" ]; then
    printf 'FALHOU  %s\n        o rsync chegou a ser executado\n' "${desc}"
    fail=$((fail + 1))
    return
  fi
  case "${out}" in
    *"${want}"*) printf 'ok      %s\n' "${desc}"; pass=$((pass + 1)) ;;
    *) printf 'FALHOU  %s\n        recusou pelo motivo errado: %s\n' "${desc}" "${out}"
       fail=$((fail + 1)) ;;
  esac
}

# O que o rsync do cliente realmente manda para o outro lado.
SRV='--server -logDtpre.iLsfxC'

echo "--- sem comando ---------------------------------------------------------"
rm -f "${ARGV_LOG}"
out=$(cd "${TMP}" && env -u SSH_ORIGINAL_COMMAND "${UNDER_TEST}" 2>&1); rc=$?
if [ "${rc}" -ne 0 ] && [ ! -f "${ARGV_LOG}" ]; then
  echo "ok      SSH_ORIGINAL_COMMAND ausente (tentativa de shell interativo)"
  pass=$((pass + 1))
else
  echo "FALHOU  SSH_ORIGINAL_COMMAND ausente deveria recusar"; fail=$((fail + 1))
fi
nao "SSH_ORIGINAL_COMMAND vazio"            ""            "sem comando"
nao "so espaco em branco"                   "   "         "curto demais"

echo "--- comando que nao e rsync ---------------------------------------------"
nao "shell puro"                            "bash"                              "curto demais"
nao "shell com argumentos"                  "bash -c id ; ls"                   "comando nao permitido"
nao "rsync por caminho absoluto"            "/usr/bin/rsync ${SRV} . /srv/verbete/app/" "comando nao permitido"
nao "outro binario com cara de rsync"       "rsyncd ${SRV} . /srv/verbete/app/" "comando nao permitido"

echo "--- direcao de leitura ---------------------------------------------------"
nao "--sender (puxaria os .env dos vizinhos)" "rsync --server --sender -logDtpre.iLsfxC . /srv/qyro/shared/" "--sender"
nao "--sender com destino valido"           "rsync --server --sender -logDtpre.iLsfxC . /srv/verbete/app/"  "--sender"
nao "--sender=algo"                         "rsync --server --sender=x . /srv/verbete/app/"                 "--sender"
nao "rsync sem --server"                    "rsync -logDtpre.iLsfxC . /srv/verbete/app/"                    "sem --server"

echo "--- destino --------------------------------------------------------------"
nao "travessia com .."                      "rsync ${SRV} . /srv/verbete/app/../bin/"   "destino com .."
nao "travessia disfarcada"                  "rsync ${SRV} . /srv/verbete/app/../../etc/" "destino com .."
nao "diretorio do proprio wrapper"          "rsync ${SRV} . /srv/verbete/bin/"           "destino fora da lista"
nao "shared de outro projeto"               "rsync ${SRV} . /srv/qyro/shared/"           "destino fora da lista"
nao "authorized_keys"                       "rsync ${SRV} . /home/qyro/.ssh/"            "destino fora da lista"
nao "subpasta do destino (prefixo)"         "rsync ${SRV} . /srv/verbete/app/sub/"       "destino fora da lista"
nao "barra dupla"                           "rsync ${SRV} . /srv/verbete/app//"          "destino fora da lista"
nao "ponto no fim"                          "rsync ${SRV} . /srv/verbete/app/."          "destino fora da lista"
nao "raiz"                                  "rsync ${SRV} . /"                           "destino fora da lista"

echo "--- opcoes que escapam do destino ---------------------------------------"
nao "--daemon (config vem do cliente)"      "rsync --server --daemon . /srv/verbete/app/"                        "daemon"
nao "--config"                              "rsync ${SRV} --config=/tmp/x . /srv/verbete/app/"                   "daemon"
nao "--log-file grava onde quiser"          "rsync ${SRV} --log-file=/home/qyro/.ssh/authorized_keys . /srv/verbete/app/" "log-file"
nao "-T /tmp (temp-dir)"                    "rsync ${SRV} -T /home/qyro/.ssh . /srv/verbete/app/"                "temp-dir"
nao "--partial-dir"                         "rsync ${SRV} --partial-dir=/home/qyro/.ssh . /srv/verbete/app/"     "partial-dir"
nao "--backup-dir"                          "rsync ${SRV} --backup-dir=/home/qyro . /srv/verbete/app/"           "backup"
nao "-b dentro do bloco curto"              "rsync --server -logDtprbe.iLsfxC . /srv/verbete/app/"               "-b"
# `-T` engole o resto do argumento como valor: um check que so procurasse `-T`
# sozinho deixaria este passar.
nao "-T grudado noutra opcao curta"         "rsync --server -lT/opt/x . /srv/verbete/app/"                        "-T"
nao "-T apontando para o .ssh"              "rsync --server -lT/home/qyro/.ssh . /srv/verbete/app/"               "opcao nao permitida"
nao "-M (remote-option) no bloco curto"     "rsync --server -lM--log-file=/tmp/x . /srv/verbete/app/"             "-M"
nao "--remote-option"                       "rsync ${SRV} --remote-option=--log-file=/tmp/x . /srv/verbete/app/"  "nao permitida"
nao "--link-dest traz arquivo de fora"      "rsync ${SRV} --link-dest=/srv/qyro/shared . /srv/verbete/app/"      "link-dest"
nao "--files-from"                          "rsync ${SRV} --files-from=/etc/passwd . /srv/verbete/app/"          "nao permitida"
nao "--rsync-path"                          "rsync ${SRV} --rsync-path=/bin/sh . /srv/verbete/app/"              "nao permitida"
nao "--rsh"                                 "rsync ${SRV} --rsh=/bin/sh . /srv/verbete/app/"                     "nao permitida"
nao "--remove-source-files"                 "rsync ${SRV} --remove-source-files . /srv/verbete/app/"             "nao permitida"
nao "--secluded-args (some com os caminhos)" "rsync ${SRV} --secluded-args . /srv/verbete/app/"                   "secluded-args"
nao "-s dentro do bloco curto"              "rsync --server -slogDtpre.iLsfxC . /srv/verbete/app/"                "-s"
ok  "o 's' do bloco compat e.iLsfxC nao conta" "rsync --server -logDtpre.iLsfxCIvu . /srv/verbete/app/"

echo "--- o que os clientes de verdade mandam ---------------------------------"
# Capturado do openrsync 2.6.9-compat (o /usr/bin/rsync do macOS) com um -e
# falso, e do rsync 3.4.1 da propria VPS com -vvv. Se um destes parar de
# passar, o deploy quebra.
ok  "openrsync (macOS): opcoes soltas"        "rsync --server --delete-before -l -p -r -t -z --dirs . /srv/verbete/app/"
ok  "rsync 3.4.1: -rlptz --delete"            "rsync --server -ltprze.iLsfxCIvu --delete . /srv/verbete/app/"
ok  "rsync 3.4.1: -az --delete"               "rsync --server -logDtprze.iLsfxCIvu --delete . /srv/verbete/app/"
ok  "rsync 3.4.1: --dry-run"                  "rsync --server -nltprze.iLsfxCIvu --delete . /srv/verbete/app/"
ok  "rsync 3.4.1: -v --checksum"              "rsync --server -vltprcze.iLsfxCIvu --delete . /srv/verbete/app/"

echo "--- formato --------------------------------------------------------------"
nao "sem o '.' de origem"                   "rsync ${SRV} /etc/passwd /srv/verbete/app/" "formato inesperado"
nao "origem extra depois do '.'"            "rsync ${SRV} . /etc/passwd /srv/verbete/app/" "formato inesperado"

echo "--- metacaracteres nao sao sintaxe --------------------------------------"
: > "${TMP}/canario"
# As palavras sobrando empurram o destino para longe do fim: a checagem de
# formato pega antes da lista de destinos. Recusa e recusa; o que importa e que
# `rm`, `id` e companhia viram argumento de rsync, nunca um segundo comando.
nao "';' nao encadeia comando"              "rsync ${SRV} . /srv/verbete/app/ ; rm -f ${TMP}/canario" "formato inesperado"
nao "'|' nao vira pipe"                     "rsync ${SRV} . /srv/verbete/app/ | id"                   "formato inesperado"
nao "'&&' nao vira operador"                "rsync ${SRV} . /srv/verbete/app/ && id"                  "formato inesperado"
# Aspas simples de proposito: o teste existe justamente para provar que estas
# expressoes NAO sao avaliadas em lugar nenhum.
# shellcheck disable=SC2016
nao 'substituicao $(...) nao e avaliada'    'rsync --server -logDtpre.iLsfxC . $(whoami)'             "destino fora da lista"
# shellcheck disable=SC2016
nao 'crase nao e avaliada'                  'rsync --server -logDtpre.iLsfxC . `whoami`'              "destino fora da lista"
# shellcheck disable=SC2016
nao 'variavel $HOME nao e expandida'        'rsync --server -logDtpre.iLsfxC . $HOME/'                "destino fora da lista"
nao "nova linha nao vira segundo comando"   "rsync ${SRV} . /srv/verbete/app/
rm -f ${TMP}/canario"                                                                                 "formato inesperado"
if [ -f "${TMP}/canario" ]; then
  echo "ok      o canario sobreviveu a todos os metacaracteres"; pass=$((pass + 1))
else
  echo "FALHOU  algum metacaractere executou: o canario sumiu"; fail=$((fail + 1))
fi

# `set -f`: sem ele, o '*' seria expandido contra o diretorio corrente na hora
# da divisao em palavras. Com dois arquivos no cwd o ultimo argumento viraria
# um nome de arquivo (e a recusa seria "formato inesperado"); com set -f o
# argumento continua sendo '*' e a recusa e a do destino.
: > "${TMP}/aaa"; : > "${TMP}/zzz"
nao "'*' nao e expandido (set -f)"          'rsync --server -logDtpre.iLsfxC . *'  "destino fora da lista"

echo "--- o caminho feliz ------------------------------------------------------"
ok  "deploy normal, com barra"              "rsync ${SRV} --delete . /srv/verbete/app/"
if [ -f "${ARGV_LOG}" ] && [ "$(tr '\n' ' ' < "${ARGV_LOG}")" = "--server -logDtpre.iLsfxC --delete . /srv/verbete/app/ " ]; then
  echo "ok      argv repassado intacto ao rsync"; pass=$((pass + 1))
else
  printf 'FALHOU  argv alterado: %s\n' "$(tr '\n' ' ' < "${ARGV_LOG}" 2>/dev/null)"; fail=$((fail + 1))
fi
ok  "deploy sem barra no fim"               "rsync ${SRV} . /srv/verbete/app"
ok  "com --delete-during e -v"              "rsync --server -vlogDtpre.iLsfxC --delete-during . /srv/verbete/app/"

echo
printf 'passou: %s   falhou: %s\n' "${pass}" "${fail}"
[ "${fail}" -eq 0 ] || exit 1
