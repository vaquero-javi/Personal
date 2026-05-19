import { fixture, html, expect } from '@open-wc/testing';
import '../../components/player-form.js';

describe('player-form', () => {
  it('renderiza input y botón', async () => {
    const element = await fixture(html`<player-form></player-form>`);
    expect(element.shadowRoot.querySelector('input')).to.exist;
    expect(element.shadowRoot.querySelector('button')).to.exist;
  });

  it('emite el evento submit-player con nombre válido', async () => {
    const element = await fixture(html`<player-form></player-form>`);
    const input = element.shadowRoot.querySelector('input');
    const form = element.shadowRoot.querySelector('form');

    let payload = null;
    element.addEventListener('submit-player', (event) => {
      payload = event.detail;
    });

    input.value = 'Lucia';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));

    expect(payload).to.deep.equal({ name: 'Lucia' });
  });

  it('muestra error con nombre inválido', async () => {
  const element = await fixture(html`<player-form></player-form>`);
  const form = element.shadowRoot.querySelector('form');

  form.dispatchEvent(
    new Event('submit', {
      bubbles: true,
      cancelable: true
    })
  );

  await element.updateComplete;

  const error = element.shadowRoot.querySelector('.error');
  expect(error.textContent).to.contain('obligatorio');
});
});