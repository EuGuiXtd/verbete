# Verbete

Jogo de palavras em português (cinco letras, no molde do Termo/Wordle), estático — Vite +
React + TypeScript, sem backend nem banco. É um PWA: instalável, jogável offline. Roda em
`verbete.devduraes.com.br`.

## Desenvolvimento

```bash
pnpm install
pnpm dev            # servidor de desenvolvimento
pnpm test           # testes unitários (Vitest)
pnpm test:e2e       # build de produção + Playwright
pnpm sources:fetch  # baixa data/raw/*.txt (gitignored, não versionado)
pnpm dict:build     # regenera o dicionário a partir de data/raw/*
pnpm dict:check     # LOCAL apenas: confere se o dicionário commitado bate com um build fresco
pnpm dict:verify    # CI-safe: confere as invariantes do dicionário já commitado, sem rede
```

## CI/CD

Fluxo: `feature → dev → PR → main → deploy`. Só `main` publica.

| Workflow | Gatilho | O que faz |
|---|---|---|
| `.github/workflows/ci.yml` | push em `dev`/`main`, e todo PR | `install` → `typecheck` → `lint` → `test` → `dict:verify` → `build` |
| `.github/workflows/deploy.yml` (job `e2e`) | PR contra `main`, e push em `main` | build de produção + Playwright (e2e) |
| `.github/workflows/deploy.yml` (job `deploy`) | só push em `main`, depois do job `e2e` passar | rsync para a VPS → confere `HTTP/2 200` |
| `.github/workflows/branch-policy.yml` | PR contra `main` | recusa qualquer PR para `main` que não venha da branch `dev` deste mesmo repositório (nunca de um fork) |

Os testes e2e (Playwright) rodam num PR contra `main` (pega o problema antes do merge, no
lugar de deixar `main` vermelho e sem deploy) **e de novo** no push em `main`, antes do rsync
— de propósito redundante ("cinto e suspensório"): o job `deploy` depende do job `e2e` ter
passado *nesse mesmo commit*, então nem uma configuração de branch protection mal ajustada
("require branches to be up to date") deixa um erro de tipo ou um teste quebrado chegar ao
`rsync`. Não rodam a cada push de feature branch: exigem baixar o Chromium (lento, e este é um
projeto pessoal) e o valor deles é justamente pegar algo perto do momento em que vai ao ar, não
a cada WIP.

`dict:check` (regeneração completa a partir de `data/raw/*`) **não roda em CI** — `data/raw/`
é gitignored e não existe num checkout limpo, e mesmo com `pnpm sources:fetch` seria uma fonte
de flake, porque a dump do Wiktionary usada ali é atualizada pelo kaikki de tempos em tempos:
um CI que fica vermelho pelo calendário de release de outro projeto é pior que não ter o
check. `dict:verify` roda em todo push porque é local e rápido (sem rede, sem browser): reusa
as mesmas invariantes que o build já checa antes de escrever os arquivos, contra os arquivos
já commitados.

### Segredos necessários (Settings → Environments → `production` → Secrets)

Guarde os quatro secrets abaixo no ambiente (**Environment**) `production`, não como secret de
repositório — isso restringe quem pode ler cada um a jobs que declarem
`environment: production` (só o job `deploy`), mesmo que outro workflow neste repositório
venha a existir no futuro.

| Secret | Conteúdo |
|---|---|
| `VPS_SSH_KEY` | chave privada `verbete_deploy` (gerada por `deploy/vps/05-deploy-key.sh`) |
| `VPS_HOST` | IP ou hostname da VPS |
| `VPS_USER` | usuário SSH na VPS (`qyro`) |
| `VPS_HOST_KEY_FINGERPRINT` | fingerprint SHA256 da chave de host da VPS — ver abaixo |

**Como obter o `VPS_HOST_KEY_FINGERPRINT`:** o workflow de deploy busca a chave de host da VPS
a cada execução (`ssh-keyscan`), mas só confia nela se bater com este fingerprint — isso evita
que um runner do GitHub confie cegamente na primeira chave que responder na porta 22
(`StrictHostKeyChecking=accept-new`/`no` não protegem disso). Obtenha o fingerprint direto na
VPS, por um canal já confiável (a chave `qyro_vps` usada no provisionamento):

```bash
ssh -i ~/.ssh/qyro_vps qyro@<host> "ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub" | awk '{print $2}'
```

Guarde a saída (`SHA256:...`) como o secret. Se a VPS trocar de chave de host algum dia
(reinstalação, por exemplo), refaça este passo e atualize o secret — do contrário o deploy
falha de propósito, recusando um host que não bate com o fingerprint esperado.

### Configuração de repositório necessária (manual, não é feita por workflow)

- **Ambiente `production`** (Settings → Environments → New environment): crie um ambiente
  chamado `production`, coloque os quatro secrets acima nele, e em "Deployment branches and
  tags" restrinja para `main` apenas. É o único controle desta lista que editar o arquivo do
  workflow não consegue contornar sozinho — ele é aplicado fora do repositório de código.
- **Branch protection / ruleset em `main`:** bloquear push direto (só merge de PR permitido) e
  exigir que os checks `CI / Typecheck, lint, test, build`, `Deploy / Build and e2e test` e
  `Branch policy / PRs into main must come from dev` passem antes do merge. Os nomes são os
  `name:` dos jobs, que é como o GitHub reporta cada check — o id do job (`test`, `e2e`,
  `check-source-branch`) não casa com nada no ruleset e deixaria o PR parado em "Expected —
  waiting for status to be reported" para sempre. Um workflow não consegue aplicar isso sozinho — um push que pula o PR
  também pula o workflow que reclamaria dele.
  - **"Require branches to be up to date before merging"**: recomendado, mas não é a única
    proteção — `deploy.yml`'s job `deploy` já exige (via `needs: e2e`) que typecheck, lint,
    teste e e2e tenham passado nesse exato commit antes de rsyncar, então mesmo sem esse toggle
    ligado um commit quebrado não chega à VPS por este pipeline. O toggle ainda vale a pena
    pelo motivo de sempre: evita que `main` acumule um merge com conflito semântico que nenhum
    dos dois lados via sozinho.
- Sem essas coisas configuradas à mão, o `branch-policy.yml` e o `ci.yml` só *avisam*; quem faz
  cumprir é o ruleset e o ambiente.

Provisionamento da VPS (DNS, certificado, nginx, layout, chave de deploy): ver
`deploy/vps/README.md` — esse arquivo é só o runbook de infraestrutura da VPS, não fala de
configuração do GitHub, que é toda documentada aqui.
