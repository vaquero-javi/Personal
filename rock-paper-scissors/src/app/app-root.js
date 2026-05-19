import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import '../views/home-view.js';
import '../views/game-view.js';
import { appStore } from '../store/app-store.js';
import { navigate, subscribeToRouter } from '../router/router.js';

@customElement('app-root')
export class AppRoot extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
    }

    main {
      min-height: 100vh;
      display: flex;
      align-items: center;     
      justify-content: center;  
      padding: 16px;
      box-sizing: border-box;
    }
  `;

  static properties = {
    appState: { attribute: false }
  };

  _appState = appStore.getState();
  unsubscribeStore = null;
  unsubscribeRouter = null;

  get appState() {
    return this._appState;
  }

  set appState(value) {
    const oldValue = this._appState;
    this._appState = value;
    this.requestUpdate('appState', oldValue);
  }

  connectedCallback() {
    super.connectedCallback();

    appStore.hydrate();

    this.unsubscribeStore = appStore.subscribe((nextState) => {
      this.appState = nextState;
    });

    this.unsubscribeRouter = subscribeToRouter((path) => {
      appStore.setRoute(path);
    });

    const activePlayer = appStore.getActivePlayer();
    const currentRoute = appStore.getState().session.currentRoute;

    if (currentRoute === '/game' && !activePlayer) {
      navigate('/');
    }
  }

  disconnectedCallback() {
    this.unsubscribeStore?.();
    this.unsubscribeRouter?.();
    super.disconnectedCallback();
  }

  handleStartGame(event) {
    const { name } = event.detail;
    const result = appStore.startGame(name);

    if (!result.ok) {
      return;
    }

    navigate('/game');
  }

  handlePlayMove(event) {
    const { move } = event.detail;

    appStore.playRound(move).catch((error) => {
      appStore.setTransientError(
        error instanceof Error
          ? error.message
          : 'Ha ocurrido un error inesperado.'
      );
    });
  }

  handleExitGame() {
    appStore.exitGame();
    navigate('/');
  }

  renderCurrentView() {
    const { session } = this.appState;
    const activePlayer = appStore.getActivePlayer();

    if (session.currentRoute === '/game' && activePlayer) {
      return html`
        <game-view
          .player=${activePlayer}
          .round=${session.currentRound}
          .errorMessage=${session.transientError}
          @play-move=${this.handlePlayMove}
          @exit-game=${this.handleExitGame}
        ></game-view>
      `;
    }

    return html`
      <home-view
        .errorMessage=${session.transientError}
        @start-game=${this.handleStartGame}
      ></home-view>
    `;
  }

  render() {
    return html`
      <main>
        ${this.renderCurrentView()}
      </main>
    `;
  }
}