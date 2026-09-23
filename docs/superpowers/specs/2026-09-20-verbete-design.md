# Verbete — jogo de palavras em PT-BR

## Contexto

Guilherme quer um jogo pessoal de adivinhação de palavras em português, inspirado na mecânica do [term.ooo](https://term.ooo/) (que por sua vez deriva do Wordle). É um projeto de diversão, sem fim comercial.

Duas coisas explicitamente **não** devem ser copiadas do term.ooo:
1. **O visual** — quer identidade própria, mais atraente e com melhor usabilidade.
2. **O limite de uma palavra por dia** — quer poder jogar à vontade.

Do term.ooo também não se copia **código nem lista de palavras** — a mecânica de dedução é ideia livre, mas a expressão é deles. Tudo aqui é escrito do zero, sobre léxico de licença aberta.

O jogo se chama **Verbete** e ganha uma virada de conceito própria: ao revelar a resposta, mostra a **definição de dicionário** da palavra. O nome, o visual e a recompensa passam a contar a mesma história — cada partida é uma entrada de dicionário que você desencava.

**Destino:** `verbete.devduraes.com.br`, na VPS Hostinger que já hospeda qyro, amgseg, nossario e (em breve) o RPG.

## Análise do original (term.ooo)

Levantada no navegador em 2026-09-20. Mecânica confirmada:

- Palavra de 5 letras, 6 tentativas
- Feedback por casa: verde (letra e posição corretas), amarelo (letra existe em outra posição), cinza (letra ausente)
- Teclado virtual espelha o estado de cada letra
- **Sem tecla `Ç` e sem acentos**: entrada é só A–Z; o jogo preenche os diacríticos na revelação e eles **nunca contam como dica**
- Palpite inválido → toast `"essa palavra não é aceita"` + shake, sem consumir tentativa
- Ajustes: alto contraste e modo difícil
- Estatísticas: jogos, % vitórias, sequência atual, melhor sequência, distribuição 1–6 + derrota
- Variantes: `termo` (1 tabuleiro), `dueto` (2 simultâneos), `quarteto` (4 simultâneos) — um palpite alimenta todos
- Uma palavra por dia, igual pra todos

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Nome | **Verbete** |
| Domínio | `verbete.devduraes.com.br` |
| Variantes | Solo (1 tabuleiro), Dueto (2), Quarteto (4) |
| Modos | **Diário** (palavra determinística pela data, com sequência) e **Infinito** (aleatória, sem limite) — ambos disponíveis nas três variantes |
| Arquitetura | Site **100% estático**. Sem backend, sem banco, sem login. |
| Stack | Vite + React 19 + TypeScript strict + Tailwind, pnpm, Node 20 |
| Testes | Vitest (motor) + Playwright (e2e) |
| PWA | Completo — instalável e jogável offline |
| Tema | Claro e escuro, seguindo o sistema, **com botão** para forçar |
| Acessibilidade | Baseline sólido: teclado físico, anúncio por leitor de tela, `prefers-reduced-motion`, contraste AA, verde/amarelo distinguíveis também por luminosidade |
| Tentativas | Solo 6 · Dueto 7 · Quarteto 9 |
| Respostas | **Só formas de dicionário** — substantivo, adjetivo, advérbio ou verbo no infinitivo. Conjugações e plurais continuam aceitos como palpite, mas nunca são a resposta. Isso evita perder para `VIRAM` e é o que torna a definição possível. |
| Extras | Compartilhar resultado em emoji · histórico de partidas · **definição da palavra ao fim de toda partida**, ganhando ou perdendo |
| Licenças | Léxico sob MPL-1.1 (derivado do VERO) · definições sob CC BY-SA 4.0 (Wikcionário) · código do jogo livre |
| Fora de escopo | Contas, ranking online, modo difícil, paleta de daltonismo, tamanho de palavra variável (candidatos a fase 2) |
| Deploy | Repo no GitHub · Actions · `feature → dev → PR → main → deploy` |

## Direção visual

Direção escolhida: **tátil/física**, que o nome recortou para **tipografia móvel / letterpress**. Não é brinquedo de plástico — é oficina gráfica: tipos prensados em papel de algodão, tinta que encorpa na borda da letra, caixa baixa, serifa.

### O conceito: tinta é a dica

O feedback abandona o semáforo verde/amarelo/cinza e passa a ser **cobertura de tinta** num bloco de tipo. Cada casa é um *sorte* — o bloco de metal com a letra em relevo.

| Estado | Tratamento | |
|---|---|---|
| Letra certa, lugar certo | Bloco totalmente entintado em preto de tipografia, letra vazada em papel | peso máximo |
| Letra existe, lugar errado | Bloco entintado em vermelho rubi, letra vazada em papel | matiz e valor distintos |
| Letra ausente | Bloco sem tinta: só o afundamento cego no papel, letra em cinza fantasma | ausência de tinta = ausência da letra |

Os três estados se separam **em escala de cinza** (escuro / médio / papel), não só por matiz. Isso entrega acessibilidade de cor sem precisar de uma paleta de daltonismo separada, e dá ao jogo uma linguagem visual que nenhum outro clone tem.

### Por que não o caminho óbvio

Creme `#F4F1EA` com serifa de alto contraste e acento terracota `#D97757` é o padrão mais reconhecível de interface gerada por IA. Como "paleta quente" e "serifa" são requisito seu, a saída não é trocar de direção, é ser específico dentro dela: papel de algodão **cinza-quente** em vez de creme amarelado, e **tintas spot de gráfica** (preto morno, vermelho rubi) em vez de terracota.

### Tokens iniciais

Claro — *papel*:
```
paper        #E9E4DA   papel de algodão, cinza-quente (não creme)
paper-recess #DED7CA   casa vazia, afundada
ink          #23201C   preto de tipografia, morno
ink-red      #A8323C   vermelho rubi, encorpado como tinta em papel não revestido
ghost        #9A9288   letra descartada
```
`ink-red` sobre `paper` dá ~5.9:1 — passa AA.

Escuro — *leito da prensa*: a metáfora inverte para a matriz de metal sob luz baixa; base `#1A1815`, tintas claras. Valores finais definidos na implementação, com screenshot de conferência.

### Princípios

- **Uma tipografia só**, um serif variável com corpo suficiente para sobreviver à impressão — **Newsreader** é a primeira escolha (tem eixo óptico, é morno e não é a serifa-padrão de todo projeto). Wordmark em caixa baixa, seguido de `s.m.` como cabeçalho de verbete real.
- **A página é uma entrada de dicionário.** A estrutura do verbete é o dispositivo de layout, não decoração: cabeça corrente no topo, a grade onde ficaria a palavra-entrada, a definição se compondo embaixo.
- **Revelar é prensar.** A casa afunda e volta com a tinta aplicada — não é flip de cartão.
- **Teclas com curso real.** `:active` desloca e colapsa a sombra; vibração curta no mobile.
- **Um único momento orquestrado:** a vitória. Os blocos dão a última prensada e a definição se compõe abaixo, como a entrada sendo impressa. Fora isso, movimento só responde a ação do jogador, e tudo respeita `prefers-reduced-motion`.

Os valores finais de escala tipográfica, cor e curva de animação saem na primeira fatia da implementação, conferidos por screenshot.

## Arquitetura de código

### Regra de dependência

**`engine/` não importa nada além de `engine/`.** Sem React, sem DOM, sem `localStorage`, sem `Date.now()`, sem `Math.random()`. Toda a lógica de jogo é testável sem renderizar nada.

```
engine/   puro e determinístico
   ↑
data/  storage/
   ↑
state/    hooks React
   ↑
ui/       componentes
```

A regra é **aplicada, não só documentada**: ESLint `import/no-restricted-paths` mais um teste de arquitetura de ~15 linhas que lê os fontes de `src/engine/**` e falha se achar `window`, `document`, `localStorage`, `navigator`, `Date.now`, `Math.random` ou `react`.

### Módulos do motor

| Módulo | Propósito único |
|---|---|
| `normalize.ts` | `"Lição"` → `"LICAO"`. Uma função cobre acento e cedilha. |
| `score.ts` | Feedback de duas passadas. `scoreGuess(guess, answer)` sobre ASCII. |
| `match.ts` | Reducer da partida multi-tabuleiro. O coração. |
| `keyboard.ts` | Estado agregado das teclas, por tabuleiro. |
| `rng.ts` | `xmur3` + `mulberry32`. `Math.imul` e `>>>0` em toda operação — é o que garante resultado idêntico em V8, JSC e SpiderMonkey. |
| `clock.ts` | Toda aritmética de data em America/Sao_Paulo. Nenhum outro módulo chama `new Date()`. |
| `daily.ts` | Derivação determinística das palavras do dia. |
| `stats.ts` | Agregação pura de estatísticas. |
| `share.ts` | Grade de emoji como string (não chama `navigator.share` — isso é UI). |

### O modelo de estado

A escolha que faz Solo ser N=1 **sem nenhum código especial**: **os palpites não pertencem aos tabuleiros, pertencem à partida.** Cada tabuleiro guarda só a sua resposta e em que palpite foi resolvido. As linhas exibidas são derivadas.

```ts
interface BoardState {
  readonly answer: string;          // forma ACENTUADA: "LIÇÃO"
  readonly answerNorm: string;      // "LICAO"
  readonly solvedAt: number | null; // índice do palpite que resolveu
}

interface MatchState {
  readonly variant: Variant;        // 'solo' | 'dueto' | 'quarteto'
  readonly mode: Mode;              // 'diario' | 'infinito'
  readonly dayKey: string | null;   // "2026-09-20" no diário, null no infinito
  readonly boards: readonly BoardState[];   // length 1, 2 ou 4
  readonly guesses: readonly string[];      // NORMALIZADOS, comuns a todos
  readonly draft: string;
  readonly status: 'playing' | 'won' | 'lost';
  readonly maxAttempts: number;
}

const VARIANTS = {
  solo:     { boards: 1, attempts: 6 },
  dueto:    { boards: 2, attempts: 7 },
  quarteto: { boards: 4, attempts: 9 },
};
```

Não existe `if (variant === 'solo')` em lugar nenhum do motor. Tabuleiro resolvido congela de graça: `boardRows()` para de produzir linhas depois de `solvedAt`.

O reducer é puro mas devolve **efeitos** junto com o estado — é assim que ele diz "rejeitado, treme a linha" sem tocar no DOM:

```ts
type Effect =
  | { type: 'REJECTED'; reason: 'too_short' | 'not_in_dictionary' | 'already_guessed' }
  | { type: 'ACCEPTED'; guessIndex: number }
  | { type: 'BOARD_SOLVED'; boardIndex: number; guessIndex: number }
  | { type: 'FINISHED'; status: 'won' | 'lost' };

function reduce(state: MatchState, action: Action, deps: EngineDeps): Transition;
```

Palpite inválido não gasta tentativa porque o reducer devolve o **mesmo objeto** mais um efeito `REJECTED` — assertável com `expect(next.state).toBe(prev.state)`. O dicionário é injetado, então os testes de partida rodam com `isValidGuess: () => true` e nunca carregam 10 mil palavras.

**A animação de revelação é estado de UI, não de motor.** O reducer é instantâneo; um `isRevealing` no React trava a entrada por ~1,5s. Se isso vazasse pro motor, todo teste de reducer viraria assíncrono.

### Sorteio do diário

Não `dia % N` — isso é previsível de cabeça e faz as variantes andarem em lockstep. Em vez disso, **baralho embaralhado**: permuta o pool inteiro com semente derivada do ciclo e consome sequencialmente, o que garante a propriedade que sorteio aleatório não dá: nenhuma repetição até o pool esgotar.

Os 7 slots do dia (1 solo + 2 dueto + 4 quarteto) vêm de **um fluxo único**, então nenhuma palavra se repete nem entre tabuleiros da mesma variante nem entre variantes no mesmo dia. Simulado: 214 dias, 1.498 palavras distintas de um pool de 1.500, zero colisão.

> **Decisão:** fluxo único, com `SLOT_OFFSET` documentado como *append-only*. A alternativa (baralho por variante) seria mais extensível, mas deixaria Solo e Dueto sortearem a mesma palavra em ~0,5% dos dias. Como não há plano de novas variantes, vale a garantia mais forte.

**Virada de dia com o jogo aberto** precisa de três gatilhos, porque nenhum sozinho é confiável: `setTimeout` até a meia-noite (falha se o aparelho dormir), `visibilitychange` e `focus`. Partida diária em andamento **não é destruída** — aparece um aviso "chegou o verbete de hoje" com botão. Trocar o tabuleiro debaixo de alguém no 4º palpite é hostil.

### Dicionário: 13 KB para 10 mil palavras

Cada palavra de 5 letras ASCII vira um inteiro base-26 (`26⁵` cabe em 24 bits). Ordena, guarda as **diferenças** entre consecutivos como varint, codifica em base64, inline no bundle.

| Codificação | Gzip |
|---|---|
| Array JSON | 27,6 KB |
| String concatenada com slice fixo | 24,5 KB |
| **Delta-varint base-26 em base64** | **13,3 KB** |

Medido: decodifica 9.981 entradas em **1,09 ms**, `Int32Array` de 40 KB em heap (contra ~1 MB de um `Set` de strings), busca binária em ~14 comparações. Inline em vez de asset separado: economizaria 1,1 KB e custaria um round trip, um estado de carregamento e uma entrada no precache do service worker.

Descartados: trie (para palavras de tamanho fixo e curto o overhead de ponteiros supera o ganho, e o gzip já captura a redundância de prefixo) e Bloom filter (falso-positivo aceitaria não-palavra — inaceitável num jogo de palavras).

As **respostas** ficam num array simples de strings acentuadas (~4 KB gzip). Não vale codificar: precisa dos acentos, precisa ser exibida, e é pequena.

### Geração do dicionário

`scripts/build-dictionary.ts`, rodado por `pnpm dict:build`, lê `data/raw/*.txt` e emite arquivos `.generated.ts` **commitados** (build reproduzível, sem dependência de rede). O CI roda `dict:check`, que regenera e faz diff.

Asserções que falham o build:
- Toda resposta normalizada existe no dicionário de palpites (senão a resposta é injogável)
- Toda entrada casa `/^[A-Z]{5}$/` após normalizar
- **Sem duplicatas após normalização no pool de respostas** — `SABIÁ`, `SÁBIA` e `SABIA` não podem coexistir como respostas, senão o jogador acerta e o jogo revela outra palavra
- `ANSWERS.length >= DAILY_POOL_SIZE`

### Persistência

Chaves separadas por fatia (um palpite reescreve ~1 KB, não o histórico inteiro), com a versão no payload e não na chave:

```
verbete:meta · verbete:prefs · verbete:history · verbete:recent:<variante>
verbete:progress:<variante>:<modo>    (6 chaves)
verbete:stats:<variante>:<modo>       (6 chaves)
```

O **diário não guarda as respostas** — são deriváveis do `dayKey`. Guarda um `answersHash`; se ao retomar o hash não bater (a lista mudou num deploy), descarta a partida em vez de dar feedback errado. O **infinito guarda** as respostas, porque são aleatórias.

`safeStorage` sonda o `localStorage` uma vez na inicialização e cai para um `Map` em memória se falhar (modo privado do Safari, iframe com storage bloqueado). Em `QuotaExceededError`, escalona: poda histórico → poda listas de recentes → descarta partidas concluídas → memória, com um aviso discreto e permanente de que o progresso não será salvo. Fatia corrompida vai para quarentena e devolve `null` — se `stats` quebrar, você ainda joga.

### Testes

**Letras repetidas** (`C` correta, `P` presente, `-` ausente):

| Palpite | Resposta | Esperado | |
|---|---|---|---|
| ARARA | TERRA | `-P-CC` | 3 A no palpite, 1 na resposta |
| **ERRAR** | **TERRA** | **`PPCP-`** | **3 R contra 2 — o bug clássico** |
| NANAR | ANNAS | `PPCC-` | duas letras repetidas cruzadas |

Se só um teste de repetição existisse, seria `ERRAR`/`TERRA`. Mais uma propriedade em fast-check que pega a classe inteira de bugs de contagem: para toda letra, `corretas + presentes <= ocorrências na resposta`.

**Homógrafos:** `SABIA` tem que vencer tanto contra `SABIÁ` quanto contra `SÁBIA`, e a casa revela a forma acentuada da resposta, não a digitada.

**Reducer:** suíte parametrizada por `[solo, dueto, quarteto]` — é o teste de que N=1 não é caso especial.

**Playwright**, poucos e caros, com relógio e semente injetados por `addInitScript`: caminho feliz com compartilhamento · palpite inválido não consome tentativa · **reload no meio restaura o tabuleiro** (o que mais pega regressão) · quarteto com um tabuleiro congelado · estados do teclado no dueto · offline com service worker · virada de dia. Service worker desligado em todos menos o dele — é fonte crônica de flake.

## Dados: léxico e definições

Três conjuntos, todos de licença aberta e gerados por script reprodutível versionado no repo. Fontes verificadas em 2026-09-20.

### Fontes escolhidas

| Camada | Fonte | Licença | Papel |
|---|---|---|---|
| Palpites aceitos | **VERO pt_BR** (`pt_BR.dic` + `.aff` do LibreOffice), com afixos expandidos | `LGPL-3.0-only OR MPL-1.1` → **usar a via MPL-1.1** | redistribuído |
| Filtro gramatical | **DELAF_PB** (Unitex-PB, NILC/USP) | LGPLLR | só no build |
| Ranking de frequência | **OpenSubtitles pt_br_50k** (hermitdave) + **wordfreq** + **Leipzig** | CC BY-SA / Apache / CC BY 4.0 | só no build, nunca embarcado |
| Respostas | subconjunto do léxico acima | herda MPL-1.1 | redistribuído |
| Definições | **kaikki.org / ptwiktionary** (Wiktextract), 565 mil acepções, atualizado a cada poucos dias | **CC BY-SA 4.0** | redistribuído |

**Por que a via MPL-1.1 e não a LGPL:** a licença dupla é escolha do usuário, e a MPL é copyleft *por arquivo* — só os arquivos que contêm o material derivado ficam MPL; React, CSS e a lógica do jogo ficam com a licença que você quiser. Aplicar LGPL a dado não-código gera discussão sobre o que significa "linkar".

### Fontes descartadas, e por quê

- **`ramalho/palivres`** — declara MIT mas inclui o `volp2016.txt`, que é a obra da Academia Brasileira de Letras. Ninguém pode relicenciar em MIT dado proprietário de terceiro. É o padrão a desconfiar: várias listas "MIT" no GitHub são derivadas do VERO ou de obra fechada.
- **`fserb/pt-br`** — declara MIT sem documentar procedência. Serve de conferência, não de base jurídica.
- **`br.ispell`** — GPL-2.0, **incompatível com MPL-1.1** (a 1.1 não tem a cláusula de compatibilidade que a 2.0 tem). Se faltar cobertura, o fallback é `pythonprobr/palavras`, que é MPL-2.0 e compatível.
- **LexPorBR** — linguisticamente a melhor base (traz classe gramatical e contagem de letras prontas), mas é **CC BY-NC-SA**. Só validação manual.
- **dicio.com.br, Michaelis, Priberam, Aulete Digital** — proprietários.
- **Wikidata Lexemes** — licença perfeita (CC0), mas só 4.794 acepções em português contra 565 mil do Wikcionário.

### Pipeline de extração

`scripts/build-dictionary.ts`, com a saída commitada:

1. **Expandir afixos.** O `.dic` só tem lemas com flags; as conjugações moram nas regras do `.aff`. Sem expandir, perde-se quase todo verbo de 5 letras.
   **Usar `hunspell-reader` (npm, MIT), não `unmunch`** — o `unmunch` é deprecado e single-byte, e o `pt_BR.aff` declara `FLAG UTF-8`.
2. **Filtrar para 5 letras.** Normalizar para **NFC antes de medir** — no macOS o `ç` costuma vir decomposto e `"maçã".length` dá 6, o que descartaria silenciosamente toda palavra acentuada.
3. **Descartar** hífen, apóstrofo, dígito, tokens só em caixa alta (siglas) e tudo marcado com `FORBIDDENWORD` no `.aff`.
4. **Tirar nomes próprios** cruzando com o DELAF_PB por classe gramatical, em vez de heurística de maiúscula.
5. **Medir** o tamanho da lista A. A estimativa de 8–15 mil é hipótese, não fato — a expansão do português gera muita forma verbal curta.
6. **Ranquear** por média dos três corpora e cortar o topo.
7. **Restringir a formas de dicionário** (decisão de produto): substantivo, adjetivo, advérbio ou verbo no infinitivo. Conjugações continuam aceitas como palpite, nunca como resposta. Isso também é o que torna a definição possível — conjugação não tem verbete próprio.
8. **Higienizar**: a flag `NOSUGGEST` do `.aff` é um bom proxy pronto para ofensa, complementado por lista de bloqueio manual.
9. **Revisão humana por amostragem** (~100 palavras) para calibrar o corte, com lista de bloqueio para o que escapar.

> **Atenção ao acento nas duas pontas:** NFC para medir e armazenar a forma exibida; NFD com remoção de marcas combinantes para gerar a chave de comparação. São usos diferentes da mesma palavra, e trocá-los é bug silencioso.

### Definições

Do JSONL do kaikki, campo da primeira acepção, truncado em ~90 caracteres. ~2.000 definições dão ~190 KB cru e **~55–70 KB comprimido**.

**Servir em chunk separado, sob demanda.** O jogador precisa de uma definição por partida, e só no fim — o bundle inicial não paga nada, e o service worker pré-cacheia o chunk uma vez para o offline continuar funcionando.

**Revisão manual é obrigatória aqui**, por um motivo específico do jogo: o Wikcionário tem glosas circulares que entregam a resposta. A definição de *casar* que começa com "casar-se" estraga a partida. Toda definição precisa passar por um teste automático que rejeita glosa contendo a própria palavra (ou seu radical), mais uma passada humana.

### Obrigações de licença

A CC BY-SA das definições **não contamina o código**: o ShareAlike incide sobre obra derivada, e juntar dados e código num site é agregação, não adaptação. Na prática:

| Artefato | Licença |
|---|---|
| `data/definicoes.json` | CC BY-SA 4.0 — obrigatório |
| listas de palavras | MPL-1.1 |
| React, CSS, lógica, service worker | a que você quiser, inclusive fechada |

O site precisa exibir, numa tela "Sobre" ou rodapé: atribuição ao Wikcionário com link, indicação da licença com link, aviso de que houve adaptação (seleção da primeira acepção e encurtamento), e crédito ao VERO sob MPL-1.1. Melhor ainda: na tela de resultado, linkar `pt.wiktionary.org/wiki/<palavra>` — satisfaz a atribuição da forma mais robusta e ainda é útil pro jogador.

*Não é parecer jurídico. Para um projeto pessoal sem receita, a estrutura acima é o padrão que projetos open source usam há anos.*

## Infraestrutura

Sendo estático, o precedente certo na VPS é o **nossario** (nginx servindo arquivos, sem PM2 e sem banco) — e não o padrão Next/PM2/Postgres do qyro e do amgseg. Nada de processo Node em produção.

### Estado verificado da VPS (2026-09-20)

```
nginx sites-enabled:  amgseg · nossario · qyro · rpg
certificado devduraes.com.br:  devduraes.com.br, www.devduraes.com.br   ← SEM wildcard
DNS devduraes.com.br:  A apex → <IP da origem, nao versionado> (proxied) · CNAME www (proxied)
PM2:  qyro-web ×2, amgseg-web ×1   ← rpg-web NÃO existe
/srv:  amgseg · nossario · qyro · rpg
```

Ou seja: o RPG tem a infra provisionada mas o app nunca foi construído. O Verbete entra em subdomínio novo e não encosta em nada disso.

### Passos de provisionamento

Todos entram como scripts idempotentes em `deploy/vps/`, no modelo do `provision.sh` do RPG. **Escrita via SSH está bloqueada no modo auto**, então cada script é entregue para o Guilherme rodar com `! bash deploy/vps/<script>.sh`.

1. **DNS** — criar `verbete.devduraes.com.br` na Cloudflare como CNAME para o apex, **proxied**. Obrigatório: o ufw só libera 80/443 para as faixas da Cloudflare; registro cinza = site fora do ar.
2. **Certificado** — expandir a linhagem `devduraes.com.br` para incluir o wildcard:
   `certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare-devduraes.ini --dns-cloudflare-propagation-seconds 30 --key-type ecdsa --cert-name devduraes.com.br -d devduraes.com.br -d www.devduraes.com.br -d '*.devduraes.com.br'`
   Conferir que o deploy-hook `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` existe (um arquivo cobre todos os certificados). `certbot renew --dry-run` **não** executa deploy hooks — testar com `RENEWED_LINEAGE` na mão.
3. **Layout** — `/srv/verbete/app` (arquivos servidos, dono `qyro:qyro`) e `/srv/verbete/bin/deploy-wrapper.sh` (dono `root`, 755).
4. **Vhost** — `/etc/nginx/sites-available/verbete` + symlink, modelado no vhost do nossario.
5. **Chave de deploy** — par `verbete_deploy` novo, preso no `authorized_keys` com `restrict,command="/srv/verbete/bin/deploy-wrapper.sh"`.

### Regras de nginx que o vhost precisa respeitar

Extraídas do vhost do nossario e das convenções da máquina:

- **Só `listen 443 ssl http2`.** Nada na porta 80 — o redirect 301 é do catch-all do qyro; um segundo `default_server` quebra o `nginx -t`. Também sem `default_server` na 443 (é do amgseg, com `return 444`).
- `sudo nginx -t` antes de todo `reload`, e **`reload`, nunca `restart`** — um erro de sintaxe derruba os quatro sites juntos.
- `log_format` próprio com `$http_cf_connecting_ip` (atrás da Cloudflare, `$remote_addr` é sempre a borda).
- Headers com `always`: HSTS, `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy strict-origin-when-cross-origin`.
- **Cache — o ponto mais delicado, porque é um PWA:**
  - `index.html`, `sw.js` e `manifest.webmanifest` → `Cache-Control: no-store, must-revalidate`. O nossario aprendeu isso na marca em 29/07, com HTML velho grudado no celular de um visitante; num PWA o estrago é maior, porque service worker em cache serve build antiga para sempre.
  - `/assets/*` (nomes com hash do Vite) → `expires 1y; Cache-Control: public, immutable`.
- SPA fallback: `try_files $uri $uri/ /index.html;`

### Deploy

GitHub Actions, no mesmo desenho dos outros repos, menos o que não se aplica (sem migration, sem PM2, sem health check de banco):

- Fluxo `feature → dev → PR → main → deploy`, com `concurrency: deploy-production` e guarda de ref por `env:` (nunca interpolada no `run:`).
- Actions pinadas por SHA de commit, não por tag.
- `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm test` → `pnpm build` → um `rsync -az --delete dist/ → /srv/verbete/app/`.
- Secrets: `VPS_SSH_KEY` (a `verbete_deploy`), `VPS_HOST`, `VPS_USER`.
- **deploy-wrapper.sh** no modelo do RPG: `set -f`, `set -- $SSH_ORIGINAL_COMMAND`, `exec "$@"` (nunca `sh -c`); aceita só `rsync --server`; recusa `--sender` (rsync de leitura puxaria os `.env` dos outros projetos da máquina); recusa destino com `..`; lista **exata** do único destino permitido, nunca prefixo `/srv/verbete/*` — o prefixo deixaria sobrescrever o próprio wrapper. A VPS já foi perdida uma vez por chave de deploy irrestrita.
- Passo final do job: `curl -sI https://verbete.devduraes.com.br | head -1` deve dar `HTTP/2 200`.

## Ordem de implementação

Fatias verticais; cada uma termina verde, e da 5 em diante é deployável. A lógica mais arriscada (2–4) vem **antes de qualquer pixel**, que é justamente a parte 100% testável sem renderizar.

| # | Fatia | Entrega verificável |
|---|---|---|
| 1 | Scaffold e portões de qualidade | `pnpm test`, `lint`, `build` passam; ESLint boundaries e teste de arquitetura já ativos. A pasta de trabalho hoje se chama `Termo` — renomear para `verbete` antes de criar o repo. |
| 2 | **`normalize` + `score`** (TDD) | Tabela de repetidas e homógrafos verde. Zero UI. |
| 3 | Dicionário: extração, codec, membership | `isValidGuess('LICAO')` true; asserções de build ativas; bundle medido |
| 4 | **Reducer `match` genérico** | Suíte parametrizada rodando em solo **e** quarteto — prova a generalidade antes de existir UI multi-tabuleiro |
| 5 | **Primeiro jogável: Solo infinito** | Tabuleiro, teclado, entrada. Sem persistência, sem diário. Dá pra jogar. |
| 6 | Identidade visual | Tokens, tipografia, o sistema de tinta, tema claro/escuro. Conferido por screenshot. |
| 7 | Diário: clock, baralho, virada de dia | Solo diário com número do dia e aviso de virada |
| 8 | Persistência | Reload no meio restaura; migração e quarentena testadas |
| 9 | Definição na revelação | O momento de vitória completo |
| 10 | Stats, histórico, compartilhar | Modal de progresso e grade de emoji no clipboard |
| 11 | **Dueto + Quarteto (UI)** | Se 2–4 estiverem certos, é só layout e teclado segmentado. **Esta fatia é o teste da arquitetura** — se exigir mexer no motor, o modelo estava errado. |
| 12 | PWA: manifest, service worker, offline, atualização | Instalável, joga offline, avisa de versão nova |
| 13 | Acessibilidade e acabamento | `aria-live` nas revelações, foco visível, `prefers-reduced-motion` |
| 14 | Provisionamento e deploy | `verbete.devduraes.com.br` no ar |

## Riscos

**1. Qualidade da lista de respostas.** A de palpites pode ser permissiva e sai pronta da fonte; a de respostas não. A estratégia escolhida é automatizar por frequência e revisar uma amostra (~100 palavras) para calibrar o corte, aceitando que alguma palavra estranha escape e vire linha numa lista de bloqueio. O risco residual é uma resposta do dia constrangedora ou obscura. Mitigação barata: um item "essa palavra não devia estar aqui" na tela de resultado que copia a palavra pro clipboard, pra você colar na lista de bloqueio.

**1b. Glosas que entregam a resposta.** O Wikcionário define *casar* como "casar-se". Teste automático obrigatório: rejeitar toda definição que contenha a própria palavra ou seu radical. Sem isso, a recompensa vira spoiler.

**2. O baralho depende do tamanho do pool.** `shuffled(range(N))` muda inteiramente se `N` mudar — acrescentar uma palavra reescreve todas as futuras. Mitigação: `DAILY_POOL_SIZE` congelado como constante, o diário usa `ANSWERS.slice(0, DAILY_POOL_SIZE)`, e palavras novas entram depois desse índice servindo só o infinito. **Isso precisa de comentário no código** — é a armadilha mais fácil de pisar meses depois.

**3. A resposta está no bundle.** Determinismo no cliente significa que dá pra ler o verbete de amanhã no devtools. O term.ooo tem a mesma propriedade; aceitar. Mas não deixar trivial: um XOR sobre a lista atrapalha o curioso casual. É ofuscação, não segurança, e será documentada como tal.

**4. Teclado nativo do mobile briga com o jogo.** Autocorreção, teclas mortas (`´` + `a`), sugestões e eventos de composição. Decisão: **nada de `<input>` real no touch** — o teclado virtual é a entrada primária e, no desktop, escuta-se `keydown` no documento.

**5. Quarteto em tela pequena.** 4 tabuleiros × 9 linhas não cabe num iPhone SE. Precisa de estratégia antes de codar: grid 2×2 com `clamp()` no tamanho da casa, `svh`/`dvh` em vez de `100vh` (a barra do Safari quebra `vh`), teclado fixo com os tabuleiros rolando.

**6. Service worker servindo build velha** → lista de palavras velha → palavra do dia diferente da de todo mundo. `autoUpdate` mais aviso de versão nova, e dados versionados para a divergência ser detectável. O `no-store` no HTML e no `sw.js` do nginx é a outra metade da defesa.

**7. iOS apaga `localStorage`.** O ITP limpa storage após ~7 dias sem uso e a sequência evapora. Mitigação: botão de exportar/importar backup em JSON nas configurações, e incentivo a instalar o PWA, que tem tratamento melhor.

**8. Tailwind poda classe construída dinamicamente.** `` `bg-${state}` `` some do CSS final. Usar `Record<Tile, string>` com as classes por extenso.

**9. Relógio do aparelho é manipulável** — dá pra adiantar e inflar sequência. `lastSeenDayKey` monotônico recusa regressão; o resto se aceita.

## Verificação

**Durante o desenvolvimento**
- `pnpm test` — motor, dados e storage. A tabela de letras repetidas e o par `SABIA`/`SABIÁ`/`SÁBIA` são o núcleo.
- `pnpm typecheck` e `pnpm lint` — inclui o teste de arquitetura que prova que o motor não toca DOM.
- `pnpm dict:check` — regenera o dicionário e falha se o commitado divergir. Inclui as asserções de integridade (resposta injogável, colisão de acento) e o teste de glosa que entrega a resposta.
- Conferir que a tela "Sobre" traz a atribuição ao Wikcionário com link e licença, o aviso de adaptação, e o crédito ao VERO sob MPL-1.1 — é obrigação de licença, não acabamento.
- `pnpm test:e2e` — Playwright contra o build de produção, nunca contra o dev server.
- `pnpm dev` e jogar de verdade: solo, dueto e quarteto, nos dois modos, no desktop e com o DevTools em viewport de iPhone SE.

**Na fatia de identidade visual (6)**, conferência por screenshot nos dois temas, mais leitura em escala de cinza para provar que os três estados de casa se distinguem sem cor.

**No deploy**
1. `curl -sI https://verbete.devduraes.com.br | head -1` → `HTTP/2 200`
2. `curl -sI https://verbete.devduraes.com.br/ | grep -i cache-control` → `no-store` no HTML
3. `curl -sI https://verbete.devduraes.com.br/assets/<arquivo-com-hash>.js | grep -i cache-control` → `immutable`
4. Confirmar que **os outros quatro sites continuam de pé** — é o risco real de mexer em nginx numa máquina compartilhada:
   `for d in qyrofinance.com.br amgseg.com.br nossario.com.br devduraes.com.br; do echo -n "$d "; curl -sI "https://$d" | head -1; done`
5. Instalar o PWA no celular, ativar modo avião e jogar uma partida infinita
6. `sudo certbot certificates` confirmando que a linhagem `devduraes.com.br` passou a listar `*.devduraes.com.br`
