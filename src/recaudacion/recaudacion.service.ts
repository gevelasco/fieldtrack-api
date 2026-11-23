import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type ClubExpenseType, CreateClubExpenseDto } from './dto/create-club-expense.dto';
import { ListRecaudacionQueryDto } from './dto/list-recaudacion.dto';
import { PAGE_SIZES } from '../members/dto/member.dto';
import { expenseConceptLabel } from './expense-type-label';
import { insertClubExpense, monthBounds, searchRecaudacion } from './recaudacion.queries';

@Injectable()
export class RecaudacionService {
  constructor(private readonly dataSource: DataSource) {}

  list(clubId: number, query: ListRecaudacionQueryDto) {
    const pageSize = query.pageSize ?? PAGE_SIZES[0];
    const { fromDate, toDate } = monthBounds(query.from, query.to);
    return searchRecaudacion(this.dataSource.manager, {
      clubId,
      search: query.search ?? '',
      fromDate,
      toDate,
      kinds: query.kinds ?? [],
      page: query.page ?? 1,
      pageSize,
    });
  }

  createExpense(clubId: number, userId: number, dto: CreateClubExpenseDto) {
    return insertClubExpense(this.dataSource.manager, {
      clubId,
      spentOn: dto.spentOn,
      expenseType: dto.expenseType as ClubExpenseType,
      concept: dto.concept,
      amount: dto.amount,
      recordedByUserId: userId,
    }).then((id) => ({
      id,
      concept: expenseConceptLabel(dto.expenseType, dto.concept),
    }));
  }
}
