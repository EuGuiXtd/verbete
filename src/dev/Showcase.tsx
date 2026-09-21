import { useEffect, useState, type ReactNode } from 'react';
import { useTheme, type ThemeChoice } from '../state/useTheme';

/*
 * Dev-only specimen sheet. It is not reachable from the app and is not part
 * of the production build (Vite builds index.html only; showcase.html sits
 * outside the input). It exists so the palette, the press treatment and the
 * type scale can be looked at and argued with — including in greyscale,
 * which is where the three tile states have to prove themselves.
 */

type SorteState = 'vazia' | 'ausente' | 'presente' | 'certa';

// Written out in full, one complete string per state: the Tailwind scanner
// reads source as text, so a class assembled as `sorte-${state}` would be
// pruned from the build and would only ever look right in dev.
const SORTE_CLASS: Record<SorteState, string> = {
  vazia: 'sorte sorte-vazia',
  ausente: 'sorte sorte-ausente',
  presente: 'sorte sorte-presente',
  certa: 'sorte sorte-certa',
};

function Sorte({ letter, state }: { letter: string; state: SorteState }) {
  return <div className={`${SORTE_CLASS[state]} w-[3.25rem] sm:w-[3.75rem]`}>{letter}</div>;
}

function Secao({ marca, titulo, children }: { marca: string; titulo: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="flex items-baseline gap-3 text-small">
        <span className="font-semibold text-ink">{marca}</span>
        <span className="italic text-ghost">{titulo}</span>
        <span className="h-px flex-1 -translate-y-[0.3em] bg-rule" />
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Legenda({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-[34rem] text-small italic text-ghost">{children}</p>;
}

function ControleDeTema() {
  const { theme, resolved, setTheme } = useTheme();
  const opcoes: readonly { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: 'sistema' },
    { value: 'light', label: 'claro' },
    { value: 'dark', label: 'escuro' },
  ];

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1" role="group" aria-label="Aparência">
        {opcoes.map((opcao) => (
          <button
            key={opcao.value}
            type="button"
            aria-pressed={theme === opcao.value}
            onClick={() => {
              setTheme(opcao.value);
            }}
            className={theme === opcao.value ? 'tecla tecla-certa px-3' : 'tecla px-3'}
          >
            {opcao.label}
          </button>
        ))}
      </div>
      <span className="text-micro italic text-ghost">
        em vigor: {resolved === 'dark' ? 'escuro' : 'claro'}
      </span>
    </div>
  );
}

const PALETA: readonly { token: string; nome: string }[] = [
  { token: '--paper', nome: 'papel de algodão' },
  { token: '--paper-raised', nome: 'face iluminada' },
  { token: '--paper-recess', nome: 'casa vazia' },
  { token: '--knockout', nome: 'letra vazada' },
  { token: '--ink', nome: 'preto de tipografia' },
  { token: '--ink-red', nome: 'vermelho rubi' },
  { token: '--ghost', nome: 'letra descartada' },
  { token: '--rule', nome: 'fio' },
];

function Amostra({ token, nome }: { token: string; nome: string }) {
  // Read back from the cascade rather than hard-coded, so the sheet always
  // shows the value that is actually in force in the theme on screen.
  const [valor, setValor] = useState('');
  useEffect(() => {
    const read = () => {
      setValor(getComputedStyle(document.documentElement).getPropertyValue(token).trim());
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', read);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', read);
    };
  }, [token]);

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-10 w-10 shrink-0 rounded-sheet border border-rule"
        style={{ backgroundColor: `var(${token})` }}
      />
      <div className="min-w-0">
        <div className="truncate text-small text-ink">
          {token} <span className="text-ghost">{valor}</span>
        </div>
        <div className="truncate text-micro italic text-ghost">{nome}</div>
      </div>
    </div>
  );
}

// The three inked states plus the empty house, captioned in the language the
// game itself will use.
const SORTES_DEMO: readonly { letter: string; state: SorteState; caption: string }[] = [
  { letter: ' ', state: 'vazia', caption: 'casa vazia' },
  { letter: 'T', state: 'ausente', caption: 'letra ausente' },
  { letter: 'A', state: 'presente', caption: 'existe, outro lugar' },
  { letter: 'P', state: 'certa', caption: 'certa, no lugar' },
];

const TENTATIVA: readonly { letter: string; state: SorteState }[] = [
  { letter: 'P', state: 'certa' },
  { letter: 'R', state: 'certa' },
  { letter: 'A', state: 'presente' },
  { letter: 'T', state: 'ausente' },
  { letter: 'O', state: 'presente' },
];

const REVELACAO: readonly { letter: string; state: SorteState }[] = [
  { letter: 'P', state: 'certa' },
  { letter: 'R', state: 'certa' },
  { letter: 'O', state: 'certa' },
  { letter: 'S', state: 'certa' },
  { letter: 'A', state: 'certa' },
];

const TECLAS: readonly { label: string; className: string }[] = [
  { label: 'q', className: 'tecla w-9' },
  { label: 'w', className: 'tecla w-9' },
  { label: 'e', className: 'tecla tecla-presente w-9' },
  { label: 'r', className: 'tecla tecla-certa w-9' },
  { label: 't', className: 'tecla tecla-ausente w-9' },
  { label: 'y', className: 'tecla w-9' },
  { label: 'u', className: 'tecla tecla-ausente w-9' },
  { label: 'i', className: 'tecla w-9' },
  { label: 'o', className: 'tecla tecla-certa w-9' },
  { label: 'p', className: 'tecla w-9' },
];

