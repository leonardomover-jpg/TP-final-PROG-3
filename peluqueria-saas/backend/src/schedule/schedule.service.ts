import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { ListExceptionsQueryDto } from './dto/list-exceptions.query.dto';
import { SetHolidayOverrideDto } from './dto/set-holiday-override.dto';
import { AvailabilityQueryDto } from './dto/availability.query.dto';

interface AvailabilityResult {
  date: string;
  isOpen: boolean;
  hours: { startTime: string; endTime: string }[];
  reason: string | null;
}

/**
 * Excepciones puntuales, feriados (con override por negocio) y el cálculo
 * de disponibilidad de UN día para una sucursal o un profesional,
 * combinando esas dos fuentes con el horario semanal recurrente
 * (BranchSchedule / ProfessionalSchedule, ya modelados en las Etapas 7/9).
 *
 * Esto NO es el motor de turnos: no genera slots reservables ni valida
 * superposición con turnos ya tomados (eso es la Etapa 10, que sí depende
 * de este cálculo como su primera pregunta: "¿está abierto/disponible este
 * día, y en qué horario?").
 */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    // Holiday es catálogo global de plataforma (igual que Plan/Permission
    // en otros services) — PrismaService crudo es correcto acá.
    private readonly prisma: PrismaService,
  ) {}

  // ── Excepciones ──────────────────────────────────────────────────────

  async createException(dto: CreateExceptionDto) {
    if (!!dto.branchId === !!dto.professionalId) {
      throw new BadRequestException('Indicá exactamente uno de branchId o professionalId.');
    }
    if (dto.isClosed === false && (!dto.startTime || !dto.endTime)) {
      throw new BadRequestException('Si isClosed es false, startTime y endTime son obligatorios.');
    }

    if (dto.branchId) {
      const branch = await this.tenantPrisma.client.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch || branch.deletedAt) {
        throw new BadRequestException('La sucursal indicada no existe en este negocio.');
      }
    } else {
      const professional = await this.tenantPrisma.client.professional.findUnique({
        where: { id: dto.professionalId },
      });
      if (!professional || professional.deletedAt) {
        throw new BadRequestException('El profesional indicado no existe en este negocio.');
      }
    }

    return this.tenantPrisma.client.scheduleException.create({
      data: {
        tenantId: this.tenantPrisma.tenantId,
        branchId: dto.branchId,
        professionalId: dto.professionalId,
        date: new Date(dto.date),
        isClosed: dto.isClosed ?? true,
        startTime: dto.isClosed === false ? dto.startTime : null,
        endTime: dto.isClosed === false ? dto.endTime : null,
        reason: dto.reason,
      },
    });
  }

  listExceptions(query: ListExceptionsQueryDto) {
    return this.tenantPrisma.client.scheduleException.findMany({
      where: {
        ...(query.branchId && { branchId: query.branchId }),
        ...(query.professionalId && { professionalId: query.professionalId }),
      },
      orderBy: { date: 'asc' },
    });
  }

  async removeException(id: string) {
    const exception = await this.tenantPrisma.client.scheduleException.findUnique({ where: { id } });
    if (!exception) {
      throw new NotFoundException('Excepción no encontrada.');
    }
    await this.tenantPrisma.client.scheduleException.delete({ where: { id } });
  }

  // ── Feriados ──────────────────────────────────────────────────────────

  // Catálogo global + el override de ESTE tenant mergeado (sin fila propia
  // = "isOpen: false" por default, doc `13-HORARIOS.md` §4).
  async listHolidays(year?: number) {
    const [holidays, overrides] = await Promise.all([
      this.prisma.holiday.findMany({ where: { ...(year && { year }) }, orderBy: { date: 'asc' } }),
      this.tenantPrisma.client.tenantHolidayOverride.findMany({}),
    ]);
    const overrideByHolidayId = new Map(overrides.map((o) => [o.holidayId, o.isOpen]));
    return holidays.map((h) => ({ ...h, isOpenForTenant: overrideByHolidayId.get(h.id) ?? false }));
  }

  async setHolidayOverride(holidayId: string, dto: SetHolidayOverrideDto) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id: holidayId } });
    if (!holiday) {
      throw new NotFoundException('Feriado no encontrado.');
    }
    return this.tenantPrisma.client.tenantHolidayOverride.upsert({
      where: { tenantId_holidayId: { tenantId: this.tenantPrisma.tenantId, holidayId } },
      create: { tenantId: this.tenantPrisma.tenantId, holidayId, isOpen: dto.isOpen },
      update: { isOpen: dto.isOpen },
    });
  }

  // ── Disponibilidad combinada ─────────────────────────────────────────

  async getAvailability(query: AvailabilityQueryDto): Promise<AvailabilityResult> {
    if (!!query.branchId === !!query.professionalId) {
      throw new BadRequestException('Indicá exactamente uno de branchId o professionalId.');
    }
    // BranchSchedule/ProfessionalSchedule no tienen tenantId propio y no
    // los filtra la extensión (doc en tenant-scope.extension.ts) — sin
    // esta validación, pasar el id de una sucursal/profesional de OTRO
    // tenant filtraría su horario semanal. branch.findUnique/
    // professional.findUnique sí están interceptados, así que un id ajeno
    // simplemente no aparece acá.
    if (query.branchId) {
      const branch = await this.tenantPrisma.client.branch.findUnique({ where: { id: query.branchId } });
      if (!branch) {
        throw new NotFoundException('Sucursal no encontrada.');
      }
    } else {
      const professional = await this.tenantPrisma.client.professional.findUnique({
        where: { id: query.professionalId },
      });
      if (!professional) {
        throw new NotFoundException('Profesional no encontrado.');
      }
    }

    const date = new Date(query.date);
    // getUTCDay(), no getDay(): la fecha llega como "YYYY-MM-DD" (sin hora),
    // que Date la interpreta en UTC — usar el día local del servidor
    // desalinearía el día de la semana según la zona horaria del proceso.
    const dayOfWeek = date.getUTCDay();

    const exception = query.branchId
      ? await this.tenantPrisma.client.scheduleException.findFirst({
          where: { branchId: query.branchId, date },
        })
      : await this.tenantPrisma.client.scheduleException.findFirst({
          where: { professionalId: query.professionalId, date },
        });
    if (exception) {
      return exception.isClosed
        ? { date: query.date, isOpen: false, hours: [], reason: exception.reason ?? 'Excepción' }
        : {
            date: query.date,
            isOpen: true,
            hours: [{ startTime: exception.startTime!, endTime: exception.endTime! }],
            reason: exception.reason ?? 'Horario excepcional',
          };
    }

    const holiday = await this.prisma.holiday.findUnique({ where: { date } });
    if (holiday) {
      const override = await this.tenantPrisma.client.tenantHolidayOverride.findUnique({
        where: { tenantId_holidayId: { tenantId: this.tenantPrisma.tenantId, holidayId: holiday.id } },
      });
      if (!override?.isOpen) {
        return { date: query.date, isOpen: false, hours: [], reason: `Feriado: ${holiday.name}` };
      }
      // isOpen=true en el override: sigue evaluando el horario semanal de
      // abajo (el negocio decidió abrir este feriado con su horario normal).
    }

    const weeklyEntries = query.branchId
      ? await this.tenantPrisma.client.branchSchedule.findMany({
          where: { branchId: query.branchId, dayOfWeek },
          orderBy: { startTime: 'asc' },
        })
      : await this.tenantPrisma.client.professionalSchedule.findMany({
          where: { professionalId: query.professionalId, dayOfWeek },
          orderBy: { startTime: 'asc' },
        });

    if (weeklyEntries.length === 0) {
      return { date: query.date, isOpen: false, hours: [], reason: 'Sin horario cargado para este día.' };
    }
    return {
      date: query.date,
      isOpen: true,
      hours: weeklyEntries.map((e) => ({ startTime: e.startTime, endTime: e.endTime })),
      reason: null,
    };
  }
}
