import { type ClubExpenseType } from './dto/create-club-expense.dto';

export const EXPENSE_TYPE_LABEL: Record<ClubExpenseType, string> = {
  oficina: 'Oficina',
  administracion: 'Administración',
  reparacion: 'Reparación',
  mantenimiento: 'Mantenimiento',
  deuda: 'Deuda',
};

export function expenseConceptLabel(type: ClubExpenseType, concept: string): string {
  const trimmed = concept.trim();
  return `Gasto · ${EXPENSE_TYPE_LABEL[type]}${trimmed ? ` · ${trimmed}` : ''}`;
}