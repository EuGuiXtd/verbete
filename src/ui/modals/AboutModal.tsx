import { Modal } from './Modal';

export interface AboutModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

/**
 * The licence-obligation screen. Every factual claim below is carried over
 * from `NOTICE.md`, faithfully — not paraphrased into something looser, and
 * not filled in with a detail `NOTICE.md` does not itself assert. Two
 * things in particular the brief's own wording gets looser than the source
 * of truth it points at, both deliberately NOT reproduced here (see this
 * task's report):
 *
 * 1. The brief says "credit VERO under MPL-1.1". `NOTICE.md` itself never
 *    asserts a specific MPL version — it explicitly says upstream's own
 *    MPL grant is unversioned, that four downstream packagers who
 *    redistribute the same data read it four different ways (Debian:
 *    LGPL-2.1+ only; wooorm: MPL-2.0; Fedora: MPL-1.1), and closes with
 *    "Anyone relicensing or commercialising this project should resolve
 *    this directly with upstream (or Legal) before doing so. Do not assume
 *    MPL-2.0, MPL-1.1, or any other specific version without that
 *    resolution." Asserting "MPL-1.1" in the product itself would be
 *    exactly the unsupported assumption `NOTICE.md` warns against, so this
 *    screen instead says what `NOTICE.md` actually commits to: LGPL-3.0,
 *    plus the Mozilla Public License "to whatever extent upstream's
 *    unversioned MPL grant permits" — no version number attached.
 * 2. `NOTICE.md` credits "Raimundo Santos Moura and the LibreOffice pt-BR
 *    community" for the word lists, not "VERO" as an author in its own
 *    right — VERO is the dictionary's name, not a credited party. Both are
 *    named below.
 */
export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <Modal titleId="sobre-titulo" title="Sobre as palavras e definições" onClose={onClose}>
      <div className="space-y-6 text-body">
        <article>
          <h3 className="text-lead font-semibold">Listas de palavras</h3>
          <p className="mt-2">
            As palavras deste jogo — tanto as respostas quanto os palpites aceitos — vêm do dicionário
            ortográfico <strong>VERO</strong>, de Raimundo Santos Moura e da comunidade pt-BR do LibreOffice
            (<a
              href="https://github.com/LibreOffice/dictionaries/tree/master/pt_BR"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-rule underline-offset-2"
            >
              github.com/LibreOffice/dictionaries
            </a>
            ). A lista publicada aqui é derivada desse dicionário, não uma cópia dele: as regras de flexão
            foram expandidas, o resultado foi filtrado para palavras de cinco letras, e uma parte foi
            escolhida como respostas por frequência de uso, restrita a palavras confirmadas como verbetes
            genuínos pelo Wikcionário.
          </p>
          <p className="mt-2">
            O próprio VERO declara sua licença de forma ambígua — "Licença Pública Geral Menor versão 3
            (LGPLv3) ... e a Mozilla Public License", sem indicar a versão da MPL. Por isso este jogo
            distribui as listas derivadas sob <strong>LGPL-3.0</strong> — a licença em comum às leituras que
            diferentes distribuidores já fizeram do mesmo dado — e, adicionalmente, sob a{' '}
            <strong>Mozilla Public License</strong>, na medida em que a concessão não versionada do projeto
            original permitir. Nenhuma versão específica da MPL é afirmada aqui.
          </p>
        </article>

        <div className="folha-regua" />

        <article>
          <h3 className="text-lead font-semibold">Definições</h3>
          <p className="mt-2">
            A definição mostrada ao final de cada partida vem do{' '}
            <a
              href="https://pt.wiktionary.org/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-rule underline-offset-2"
            >
              Wikcionário
            </a>{' '}
            (a Wiktionary em português), licenciado sob{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-rule underline-offset-2"
            >
              CC BY-SA 4.0
            </a>
            .
          </p>
          <p className="mt-2">
            Cada definição foi <strong>adaptada</strong>, não copiada por inteiro: para cada resposta, foi
            selecionado o primeiro sentido do verbete que tivesse um texto não vazio e que não contivesse a
            própria palavra (para não entregar a resposta), esse texto foi normalizado e reduzido a cerca de
            90 caracteres, com uma abreviação de classe gramatical na frente. É um único sentido, escolhido
            entre vários que o verbete real tem, encurtado para caber na tela de resultado — uma adaptação,
            não uma reprodução do verbete inteiro. Como esta é uma obra derivada do Wikcionário sob a mesma
            licença, o resultado de cada partida também linka diretamente para o artigo específico de onde a
            definição foi adaptada, que é a forma mais robusta de dar crédito recomendada pela própria CC
            BY-SA 4.0.
          </p>
        </article>

        <div className="folha-regua" />

        <article>
          <h3 className="text-lead font-semibold">Tipografia</h3>
          <p className="mt-2">
            O tipo usado neste jogo é o <strong>Newsreader</strong>, dos autores do projeto Newsreader
            (
            <a
              href="http://github.com/productiontype/Newsreader"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-rule underline-offset-2"
            >
              github.com/productiontype/Newsreader
            </a>
            ), licenciado sob a{' '}
            <a
              href="https://scripts.sil.org/OFL"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-rule underline-offset-2"
            >
              SIL Open Font License 1.1
            </a>
            . Os arquivos aqui embutidos são derivados do original: reduzidos aos caracteres que este
            jogo realmente usa e com os eixos variáveis de peso e tamanho óptico ajustados ao que a
            interface efetivamente exige, para caber inteiramente no aplicativo instalável e funcionar
            offline.
          </p>
        </article>
      </div>
    </Modal>
  );
}
