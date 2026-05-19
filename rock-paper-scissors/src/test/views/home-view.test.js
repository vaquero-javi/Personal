import { fixture, html, expect } from '@open-wc/testing';
import '../../views/home-view.js';

describe('home-view', () => {
  it('renderiza la vista home', async () => {
    const element = await fixture(html`<home-view></home-view>`);
    expect(element.shadowRoot.textContent).to.contain('rock-paper-scissors');
  });

  it('reemite start-game', async () => {
    const element = await fixture(html`<home-view></home-view>`);
    const form = element.shadowRoot.querySelector('player-form');

    let detail = null;
    element.addEventListener('start-game', (event) => {
      detail = event.detail;
    });

    form.dispatchEvent(
      new CustomEvent('submit-player', {
        detail: { name: 'Pedro' },
        bubbles: true,
        composed: true
      })
    );

    expect(detail).to.deep.equal({ name: 'Pedro' });
  });
});