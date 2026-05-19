import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MOVE_LABELS } from '../domain/constants.js';

@customElement('move-selector')
export class MoveSelector extends LitElement {
  static styles = css`
    .grid {
      display: grid;
      gap: 12px;
    }

    button {
      border: none;
      border-radius: 14px;
      padding: 16px;
      font-weight: 700;
      cursor: pointer;
      background: #111827;
      color: white;
      min-height: 54px;
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  `;

  _disabled = false;

  @property({ type: Boolean })
  get disabled() {
    return this._disabled;
  }

  set disabled(value) {
    const oldValue = this._disabled;
    this._disabled = Boolean(value);
    this.requestUpdate('disabled', oldValue);
  }

  emitMove(move) {
    this.dispatchEvent(
      new CustomEvent('select-move', {
        detail: { move },
        bubbles: true,
        composed: true
      })
    );
  }

  render() {
    return html`
      <div class="grid" aria-label="Selecciona tu jugada">
        <button ?disabled=${this.disabled} @click=${() => this.emitMove('rock')}>
          ${MOVE_LABELS.rock}
        </button>
        <button ?disabled=${this.disabled} @click=${() => this.emitMove('paper')}>
          ${MOVE_LABELS.paper}
        </button>
        <button ?disabled=${this.disabled} @click=${() => this.emitMove('scissors')}>
          ${MOVE_LABELS.scissors}
        </button>
      </div>
    `;
  }
}