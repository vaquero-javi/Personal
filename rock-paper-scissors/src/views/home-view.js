import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '../components/app-card.js';
import '../components/player-form.js';

@customElement('home-view')
export class HomeView extends LitElement {
  static styles = css`
    h1 {
      margin: 0 0 8px;
      font-size: clamp(1.8rem, 4vw, 2.3rem);
      line-height: 1.1;
    }

    p {
      margin: 0 0 20px;
      color: var(--color-muted);
    }
  `;

  _errorMessage = '';

  @property({ type: String })
  get errorMessage() {
    return this._errorMessage;
  }

  set errorMessage(value) {
    const oldValue = this._errorMessage;
    this._errorMessage = value ?? '';
    this.requestUpdate('errorMessage', oldValue);
  }

  handleSubmit(event) {
    this.dispatchEvent(
      new CustomEvent('start-game', {
        detail: event.detail,
        bubbles: true,
        composed: true
      })
    );
  }

  render() {
    return html`
      <app-card>
        <h1>rock-paper-scissors</h1>
        <p>
          Introduce tu nombre para empezar una nueva partida o continuar una
          existente.
        </p>

        <player-form
          .externalError=${this.errorMessage}
          @submit-player=${this.handleSubmit}
        ></player-form>
      </app-card>
    `;
  }
}