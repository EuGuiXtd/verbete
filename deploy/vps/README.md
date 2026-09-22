# Provisionamento do Verbete na VPS

Runbook dos cinco passos que colocam `verbete.devduraes.com.br` no ar.

**Todo script aqui é rodado por você, não pelo agente.** Cada um é idempotente:
pode rodar duas vezes sem estragar nada. Rode um de cada vez, na ordem, e leia
a saída antes de ir para o próximo.

## O que é o Verbete aqui

Um build estático do Vite (`dist/`). Não tem backend, banco, nem processo Node
em produção — o nginx serve arquivos e acabou. É um PWA: instalável, jogável
offline, com service worker. O modelo é o **nossario** desta mesma VPS, não o
qyro/amgseg/rpg (Next + PM2 + Postgres).

## A máquina já hospeda quatro sites em produção

`qyro`, `amgseg`, `nossario` e `rpg` — nada a ver com este projeto, e um erro
de nginx derruba os quatro junto. Por isso o passo 4 testa antes de recarregar,
desfaz sozinho se o teste falhar, e usa **reload, nunca restart**.

Estado conferido em 22/09/2026:

| | |
|---|---|
| `sites-enabled` | amgseg · nossario · qyro · rpg |
| cert `devduraes.com.br` | apex + www, **sem wildcard** |
| DNS `devduraes.com.br` | A apex → 179.198.97.215 (proxied) · CNAME www (proxied) |
| PM2 | `qyro-web` ×2, `amgseg-web` ×1 (`rpg-web` não existe) |
| `/srv` | amgseg · nossario · qyro · rpg |
| nginx | 1.26.3, Debian 13 |
| rsync | 3.4.1 em `/usr/bin/rsync` |

## Antes de começar

- `~/.ssh/qyro_vps` (chave de login normal na VPS, usuário `qyro`, sudo NOPASSWD)
- `CF_DNS_TOKEN` — o token `devduraes-certbot` do `senhas.md` (Zone Read + DNS Edit)
- `curl`, `python3`, `rsync`, `ssh-keygen` na máquina local

## A ordem

### 0. Testar o wrapper (roda local, não toca em nada)

```bash
bash deploy/vps/test-deploy-wrapper.sh
```

**Se algum caso falhar, pare aqui** — o wrapper é a tranca da chave de deploy,
e esta VPS já foi perdida uma vez por uma chave irrestrita. O `03-layout.sh` se
recusa a instalar o wrapper se esta suíte não passar.

### 1. DNS

```bash
CF_DNS_TOKEN=cfut_... bash deploy/vps/01-dns.sh
```

Cria `verbete.devduraes.com.br` como CNAME para o apex, **proxied** (nuvem
laranja). Isso não é opcional: o ufw da VPS só abre 80/443 para as faixas da
Cloudflare, então nuvem cinza = site inalcançável.

- **Espera encontrar:** a zona `devduraes.com.br` visível pelo token.
- **Deu certo quando:** a saída mostra `CNAME verbete.devduraes.com.br ->
  devduraes.com.br proxied = True`, e o `dig` no fim devolve um IP da
  Cloudflare (104.x / 172.x). **Se aparecer 179.198.97.215, está cinza** —
  rode de novo.
- **Conferir sem mudar nada:** `bash deploy/vps/01-dns.sh --conferir`
- **Desfazer:** apagar o registro no painel da Cloudflare.

### 2. Certificado wildcard

```bash
bash deploy/vps/02-certificate.sh --conferir  # só olha o estado atual
bash deploy/vps/02-certificate.sh --ensaio   # staging do Let's Encrypt
bash deploy/vps/02-certificate.sh            # para valer
```

Amplia a linhagem `devduraes.com.br` para incluir `*.devduraes.com.br`, na
mesma linhagem (`--cert-name`), para os caminhos em
`/etc/letsencrypt/live/devduraes.com.br/` continuarem valendo e o vhost do rpg
não precisar ser tocado.

- **Espera encontrar:** `/root/.secrets/cloudflare-devduraes.ini` (existe) e o
  plugin `dns-cloudflare` (instalado).
- **Deu certo quando:** `Domains: devduraes.com.br www.devduraes.com.br
  *.devduraes.com.br`.
- **Atenção:** isto substitui o certificado de um site que já está no ar
  (`devduraes.com.br`, vhost do rpg). Ensaie com `--ensaio` antes.
- **`--ensaio` não é "não toca em nada".** Ele usa o ambiente de staging do
  Let's Encrypt e **não** mexe em `/etc/letsencrypt/live`, mas o desafio ainda
  é DNS-01: o certbot cria um registro TXT `_acme-challenge` de verdade na zona
  `devduraes.com.br` e o apaga no fim. É autolimpante; se o script for
  interrompido no meio, confira a zona no painel da Cloudflare.
- **`--conferir` sai com código 1 enquanto o wildcard não existir.** É o estado
  normal antes de provisionar, não um erro — serve para encadear em scripts.
