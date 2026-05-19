import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MOVE_LABELS } from '../domain/constants.js';

@customElement('round-result')
export class RoundResult extends LitElement {
  static styles = css`
    .panel {
      display: grid;
      gap: 10px;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      padding: 16px;
      background: #f9fafb;
    }

    .status {
      font-weight: 700;
    }

    .status.win {
      color: var(--color-success);
    }

    .status.lose {
      color: var(--color-danger);
    }

    .status.draw {
      color: var(--color-warning);
    }

    .muted {
      color: var(--color-muted);
    }
  `;

  _round = null;

  @property({ attribute: false })
  get round() {
    return this._round;
  }

  set round(value) {
    const oldValue = this._round;
    this._round = value;
    this.requestUpdate('round', oldValue);
  }

  getResultLabel(result) {
    if (result === 'win') return 'Has ganado';
    if (result === 'lose') return 'Has perdido';
    if (result === 'draw') return 'Empate';
    return '';
  }

  render() {
    if (!this.round) {
      return null;
    }

    const { playerMove, machineMove, result, isResolving } = this.round;

    return html`
      <div class="panel" aria-live="polite">
        <div>
          <strong>Tu selección:</strong>
          ${playerMove ? MOVE_LABELS[playerMove] : 'Aún no has jugado'}
        </div>

        <div>
          <strong>Máquina:</strong>
          ${isResolving
            ? html`<span class="muted">La máquina está pensando...</span>`
            : machineMove
              ? MOVE_LABELS[machineMove]
              : 'Pendiente'}
        </div>

        <div class="status ${result ?? ''}">
          ${result
            ? this.getResultLabel(result)
            : 'Selecciona una jugada para empezar.'}
        </div>
      </div>
    `;
  }
}