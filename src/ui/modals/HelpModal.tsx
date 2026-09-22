import type { MouseEvent } from 'react';
import { blurOnMouseActivation } from '../blurOnMouseActivation';
import { Modal } from './Modal';

export interface HelpModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onOpenAbout: () => void;
}

/**
 * The rules, in the one language this game speaks to a player, plus the two
 * things a Brazilian player will actually ask within thirty seconds of
 * their first guess — both consequences of deliberate design, not
 * omissions (see this task's brief):
 *
 * - Accents are IGNORED, not filled in. Typing "MOCAS" solves a board whose
 *   answer is "moças" and the row renders "MOCAS" — no accent ever appears
 *   on the board. The accented spelling is only ever seen in the reveal.
 *   (The text here used to promise they were "preenchidos automaticamente",
 *   which is a different and untrue thing; the cedilla sentence below was
 *   already accurate and is the right model for both.)
 * - There is no `Ç` key on the virtual keyboard (see engine/keyboard.ts's
 *   own `KEY_ROWS` comment: "No cedilla and no accented keys: input is
 *   A-Z, diacritics are never hints") — a word spelled with "ç" is typed
 *   with a plain "C" instead.
 */
export function HelpModal({ isOpen, onClose, onOpenAbout }: HelpModalProps) {
  if (!isOpen) return null;

  return (
    <Modal titleId="ajuda-titulo" title="Como jogar" onClose={onClose}>
      <div className="space-y-5 text-body">
        <p>
          Adivinhe a palavra secreta de cinco letras. A cada tentativa, cada letra é marcada:{' '}
          <strong>bloco todo tingido de tinta</strong> quando a letra está certa e no lugar certo,{' '}
          <strong>tinta vermelha</strong> quando a letra existe na palavra mas está no lugar errado, e{' '}
          <strong>sem tinta nenhuma</strong> quando a letra não existe na palavra. Em leitor de tela essas três
          marcas são lidas como <strong>correta</strong>, <strong>na posição errada</strong> e{' '}
          <strong>ausente</strong>.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Solo:</strong> 1 palavra, 6 tentativas.
          </li>
          <li>
            <strong>Dueto:</strong> 2 palavras ao mesmo tempo, 7 tentativas — cada tentativa vale para as duas.
          </li>
          <li>
            <strong>Quarteto:</strong> 4 palavras ao mesmo tempo, 9 tentativas.
          </li>
        </ul>
        <p>
          No modo <strong>Diário</strong> há um verbete novo por dia, igual para todo mundo, e suas vitórias
          seguidas contam para a sequência nas estatísticas. No modo <strong>Infinito</strong> dá para jogar
          quantas palavras quiser, mas essas partidas não avançam nem quebram a sequência — só contam para o
          total de jogadas e vitórias.
        </p>
        <div className="folha-regua" />
        <p>
          <strong>Acentos e cedilha são ignorados</strong> — digite só as letras. O tabuleiro mostra exatamente
          o que você digitou, sem til, agudo ou circunflexo, e o acento nunca conta como dica. A grafia
          acentuada só aparece no fim, no verbete revelado.
        </p>
        <p>
          <strong>Não há tecla de Ç no teclado.</strong> Palavras com cedilha se digitam com C mesmo — o jogo
          reconhece normalmente.
        </p>
        <div className="folha-regua" />
        <button
          type="button"
          className="text-small text-ghost underline decoration-rule underline-offset-2"
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            blurOnMouseActivation(event);
            onOpenAbout();
          }}
        >
          sobre as fontes das palavras e definições
        </button>
      </div>
    </Modal>
  );
}