- **Sobre o deploy hook:** `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`
  já existe e cobre **todos** os certificados da máquina — o certbot roda os
  hooks de deploy uma vez por renovação, seja qual for a linhagem. O script
  confirma que ele existe e é executável, e **o executa na mão** com
  `RENEWED_LINEAGE` definido: `certbot renew --dry-run` **não** executa deploy
  hooks, então essa é a única forma de saber se ele funciona.
- **Desfazer:** os certificados antigos ficam em
  `/etc/letsencrypt/archive/devduraes.com.br/`. Voltar significa reapontar os
  symlinks de `live/` na mão — trabalhoso. Prefira o `--ensaio`.

### 3. Layout de arquivos

```bash
bash deploy/vps/03-layout.sh
```

```
/srv/verbete        root:root 755   ← só o root cria ou renomeia coisas aqui
/srv/verbete/app    qyro:qyro 755   ← o que o nginx serve; único alvo do rsync
/srv/verbete/bin    root:root 755   ← deploy-wrapper.sh, que o qyro executa e não reescreve
```

O dono importa: se `/srv/verbete` fosse do `qyro`, um deploy conseguiria trocar
`app` por um link simbólico e escapar do diretório.

- **Espera encontrar:** o usuário `qyro` na VPS; `deploy/vps/deploy-wrapper.sh`
  no repositório.
- **O script roda os testes do wrapper antes de instalar** e confere o sha256
  depois de instalar.
- **Deu certo quando:** o `ls -la` no fim mostra os donos acima e
  `-rwxr-xr-x root root deploy-wrapper.sh`.
- Cria um `index.html` provisório ("Em breve") só para o site responder 200
  antes do primeiro deploy. O primeiro `rsync --delete` o apaga.
- **Desfazer:** `sudo rm -rf /srv/verbete` (nada mais depende dele).

### 4. Vhost do nginx — **o passo perigoso**

```bash
bash deploy/vps/04-nginx.sh
```

Instala `deploy/nginx/verbete` em `/etc/nginx/sites-available/verbete` + symlink.

- **Espera encontrar:** o certificado do passo 2 já cobrindo `*.devduraes.com.br`
  (o script verifica com `openssl x509` e aborta se não).
- **A rede de segurança:** `nginx -t` **antes** de qualquer reload; se falhar,
  o script remove o symlink e refaz o teste, para a configuração da máquina
  voltar a ser válida na hora — e não só quando alguém recarregar o nginx horas
  depois (o deploy hook do certbot recarrega sozinho numa renovação). Depois do
  reload, consulta os quatro vizinhos em 127.0.0.1.
- **Deu certo quando:** `nginx: configuration file ... test is successful`,
  `systemctl reload nginx` sem erro, e a lista no fim mostra os quatro vizinhos
  mais o verbete respondendo.
- **Desfazer:** `sudo rm /etc/nginx/sites-enabled/verbete && sudo nginx -t &&
  sudo systemctl reload nginx`.

Sobre o vhost — as escolhas estão comentadas no próprio arquivo, mas as três
que mais importam:

- **Nenhum bloco na porta 80.** O redirect 301 é do catch-all do qyro
  (`listen 80 default_server`), e um segundo `default_server` quebra o
  `nginx -t`. Nada de `default_server` na 443 também — esse é do amgseg, com
  `return 444`.
- **`listen 443 ssl;` + `http2 on;`**, e não `listen 443 ssl http2;`: no nginx
  1.26.3 a forma combinada é obsoleta e adiciona um `[warn]` a todo `nginx -t`.
  Mesma escolha do amgseg e do rpg.
- **Cache, a parte delicada, porque isto é um PWA.** `index.html`, `sw.js` e
  `manifest.webmanifest` com `no-store, must-revalidate`; `/assets/*` (nomes com
  hash do Vite) com `expires 1y` + `public, immutable`. O nossario aprendeu a
  primeira parte na marra em 29/07, com HTML velho preso no celular de uma
  visitante; com service worker é pior, porque um `sw.js` em cache serve um
  build velho para sempre.

- **Nada de dotfile é servido** (`location ~ /\. { return 404; }`). O `dist/`
  não tem nenhum hoje, mas a chave de deploy escreve nessa raiz: um `.env` ou
  um `.git/` que caísse ali seria servido inteiro. A regra de `/assets/` é um
  prefixo simples e não `^~` justamente para o nginx continuar consultando essa
  regex — com `^~` um `/assets/.env` passaria por cima dela.

> `add_header` **não** soma: qualquer `location` que declara um `add_header`
> próprio perde todos os herdados do `server`. Por isso os quatro cabeçalhos de
> segurança aparecem repetidos em cada `location` do arquivo. Se você adicionar
> um cabeçalho só no `server`, ele não vale para quase nada do site.

### 5. Chave de deploy restrita

```bash
bash deploy/vps/05-deploy-key.sh
```

Gera `~/.ssh/verbete_deploy` e prende a pública no `authorized_keys` da VPS:

