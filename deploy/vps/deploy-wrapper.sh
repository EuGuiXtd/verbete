#!/bin/bash
# Lock on Verbete's deploy key. Installed at /srv/verbete/bin/deploy-wrapper.sh
# (owner root, mode 755 -- the `qyro` user may execute it but never rewrite it)
# and pinned to the `verbete_deploy` public key in /home/qyro/.ssh/authorized_keys:
#
#   restrict,command="/srv/verbete/bin/deploy-wrapper.sh" ssh-ed25519 AAAA... verbete_deploy
#
# Modelled on /srv/amgseg/bin/deploy-wrapper.sh and the RPG copy on this same
# machine. Read that history before relaxing anything here: this VPS has
# already been lost once to an unrestricted deploy key, and it now runs four
# other people's production sites (qyro, amgseg, nossario, rpg).
#
# The whole contract: this key can rsync files INTO one exact directory. It
# cannot get a shell, cannot read anything back, cannot write anywhere else.
#
# Design rules, each of which is load-bearing:
#
#  1. $SSH_ORIGINAL_COMMAND NEVER reaches `sh -c` or `eval`. It is split into
#     words by `set --` and handed to `exec`, so `;`, `|`, `$(...)`, backticks
#     and newlines inside it are ordinary argument characters, never syntax.
#  2. `set -f` is armed BEFORE the split, so a `*` in the command is not
#     expanded against the filesystem while splitting.
#  3. `--sender` is refused. A read-direction rsync would pull
#     /srv/{qyro,rpg,amgseg}/shared/.env off this shared machine.
#  4. The destination is matched EXACTLY, never by a `/srv/verbete/*` prefix:
#     a prefix would let a deploy overwrite this very wrapper, which is the
#     only thing standing between the key and a shell.
#  5. Options that let rsync write outside the destination (--log-file,
#     --temp-dir, --partial-dir, --backup-dir) or start a config-driven daemon
#     (--daemon, --config) are refused too. `--server` alone does not confine
#     rsync; the destination allowlist does, and these options route around it.
#  6. It fails closed. Anything not understood is refused.
#
# Changing the rsync command in the deploy pipeline means changing this file
# too. That is the intended friction.
set -euo pipefail

readonly RSYNC_BIN=/usr/bin/rsync

# The ONE permitted destination, in the two spellings rsync may forward
# (the trailing slash is whatever the client typed). Both name the same
# directory; neither is a prefix of anything else under /srv/verbete.
readonly DEST_WITH_SLASH=/srv/verbete/app/
readonly DEST_BARE=/srv/verbete/app

readonly CMD=${SSH_ORIGINAL_COMMAND-}

audit() {
  # Best effort only: an unavailable or failing logger must never turn into a
  # permitted deploy, nor into a refused one.
  #
  # %q on the command: it is attacker-controlled, and a raw newline in it would
  # forge a second syslog line -- an easy way to bury the real refusal under a
  # fake "OK" while reading the journal.
  if command -v logger >/dev/null 2>&1; then
    logger -t verbete-deploy -- "$(printf '%s: %q' "$1" "${CMD}")" 2>/dev/null || true
  fi
}

refuse() {
  audit "RECUSADO ($1)"
  printf 'deploy-wrapper: recusado (%s): %s\n' "$1" "${CMD}" >&2
  exit 1
}

[ -n "${CMD}" ] || refuse "sem comando (esta chave nao abre shell)"

# --- split, with globbing disabled -------------------------------------------
# IFS is pinned rather than inherited so the splitting below is self-contained.
# `restrict` in authorized_keys blocks environment=, so a hostile IFS is not
# reachable today; this costs nothing and stops that from being load-bearing.
IFS=$' \t\n'
set -f
# Word splitting is the point here, so the lack of quotes is deliberate.
# shellcheck disable=SC2086
set -- ${CMD}

# `rsync --server <opts> . <dest>` is four words at the very least.
[ "$#" -ge 4 ] || refuse "comando curto demais para um rsync de escrita"

# --- 1. only rsync -----------------------------------------------------------
# Exact word: not a path, not a wrapper script, not anything else on $PATH.
[ "$1" = "rsync" ] || refuse "comando nao permitido"

# --- 2. must be a server invocation, must not be the read direction ----------
saw_server=no
for arg in "$@"; do
  case "${arg}" in
    --server) saw_server=yes ;;
    --sender|--sender=*) refuse "rsync de leitura (--sender)" ;;
  esac
done
[ "${saw_server}" = "yes" ] || refuse "rsync sem --server"

