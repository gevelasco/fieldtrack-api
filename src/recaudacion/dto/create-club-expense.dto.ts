import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsString, Matches, MaxLength, Min } from 'class-validator';

export const CLUB_EXPENSE_TYPES = [
  'oficina',
  'administracion',
  'reparacion',
  'mantenimiento',
  'deuda',
] as const;

export type ClubExpenseType = (typeof CLUB_EXPENSE_TYPES)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateClubExpenseDto {
  @IsString()
  @Matches(ISO_DATE)
  spentOn: string;

  @IsIn(CLUB_EXPENSE_TYPES)
  expenseType: ClubExpenseType;

  @IsString()
  @MaxLength(400)
  concept: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}