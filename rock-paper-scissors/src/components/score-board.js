import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('score-board')
export class ScoreBoard extends LitElement {
  static styles = css`
    .wrap {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      background: #f9fafb;
    }

    .name {
      font-weight: 700;
      font-size: 1.1rem;
    }

    .score {
      font-weight: 800;
      color: var(--color-primary);
      font-size: 1.25rem;
    }
  `;

  _player = null;

  @property({ attribute: false })
  get player() {
    return this._player;
  }

  set player(value) {
    const oldValue = this._player;
    this._player = value;
    this.requestUpdate('player', oldValue);
  }

  render() {
    if (!this.player) {
      return null;
    }

    return html`
      <div class="wrap" aria-label="Marcador">
        <div>
          <div class="name">${this.player.name}</div>
          <div>Puntos acumulados</div>
        </div>
        <div class="score">${this.player.score}</div>
      </div>
    `;
  }
}