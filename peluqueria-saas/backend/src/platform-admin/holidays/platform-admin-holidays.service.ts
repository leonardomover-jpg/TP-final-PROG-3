import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';

@Injectable()
export class PlatformAdminHolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(year?: number) {
    return this.prisma.holiday.findMany({
      where: { ...(year && { year }) },
      orderBy: { date: 'asc' },
    });
  }

  async findOne(id: string) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) {
      throw new NotFoundException('Feriado no encontrado.');
    }
    return holiday;
  }

  async create(dto: CreateHolidayDto) {
    try {
      return await this.prisma.holiday.create({
        data: { date: new Date(dto.date), name: dto.name, year: dto.year },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un feriado cargado para esa fecha.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateHolidayDto) {
    await this.findOne(id);
    return this.prisma.holiday.update({
      where: { id },
      data: {
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.name && { name: dto.name }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Hard delete (no soft delete acá, a diferencia de los modelos de
    // negocio): un feriado cargado por error no tiene "historial" que
    // conservar — TenantHolidayOverride cae en cascada porque referencia
    // este id (ver migración).
    return this.prisma.holiday.delete({ where: { id } });
  }
}