# --- 3. options that escape the destination ----------------------------------
for arg in "$@"; do
  case "${arg}" in
    # Would run rsync as a daemon whose config the client supplies, and a
    # daemon config can run commands (pre-xfer exec).
    --daemon|--no-detach|--config|--config=*)
      refuse "modo daemon" ;;
    # Each of these takes a path and writes to it, anywhere on the filesystem.
    --log-file|--log-file=*|--log-file-format|--log-file-format=*)
      refuse "opcao que escreve fora do destino (--log-file)" ;;
    --temp-dir|--temp-dir=*|-T|-T*)
      refuse "opcao que escreve fora do destino (--temp-dir)" ;;
    --partial-dir|--partial-dir=*)
      refuse "opcao que escreve fora do destino (--partial-dir)" ;;
    --backup|--backup-dir|--backup-dir=*)
      refuse "opcao que escreve fora do destino (--backup)" ;;
    # Hardlink/copy from an arbitrary tree INTO the web root: a way to publish
    # another project's files at https://verbete.devduraes.com.br/.
    --compare-dest|--compare-dest=*|--copy-dest|--copy-dest=*|--link-dest|--link-dest=*)
      refuse "opcao que traz arquivos de fora (--link-dest)" ;;
    # Make rsync read a path list, or invoke another program, on this side.
    --files-from|--files-from=*|--rsh|--rsh=*|--rsync-path|--rsync-path=*)
      refuse "opcao nao permitida" ;;
    # Moves the real paths off the command line and into the protocol stream,
    # where the destination check below would have nothing left to inspect.
    --protect-args|--secluded-args)
      refuse "opcao nao permitida (--secluded-args)" ;;
    --remove-source-files|--remove-sent-files|--write-devices|--fake-super)
      refuse "opcao nao permitida" ;;
    --remote-option|--remote-option=*|--copy-as|--copy-as=*)
      refuse "opcao nao permitida" ;;
    --*)
      : ;;
    -*)
      # Short option bundle. Everything from the `e.` marker onward is the
      # client's compat block (iLsfxCIvu) and means nothing as an option, so
      # only the part before it is inspected. openrsync (the /usr/bin/rsync of
      # macOS) sends the short options one per argument instead of bundled;
      # either shape lands here the same way.
      #
      #   b  --backup
      #   s  --secluded-args
      #   T  --temp-dir. This one matters: `-T` takes a value, and a bundle
      #      swallows the rest of the argument as that value, so `-lT/home/qyro/.ssh`
      #      would walk straight past a check that only looked for a bare `-T`.
      #   M  --remote-option, which smuggles another option in as its value.
      #
      # None of the four appear in what a real client sends -- the argv of
      # rsync 3.4.1 and of openrsync are both pinned in test-deploy-wrapper.sh.
      # If some future rsync starts emitting one, the deploy fails loudly here
      # instead of quietly widening the lock.
      prefixo=${arg%%e.*}
      case "${prefixo}" in
        *b*) refuse "opcao nao permitida (-b)" ;;
        *s*) refuse "opcao nao permitida (-s)" ;;
        *T*) refuse "opcao que escreve fora do destino (-T)" ;;
        *M*) refuse "opcao nao permitida (-M)" ;;
      esac ;;
  esac
done

# --- 4. shape: rsync --server <opts> . <dest> --------------------------------
# rsync always forwards `.` as the source and the destination last. Pinning
# the shape means an unfamiliar invocation is refused instead of guessed at.
# No `eval` and no string indirection: copy the positional parameters into a
# real array and index it.
args=( "$@" )
source_arg=${args[$# - 2]}
destino=${args[$# - 1]}
[ "${source_arg}" = "." ] || refuse "formato inesperado (origem nao e '.')"

# ...and it takes EXACTLY two of them. This is the check the destination
# allowlist depends on, and without it the allowlist confines nothing.
#
# `rsync --server` no lado que RECEBE trata o primeiro positional como um
# diretorio para onde faz chdir(), e so entao resolve o segundo como destino.
# Um terceiro positional empurra tudo uma casa para a esquerda, e a string que
# a checagem de destino examinou deixa de ser o lugar onde os arquivos caem:
#
#   rsync --server <opts> /home/qyro/.ssh . /srv/verbete/app/
#
# passava por todas as checagens acima -- `.` na penultima posicao, destino
# exato na ultima -- enquanto o rsync fazia chdir para /home/qyro/.ssh e
# escrevia LA, com --delete apagando o que ja estava. Reproduzido com rsync de
# verdade, arquivos escritos: o authorized_keys da vitima foi substituido e o
# /srv/verbete/app/ ficou vazio. Dali ate reconectar sem restricao como `qyro`,
# que tem sudo NOPASSWD, e um passo.
#
# Toda palavra entre `rsync` e o `. <destino>` final tem de ser uma opcao.
# Conferido no rsync 3.4.1 da VPS e no 3.5.1 local: opcao com valor sempre
# chega como `--opt=valor` ou grudada (`-B4096`), nunca como palavra separada
# (--max-size, --exclude, --bwlimit, --compress-level, --timeout,
# --modify-window, --block-size, --checksum-choice, --iconv, --chmod, --info,
# --partial, --suffix, --max-delete, --usermap). O openrsync do macOS manda as
# curtas soltas, e todas comecam com `-`. Se um rsync futuro separar um valor,
# isto falha fechado -- que e a regra da casa.
posicionais=0
for arg in "${args[@]:1}"; do
  case "${arg}" in
    -*) ;;
    *) posicionais=$(( posicionais + 1 )) ;;
  esac
done
[ "${posicionais}" -eq 2 ] || refuse "numero de argumentos posicionais (${posicionais}, esperado 2)"

# --- 5. the destination ------------------------------------------------------
case "${destino}" in
  *..*) refuse "destino com .." ;;
esac
case "${destino}" in
  "${DEST_WITH_SLASH}"|"${DEST_BARE}") ;;
  *) refuse "destino fora da lista" ;;
esac

# --- 6. go -------------------------------------------------------------------
# Absolute path, not a $PATH lookup: `restrict` in authorized_keys already
# blocks environment= and user rc files, but naming the binary costs nothing.
[ -x "${RSYNC_BIN}" ] || refuse "rsync ausente em ${RSYNC_BIN}"

audit "OK"
shift
exec "${RSYNC_BIN}" "$@"