export default function Showcase() {
  return (
    <div className="min-h-screen bg-paper px-5 pb-24 pt-7 text-ink sm:px-8">
      <div className="mx-auto max-w-[46rem]">
        <header className="flex flex-wrap items-center justify-between gap-y-3 border-b border-rule pb-3">
          <span className="text-small italic text-ghost">espécimen tipográfico</span>
          <ControleDeTema />
        </header>

        {/* The wordmark, set the way a dictionary sets a headword. */}
        <div className="mt-12">
          <h1 className="flex flex-wrap items-baseline gap-x-4">
            <span
              className="text-display font-semibold tracking-[-0.015em]"
              style={{ fontVariationSettings: "'opsz' 48" }}
            >
              ver&middot;be&middot;te
            </span>
            <span className="text-lead italic text-ghost">s.m.</span>
          </h1>
          <p className="mt-5 max-w-[34rem] text-body">
            <span className="mr-2 font-semibold">1.</span>
            cada uma das entradas de um dicionário: a palavra, e tudo o que se sabe dela. Aqui, cada
            partida é um verbete que você desencava.
          </p>
        </div>

        <Secao marca="§1" titulo="as sortes">
          <div className="flex flex-wrap gap-4">
            {SORTES_DEMO.map((item) => (
              <figure key={item.caption} className="w-[3.25rem] sm:w-[3.75rem]">
                <Sorte letter={item.letter} state={item.state} />
                <figcaption className="mt-2 text-micro italic leading-snug text-ghost">
                  {item.caption}
                </figcaption>
              </figure>
            ))}
          </div>
          <Legenda>
            A cobertura de tinta é a dica. Bloco entintado de preto: letra certa no lugar certo.
            Entintado de vermelho: a letra existe, noutro lugar. Sem tinta, só o afundamento cego no
            papel: a letra não está na palavra.
          </Legenda>
        </Secao>

        <Secao marca="§2" titulo="uma tentativa">
          <div className="flex gap-2">
            {TENTATIVA.map((item, index) => (
              <Sorte key={`tentativa-${String(index)}`} letter={item.letter} state={item.state} />
            ))}
          </div>
          <Legenda>
            <span className="not-italic">prato</span>, contra uma resposta que você ainda não sabe.
            Os três estados se separam em escala de cinza — escuro, médio, papel — antes de se
            separarem por matiz.
          </Legenda>
        </Secao>

        <Secao marca="§3" titulo="a revelação">
          <div className="flex gap-2">
            {REVELACAO.map((item, index) => (
              <Sorte key={`revelacao-${String(index)}`} letter={item.letter} state={item.state} />
            ))}
          </div>
          <div className="mt-8 border-t border-rule pt-6">
            <h3 className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-headword font-semibold">pro&middot;sa</span>
              <span className="text-body italic text-ghost">s.f.</span>
            </h3>
            <p className="mt-3 max-w-[34rem] text-body">
              <span className="mr-2 font-semibold">1.</span>
              forma de escrever sem as restrições do verso.
              <span className="mx-3 text-ghost">&middot;</span>
              <span className="mr-2 font-semibold">2.</span>
              conversa despreocupada; lero-lero.
            </p>
          </div>
          <Legenda>
            O tabuleiro fala em caixa alta e sem acento, porque é só disso que o teclado dá conta. A
            revelação volta à caixa baixa e recupera os diacríticos — ali a palavra deixa de ser um
            palpite e vira cabeça de verbete.
          </Legenda>
        </Secao>

        <Secao marca="§4" titulo="o teclado">
          <div className="flex flex-wrap gap-[6px]">
            {TECLAS.map((tecla) => (
              <button key={tecla.label} type="button" className={tecla.className}>
                {tecla.label}
              </button>
            ))}
          </div>
          <div className="mt-[6px] flex flex-wrap gap-[6px]">
            <button type="button" className="tecla px-4">
              enviar
            </button>
            <button type="button" className="tecla px-4">
              apagar
            </button>
          </div>
          <Legenda>
            As teclas têm curso: descem até o papel e perdem a sombra ao serem pressionadas. O anel
            de foco é tinta sobre papel, afastado da tecla — funciona igual sobre uma tecla clara e
            sobre um bloco entintado.
          </Legenda>
        </Secao>

        <Secao marca="§5" titulo="a paleta">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {PALETA.map((cor) => (
              <Amostra key={cor.token} token={cor.token} nome={cor.nome} />
            ))}
          </div>
        </Secao>

        <Secao marca="§6" titulo="a escala">
          <dl className="space-y-6">
            <div>
              <dt className="text-micro italic text-ghost">
                display &middot; os diacríticos que a revelação devolve
              </dt>
              <dd className="text-display font-semibold leading-none">ãâáçéêíóôõú</dd>
            </div>
            <div>
              <dt className="text-micro italic text-ghost">cabeça de verbete</dt>
              <dd className="text-headword font-semibold">dá&middot;lia</dd>
            </div>
            <div>
              <dt className="text-micro italic text-ghost">olho / chamada</dt>
              <dd className="text-lead">Uma palavra por partida, quantas partidas você quiser.</dd>
            </div>
            <div>
              <dt className="text-micro italic text-ghost">corpo de texto</dt>
              <dd className="max-w-[34rem] text-body">
                Planta ornamental da família das compostas, de flores grandes e vistosas, originária
                do México. Também: a própria flor.
              </dd>
            </div>
            <div>
              <dt className="text-micro italic text-ghost">miúdo &middot; rodapé e legenda</dt>
              <dd className="text-small text-ghost">
                fonte: dicionário aberto &middot; licença CC BY-SA
              </dd>
            </div>
          </dl>
        </Secao>

        <footer className="mt-16 border-t border-rule pt-4 text-micro italic text-ghost">
          Newsreader, eixo óptico 6–72. Esta página não vai ao ar.
        </footer>
      </div>
    </div>
  );
}
