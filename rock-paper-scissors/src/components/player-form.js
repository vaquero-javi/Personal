import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { validatePlayerName } from '../domain/validators.js';

@customElement('player-form')
export class PlayerForm extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    form {
      display: grid;
      gap: 14px;
      width: 100%;
    }

    label {
      display: grid;
      gap: 8px;
      width: 100%;
      font-weight: 600;
      color: var(--color-text);
    }

    input {
      width: 100%;
      max-width: 100%;
      padding: 14px 16px;
      border-radius: 12px;
      border: 1px solid var(--color-border);
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      background: #ffffff;
    }

    input:focus {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
    }

    button {
      width: 100%;
      border: none;
      border-radius: 12px;
      background: var(--color-primary);
      color: white;
      padding: 14px 16px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s ease, transform 0.1s ease;
    }

    button:hover {
      background: var(--color-primary-hover);
    }

    button:active {
      transform: translateY(1px);
    }

    .error {
      min-height: 20px;
      color: var(--color-danger);
      font-size: 0.95rem;
    }
  `;

  static properties = {
    externalError: { type: String },
    playerName: { state: true },
    localError: { state: true }
  };

  _externalError = '';
  _playerName = '';
  _localError = '';

  get externalError() {
    return this._externalError;
  }

  set externalError(value) {
    const oldValue = this._externalError;
    this._externalError = value ?? '';
    this.requestUpdate('externalError', oldValue);
  }

  get playerName() {
    return this._playerName;
  }

  set playerName(value) {
    const oldValue = this._playerName;
    this._playerName = value ?? '';
    this.requestUpdate('playerName', oldValue);
  }

  get localError() {
    return this._localError;
  }

  set localError(value) {
    const oldValue = this._localError;
    this._localError = value ?? '';
    this.requestUpdate('localError', oldValue);
  }

  handleInput(event) {
    this.playerName = event.target.value;
    if (this.localError) {
      this.localError = '';
    }
  }

  handleSubmit(event) {
    event.preventDefault();

    const validation = validatePlayerName(this.playerName);

    if (!validation.ok) {
      this.localError = validation.error;
      return;
    }

    this.localError = '';

    this.dispatchEvent(
      new CustomEvent('submit-player', {
        detail: { name: validation.value },
        bubbles: true,
        composed: true
      })
    );
  }

  render() {
    const error = this.localError || this.externalError;

    return html`
      <form @submit=${this.handleSubmit} novalidate>
        <label for="playerName">
          Nombre del jugador
          <input
            id="playerName"
            type="text"
            maxlength="20"
            autocomplete="nickname"
            .value=${this.playerName}
            @input=${this.handleInput}
            placeholder="Escribe tu nombre"
            aria-describedby="playerNameError"
          />
        </label>

        <div id="playerNameError" class="error" role="alert" aria-live="polite">
          ${error}
        </div>

        <button type="submit">Iniciar juego</button>
      </form>
    `;
  }
}