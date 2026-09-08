import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';

@Injectable()
export class PlatformAdminFeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async findOne(id: string) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!flag) {
      throw new NotFoundException('Módulo no encontrado.');
    }
    return flag;
  }

  async create(dto: CreateFeatureFlagDto) {
    try {
      return await this.prisma.featureFlag.create({
        data: {
          key: dto.key,
          name: dto.name,
          description: dto.description,
          globallyEnabled: dto.globallyEnabled ?? false,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un módulo con esa key.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateFeatureFlagDto) {
    await this.findOne(id);
    return this.prisma.featureFlag.update({ where: { id }, data: dto });
  }
}
