import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('app-card')
export class AppCard extends LitElement {
  static styles = css`
    :host {
      width: min(100%, 420px);
      display: block;
      background: var(--color-surface);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 24px;
      border: 1px solid rgba(209, 213, 219, 0.6);
    }
  `;

  render() {
    return html`<slot></slot>`;
  }
}