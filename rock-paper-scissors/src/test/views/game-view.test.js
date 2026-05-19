import { fixture, html, expect } from '@open-wc/testing';
import '../../views/game-view.js';

describe('game-view', () => {
  const player = {
    id: '1',
    name: 'Mario',
    normalizedName: 'mario',
    score: 5,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const round = {
    playerMove: 'rock',
    machineMove: 'paper',
    result: 'lose',
    isResolving: false,
    lastMachineMove: 'paper',
    startedAt: Date.now()
  };

  it('muestra nombre y puntos', async () => {
    const element = await fixture(
      html`<game-view .player=${player} .round=${round}></game-view>`
    );

    await element.updateComplete;

    const scoreBoard = element.shadowRoot.querySelector('score-board');
    await scoreBoard.updateComplete;

    expect(scoreBoard.shadowRoot.textContent).to.contain('Mario');
    expect(scoreBoard.shadowRoot.textContent).to.contain('5');
  });

  it('emite play-move al seleccionar jugada', async () => {
    const element = await fixture(
      html`<game-view .player=${player} .round=${round}></game-view>`
    );

    let payload = null;
    element.addEventListener('play-move', (event) => {
      payload = event.detail;
    });

    const selector = element.shadowRoot.querySelector('move-selector');
    selector.dispatchEvent(
      new CustomEvent('select-move', {
        detail: { move: 'scissors' },
        bubbles: true,
        composed: true
      })
    );

    expect(payload).to.deep.equal({ move: 'scissors' });
  });

  it('emite exit-game al pulsar salir', async () => {
    const element = await fixture(
      html`<game-view .player=${player} .round=${round}></game-view>`
    );

    let emitted = false;
    element.addEventListener('exit-game', () => {
      emitted = true;
    });

    const button = element.shadowRoot.querySelector('.exit');
    button.click();

    expect(emitted).to.equal(true);
  });
});