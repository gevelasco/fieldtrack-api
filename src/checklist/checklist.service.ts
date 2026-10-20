import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateChecklistItemDto, UpdateChecklistItemDto } from './dto/checklist.dto';
import { UserChecklistItem } from './entities/user-checklist-item.entity';

export function mapChecklistItem(item: UserChecklistItem) {
  return {
    id: item.id,
    title: item.title,
    done: item.done,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
  };
}

@Injectable()
export class ChecklistService {
  constructor(
    @InjectRepository(UserChecklistItem)
    private readonly items: Repository<UserChecklistItem>,
  ) {}

  async list(clubId: number, userId: number) {
    const rows = await this.items.find({
      where: { clubId, userId },
      order: { done: 'ASC', sortOrder: 'ASC', id: 'ASC' },
    });
    return rows.map(mapChecklistItem);
  }

  async create(clubId: number, userId: number, dto: CreateChecklistItemDto) {
    const title = dto.title.trim();
    if (!title) {
      throw new BadRequestException('Escribe la tarea.');
    }
    const last = await this.items.findOne({
      where: { clubId, userId },
      order: { sortOrder: 'DESC', id: 'DESC' },
    });
    const item = this.items.create({
      clubId,
      userId,
      title,
      done: false,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    });
    return mapChecklistItem(await this.items.save(item));
  }

  async update(clubId: number, userId: number, id: number, dto: UpdateChecklistItemDto) {
    const item = await this.owned(clubId, userId, id);
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) {
        throw new BadRequestException('Escribe la tarea.');
      }
      item.title = title;
    }
    if (dto.done !== undefined) {
      item.done = dto.done;
    }
    return mapChecklistItem(await this.items.save(item));
  }

  async remove(clubId: number, userId: number, id: number): Promise<void> {
    const item = await this.owned(clubId, userId, id);
    await this.items.remove(item);
  }

  private async owned(clubId: number, userId: number, id: number) {
    const item = await this.items.findOne({ where: { id, clubId, userId } });
    if (!item) {
      throw new NotFoundException('No existe esa tarea.');
    }
    return item;
  }
}
