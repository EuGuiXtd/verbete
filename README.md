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
pnpm dict:build     # regenera o dicionário a partir de data/raw/*.txt
pnpm dict:check     # confere que o dicionário commitado está atualizado
```

## CI/CD

Fluxo: `feature → dev → PR → main → deploy`. Só `main` publica.

| Workflow | Gatilho | O que faz |
|---|---|---|
| `.github/workflows/ci.yml` | todo push e PR | `install` → `typecheck` → `lint` → `test` → `dict:check` → `build` |
| `.github/workflows/deploy.yml` | push em `main` | build de produção + Playwright (e2e) → rsync para a VPS → confere `HTTP/2 200` |
| `.github/workflows/branch-policy.yml` | PR contra `main` | recusa qualquer PR para `main` que não venha de `dev` (ou de um fork) |

Os testes e2e (Playwright) rodam só no `deploy.yml`, não a cada push: exigem baixar o
Chromium (lento, e este é um projeto pessoal) e só têm algo novo para pegar uma vez por merge
em `main` — bem menos frequente que os pushes de uma branch de feature. `dict:check` roda em
todo push porque é local e rápido (sem rede, sem browser).

### Segredos necessários (Settings → Secrets and variables → Actions)

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

- **Branch protection / ruleset em `main`:** bloquear push direto (só merge de PR permitido) e
  exigir que os checks `CI` e `Branch policy` passem antes do merge. Um workflow não consegue
  aplicar isso sozinho — um push que pula o PR também pula o workflow que reclamaria dele.
- Sem essas duas coisas configuradas à mão, o `branch-policy.yml` e o `ci.yml` só *avisam*;
  quem faz cumprir é o ruleset.

Provisionamento da VPS (DNS, certificado, nginx, layout, chave de deploy): ver
`deploy/vps/README.md`.
