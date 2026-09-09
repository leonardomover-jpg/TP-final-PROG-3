import { BadRequestException, ConflictException, Injectable, NotFoundException, Scope } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { ScheduleService } from '../schedule/schedule.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';

const APPOINTMENT_INCLUDE = {
  branch: { select: { id: true, name: true } },
  professional: { select: { id: true, firstName: true, lastName: true } },
  client: { select: { id: true, firstName: true, lastName: true, phone: true } },
  service: { select: { id: true, name: true, durationMinutes: true, price: true } },
} satisfies Prisma.AppointmentInclude;

const ACTIVE_STATUSES = ['pending', 'confirmed'];

// scope: REQUEST explícito (no confiar en la propagación automática de
// Nest acá): mismo patrón de riesgo documentado en SubscriptionsService
// (Etapa 5, doc `09` §8) — TenantPrismaService (REQUEST) + ScheduleService
// (de OTRO módulo) en el mismo constructor. Forzarlo evita tener que
// re-diagnosticar el mismo bug de scoping si vuelve a aparecer.
@Injectable({ scope: Scope.REQUEST })
export class AppointmentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly scheduleService: ScheduleService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  findAll(query: ListAppointmentsQueryDto) {
    return this.tenantPrisma.client.appointment.findMany({
      where: {
        ...(query.from || query.to
          ? { startAt: { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lte: new Date(query.to) }) } }
          : {}),
        ...(query.branchId && { branchId: query.branchId }),
        ...(query.professionalId && { professionalId: query.professionalId }),
        ...(query.clientId && { clientId: query.clientId }),
        ...(query.status && { status: query.status }),
      },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const appointment = await this.tenantPrisma.client.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) {
      throw new NotFoundException('Turno no encontrado.');
    }
    return appointment;
  }

  // El motor de disponibilidad real (punto de la Etapa 10 del roadmap):
  // valida pertenencia al tenant de las 4 referencias, que el profesional
  // esté habilitado para el servicio (ServiceProfessional, Etapa 8), que
  // el horario pedido caiga DENTRO de la disponibilidad real de ese día
  // (ScheduleService.getAvailability, Etapa 9 — excepción → feriado →
  // horario semanal) y que no se superponga con otro turno activo del
  // mismo profesional.
  async create(dto: CreateAppointmentDto) {
    const [branch, professional, client, service] = await Promise.all([
      this.tenantPrisma.client.branch.findUnique({ where: { id: dto.branchId } }),
      this.tenantPrisma.client.professional.findUnique({ where: { id: dto.professionalId } }),
      this.tenantPrisma.client.client.findUnique({ where: { id: dto.clientId } }),
      this.tenantPrisma.client.service.findUnique({ where: { id: dto.serviceId } }),
    ]);
    if (!branch || branch.deletedAt) {
      throw new BadRequestException('La sucursal indicada no existe en este negocio.');
    }
    if (!professional || professional.deletedAt) {
      throw new BadRequestException('El profesional indicado no existe en este negocio.');
    }
    if (!client || client.deletedAt) {
      throw new BadRequestException('El cliente indicado no existe en este negocio.');
    }
    if (!service || service.deletedAt) {
      throw new BadRequestException('El servicio indicado no existe en este negocio.');
    }

    const enabled = await this.tenantPrisma.client.serviceProfessional.findUnique({
      where: { serviceId_professionalId: { serviceId: dto.serviceId, professionalId: dto.professionalId } },
    });
    if (!enabled) {
      throw new BadRequestException('Ese profesional no está habilitado para prestar este servicio.');
    }

    const startAt = new Date(dto.startAt);
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

    // Misma simplificación de zona horaria que ScheduleService (doc
    // `13-HORARIOS.md` §7): las fechas/horas se tratan en UTC, sin
    // zona horaria por sucursal todavía.
    const dateKey = startAt.toISOString().slice(0, 10);
    const startHHmm = startAt.toISOString().slice(11, 16);
    const endHHmm = endAt.toISOString().slice(11, 16);

    const availability = await this.scheduleService.getAvailability({
      date: dateKey,
      professionalId: dto.professionalId,
    });
    const fitsInAvailability = availability.isOpen && availability.hours.some((h) => startHHmm >= h.startTime && endHHmm <= h.endTime);
    if (!fitsInAvailability) {
      throw new BadRequestException(
        availability.isOpen
          ? 'El horario pedido no entra dentro de la disponibilidad del profesional ese día.'
          : `El profesional no está disponible ese día${availability.reason ? ` (${availability.reason})` : ''}.`,
      );
    }

    // Sin superposición con otro turno ACTIVO (pending/confirmed) del
    // mismo profesional — un turno cancelado o completado no bloquea el
    // horario. Superposición clásica de intervalos: A empieza antes de que
    // B termine, Y A termina después de que B empiece.
    const overlapping = await this.tenantPrisma.client.appointment.findFirst({
      where: {
        professionalId: dto.professionalId,
        status: { in: ACTIVE_STATUSES },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (overlapping) {
      throw new ConflictException('El profesional ya tiene otro turno en ese horario.');
    }

    return this.tenantPrisma.client.appointment.create({
      data: {
        tenantId: this.tenantPrisma.tenantId,
        branchId: dto.branchId,
        professionalId: dto.professionalId,
        clientId: dto.clientId,
        serviceId: dto.serviceId,
        startAt,
        endAt,
        notes: dto.notes,
        status: 'pending',
      },
      include: APPOINTMENT_INCLUDE,
    });
  }

  private async assertTransition(id: string, allowedFrom: string[]) {
    const appointment = await this.tenantPrisma.client.appointment.findUnique({ where: { id } });
    if (!appointment) {
      throw new NotFoundException('Turno no encontrado.');
    }
    if (!allowedFrom.includes(appointment.status)) {
      throw new BadRequestException(
        `No se puede pasar un turno de estado "${appointment.status}" a este estado.`,
      );
    }
    return appointment;
  }

  async confirm(id: string) {
    await this.assertTransition(id, ['pending']);
    const appointment = await this.tenantPrisma.client.appointment.update({
      where: { id },
      data: { status: 'confirmed' },
      include: APPOINTMENT_INCLUDE,
    });
    // Best-effort (Etapa 16): nunca rompe la confirmación si falla el
    // envío o el negocio no tiene WhatsApp conectado — ver WhatsAppService.
    await this.whatsAppService.notifyAppointmentConfirmed(this.tenantPrisma.tenantId, appointment);
    return appointment;
  }

  async cancel(id: string, dto: CancelAppointmentDto) {
    await this.assertTransition(id, ACTIVE_STATUSES);
    const appointment = await this.tenantPrisma.client.appointment.update({
      where: { id },
      data: { status: 'cancelled', cancelReason: dto.reason },
      include: APPOINTMENT_INCLUDE,
    });
    await this.whatsAppService.notifyAppointmentCancelled(this.tenantPrisma.tenantId, appointment);
    return appointment;
  }

  async complete(id: string) {
    await this.assertTransition(id, ['confirmed']);
    return this.tenantPrisma.client.appointment.update({
      where: { id },
      data: { status: 'completed' },
      include: APPOINTMENT_INCLUDE,
    });
  }

  async markNoShow(id: string) {
    await this.assertTransition(id, ['confirmed']);
    return this.tenantPrisma.client.appointment.update({
      where: { id },
      data: { status: 'no_show' },
      include: APPOINTMENT_INCLUDE,
    });
  }

  // Disparo MANUAL (Etapa 16, doc `20-WHATSAPP.md` §6) — sin "Jobs en
  // background" (Capa Transversal, doc 01) todavía no hay forma de
  // programar un recordatorio automático en el momento justo antes del
  // turno; mientras tanto, el mostrador lo dispara a mano cuando lo
  // necesita.
  async sendReminder(id: string) {
    const appointment = await this.tenantPrisma.client.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) {
      throw new NotFoundException('Turno no encontrado.');
    }
    if (!ACTIVE_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(`No se puede recordar un turno "${appointment.status}".`);
    }
    await this.whatsAppService.sendReminder(this.tenantPrisma.tenantId, appointment);
    return { sent: true };
  }
}
