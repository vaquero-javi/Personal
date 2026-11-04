import { INVOICE_LIST_STATUSES } from '@omnia/invoicing';

type ListStatus = (typeof INVOICE_LIST_STATUSES)[number];

/**
 * `?estado=` viene de una URL que cualquiera puede editar. En la API un valor
 * desconocido es un 422; en una página es más útil ignorarlo y enseñar «Todas».
 */
export const listStatus = (estado: string | undefined): ListStatus | undefined =>
  (INVOICE_LIST_STATUSES as readonly string[]).includes(estado ?? '') ? (estado as ListStatus) : undefined;
