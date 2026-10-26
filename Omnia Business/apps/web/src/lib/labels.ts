// Vocabulario de estados: etiqueta en español y tono (nunca colores de lomo).

export type Tone = 'neutral' | 'info' | 'ok' | 'warning' | 'danger' | 'muted';

type StatusMap = Record<string, readonly [label: string, tone: Tone]>;

export const receiptStatus: StatusMap = {
  draft: ['Borrador', 'neutral'],
  posted: ['Contabilizado', 'ok'],
  cancelled: ['Anulado', 'muted'],
};

export const purchaseOrderStatus: StatusMap = {
  draft: ['Borrador', 'neutral'],
  sent: ['Enviado', 'info'],
  partially_received: ['Recibido en parte', 'warning'],
  received: ['Recibido', 'ok'],
  cancelled: ['Anulado', 'muted'],
};

export const salesOrderStatus: StatusMap = {
  draft: ['Borrador', 'neutral'],
  confirmed: ['Confirmado', 'info'],
  delivered: ['Servido', 'warning'],
  invoiced: ['Facturado', 'ok'],
  cancelled: ['Anulado', 'muted'],
};

export const invoiceStatus: StatusMap = {
  draft: ['Borrador', 'neutral'],
  issued: ['Pendiente', 'info'],
  partially_paid: ['Cobro parcial', 'warning'],
  paid: ['Cobrada', 'ok'],
  cancelled: ['Anulada', 'muted'],
};

export const receivedInvoiceStatus: StatusMap = {
  ...invoiceStatus,
  issued: ['Pendiente de pago', 'info'],
  paid: ['Pagada', 'ok'],
  partially_paid: ['Pago parcial', 'warning'],
};

export const fiscalStatus: StatusMap = {
  not_applicable: ['No aplica', 'muted'],
  pending: ['Pendiente de envío', 'warning'],
  sent: ['Enviado', 'info'],
  accepted: ['Aceptado', 'ok'],
  accepted_with_errors: ['Aceptado con errores', 'warning'],
  rejected: ['Rechazado', 'danger'],
};

export const incidentStatus: StatusMap = {
  open: ['Abierta', 'info'],
  in_progress: ['En curso', 'warning'],
  waiting: ['En espera', 'neutral'],
  resolved: ['Resuelta', 'ok'],
  closed: ['Cerrada', 'muted'],
};

export const incidentPriority: StatusMap = {
  urgent: ['Urgente', 'danger'],
  high: ['Alta', 'warning'],
  normal: ['Normal', 'neutral'],
  low: ['Baja', 'muted'],
};

export const leaveStatus: StatusMap = {
  requested: ['Pendiente', 'warning'],
  approved: ['Aprobada', 'ok'],
  rejected: ['Rechazada', 'danger'],
  cancelled: ['Cancelada', 'muted'],
};

export const leaveType: Record<string, string> = {
  vacation: 'Vacaciones',
  sick: 'Baja médica',
  personal: 'Asuntos propios',
  parental: 'Permiso parental',
  other: 'Otro',
};

export const payslipKind: Record<string, string> = {
  monthly: 'Nómina',
  bonus: 'Paga extra',
  settlement: 'Finiquito',
};

export const movementType: Record<string, string> = {
  receipt: 'Entrada',
  issue: 'Salida',
  sale: 'Venta',
  return: 'Devolución',
  adjustment: 'Ajuste',
  transfer_in: 'Traspaso (entrada)',
  transfer_out: 'Traspaso (salida)',
};

export const entryType: Record<string, string> = {
  clock_in: 'Entrada',
  clock_out: 'Salida',
  break_start: 'Inicio de pausa',
  break_end: 'Fin de pausa',
};

export const paymentMethod: Record<string, string> = {
  transfer: 'Transferencia',
  card: 'Tarjeta',
  cash: 'Efectivo',
  direct_debit: 'Domiciliación',
  other: 'Otro',
};

export const itemType: Record<string, string> = { stockable: 'Inventariable', consumable: 'Consumible', service: 'Servicio' };

export const invoiceType: Record<string, string> = {
  F1: 'Factura',
  F2: 'Simplificada (ticket)',
  F3: 'Sustitutiva de simplificadas',
  R1: 'Rectificativa',
  R2: 'Rectificativa (concurso)',
  R3: 'Rectificativa (deuda incobrable)',
  R4: 'Rectificativa (otras)',
  R5: 'Rectificativa de simplificada',
};
