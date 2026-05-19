import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '../components/app-card.js';
import '../components/score-board.js';
import '../components/move-selector.js';
import '../components/round-result.js';

@customElement('game-view')
export class GameView extends LitElement {
  static styles = css`
    .layout {
      display: grid;
      gap: 16px;
    }

    h1 {
      margin: 0;
      font-size: 1.8rem;
    }

    .actions {
      display: grid;
      gap: 12px;
    }

    .error {
      min-height: 20px;
      color: var(--color-danger);
      font-size: 0.95rem;
    }

    .exit {
      border: 1px solid var(--color-border);
      background: white;
      color: var(--color-text);
      border-radius: 14px;
      padding: 14px 16px;
      font-weight: 700;
      cursor: pointer;
    }
  `;

  _player = null;
  _round = null;
  _errorMessage = '';

  @property({ attribute: false })
  get player() {
    return this._player;
  }

  set player(value) {
    const oldValue = this._player;
    this._player = value;
    this.requestUpdate('player', oldValue);
  }

  @property({ attribute: false })
  get round() {
    return this._round;
  }

  set round(value) {
    const oldValue = this._round;
    this._round = value;
    this.requestUpdate('round', oldValue);
  }

  @property({ type: String })
  get errorMessage() {
    return this._errorMessage;
  }

  set errorMessage(value) {
    const oldValue = this._errorMessage;
    this._errorMessage = value ?? '';
    this.requestUpdate('errorMessage', oldValue);
  }

  handleMoveSelection(event) {
    this.dispatchEvent(
      new CustomEvent('play-move', {
        detail: event.detail,
        bubbles: true,
        composed: true
      })
    );
  }

  handleExit() {
    this.dispatchEvent(
      new CustomEvent('exit-game', {
        bubbles: true,
        composed: true
      })
    );
  }

  render() {
    return html`
      <app-card>
        <div class="layout">
          <h1>Partida</h1>

          <score-board .player=${this.player}></score-board>

          <move-selector
            .disabled=${Boolean(this.round?.isResolving)}
            @select-move=${this.handleMoveSelection}
          ></move-selector>

          <round-result .round=${this.round}></round-result>

          <div class="error" role="alert" aria-live="polite">
            ${this.errorMessage}
          </div>

          <div class="actions">
            <button class="exit" type="button" @click=${this.handleExit}>
              Salir
            </button>
          </div>
        </div>
      </app-card>
    `;
  }
}