```
restrict,command="/srv/verbete/bin/deploy-wrapper.sh" ssh-ed25519 AAAA... verbete_deploy
```

- **Espera encontrar:** o wrapper já em `/srv/verbete/bin/` (passo 3).
- **Deu certo quando:** as seis tentativas de abuso no fim aparecem todas como
  `recusado` (shell, comando qualquer, ler o `.env` do qyro, rsync de leitura,
  rsync para o diretório do wrapper, rsync com `..`), e o ensaio legítimo
  (`rsync --dry-run`) passa.
- **Desfazer:** apagar a linha `verbete_deploy` do `~/.ssh/authorized_keys` na
  VPS (o script guarda um `.bak` datado antes de mexer).

### 6. Verificar

```bash
bash deploy/vps/06-verificar.sh
```

Pela internet, passando pela Cloudflare. Confere: `HTTP/2 200`, `no-store` no
HTML / `sw.js` / manifest, `application/manifest+json` no manifest, `immutable`
num asset com hash, os quatro cabeçalhos de segurança, o fallback de deep link,
**os quatro sites vizinhos ainda respondendo**, e na VPS o certificado e o
`nginx -t`.

Vale rodar de novo depois de todo deploy.

## O deploy em si

Não faz parte do provisionamento, mas é o motivo dele. O comando é este, e o
destino tem de bater **exatamente** com o que o wrapper permite:

```bash
pnpm build
rsync -rlptz --delete -e "ssh -i ~/.ssh/verbete_deploy -o BatchMode=yes" \
  dist/ qyro@179.198.97.215:/srv/verbete/app/
```

Acrescente `--dry-run` para ensaiar. Depois, `bash deploy/vps/06-verificar.sh`.

Funciona tanto com o `/usr/bin/rsync` do macOS (openrsync, que manda as opções
soltas) quanto com o GNU rsync 3.x de um runner de CI (que manda um bloco
compactado, `-logDtprze.iLsfxCIvu`). As duas formas foram capturadas dos
clientes de verdade e estão fixadas como casos em `test-deploy-wrapper.sh`.

**O wrapper só aceita `/srv/verbete/app/` ou `/srv/verbete/app`.** Qualquer
outra grafia — uma subpasta, uma barra dupla, um `..` — é recusada de
propósito: aceitar o prefixo `/srv/verbete/*` deixaria um deploy sobrescrever o
próprio wrapper. Se você mudar o comando de deploy, mude
`deploy/vps/deploy-wrapper.sh` junto, rode `test-deploy-wrapper.sh` e refaça o
passo 3. Essa fricção é intencional.

## Pegadinhas conhecidas

- **Nuvem cinza = site fora do ar.** O ufw só abre 80/443 para a Cloudflare.
- **`reload`, nunca `restart`.** Um restart com configuração quebrada deixa os
  cinco sites fora; um reload recusa a configuração nova e mantém a antiga
  rodando.
- **`certbot renew --dry-run` não executa deploy hooks.** Testar o hook exige
  chamá-lo na mão com `RENEWED_LINEAGE` definido — é o que o passo 2 faz.
- **Um 404 sob `/assets/` não carrega `Cache-Control`.** `add_header … always`
  dispara também em resposta de erro, enquanto `expires` não — juntos faziam um
  404 anunciar `public, immutable` sem `max-age` nenhum ao lado. Por isso o
  `add_header` das localizações de cache **não** leva `always`; o dos quatro
  cabeçalhos de segurança leva.
- **Dois `Cache-Control` nos assets.** `expires 1y` emite
  `Cache-Control: max-age=31536000` e o `add_header` emite
  `public, immutable`; o cliente junta os dois campos (RFC 9111). O efeito é
  `max-age=31536000, public, immutable`. Está certo, só parece estranho no
  `curl -I`.
- **`.webmanifest` não está no `mime.types` desta VPS** (conferido: só existe
  `application/json json;`). Sem o `default_type` do vhost ele sairia como
  `application/octet-stream`.
- **Primeiro acesso depois de trocar o DNS** pode levar 1–2 minutos para a
  Cloudflare enxergar a origem.
- **`disable_symlinks on;` no vhost não é enfeite.** Medido nesta configuração:
  sem ele, um `segredo.txt -> /etc/passwd` colocado na raiz web é servido
  inteiro por HTTPS — e nesta máquina isso significa que o
  `/srv/qyro/shared/.env` fica a um deploy de ser público. O rsync padrão leva
  `-l`, então um link simbólico no artefato chega inteiro do outro lado.
- **`--secluded-args` (`-s`) é recusado** pelo wrapper: essa opção tira os
  caminhos da linha de comando e os manda pelo protocolo, onde a checagem de
  destino não teria o que olhar. Não é o padrão em nenhuma versão de rsync —
  conferido no 3.4.1 da própria VPS — mas se um dia o deploy passar a usá-la,
  vai falhar aqui de propósito.
