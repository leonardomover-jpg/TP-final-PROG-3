import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { ListDepositsQueryDto } from './dto/list-deposits.query.dto';
import { createPreference } from '../mercado-pago/mercado-pago-client';
import { resolveMercadoPagoCredentials } from '../integrations/mercado-pago-credentials.util';

const PAYABLE_APPOINTMENT_STATUSES = ['pending', 'confirmed'];

/**
 * Señas para confirmar un turno (Etapa 15, doc `19-MERCADO-PAGO-CLIENTES.md`
 * §3). El checkout se genera con la cuenta de Mercado Pago DE ESE TENANT
 * (`TenantIntegration`, nunca la de la plataforma) — el negocio comparte
 * el link con el cliente por el canal que tenga hoy; el estado real de la
 * seña solo lo confirma el webhook (nunca este endpoint ni el cliente).
 */
@Injectable()
export class DepositsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  findAll(query: ListDepositsQueryDto) {
    return this.tenantPrisma.client.deposit.findMany({
      where: { ...(query.appointmentId && { appointmentId: query.appointmentId }) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const deposit = await this.tenantPrisma.client.deposit.findUnique({ where: { id } });
    if (!deposit) {
      throw new NotFoundException('Seña no encontrada.');
    }
    return deposit;
  }

  async create(dto: CreateDepositDto) {
    const appointment = await this.tenantPrisma.client.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: { service: { select: { name: true } } },
    });
    if (!appointment) {
      throw new BadRequestException('El turno indicado no existe en este negocio.');
    }
    if (!PAYABLE_APPOINTMENT_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(`No se puede generar una seña para un turno "${appointment.status}".`);
    }

    // Se resuelve ANTES de crear la fila: si el negocio no tiene Mercado
    // Pago conectado, no queda ninguna Deposit "pending" huérfana.
    const credentials = await resolveMercadoPagoCredentials(this.prisma, this.tenantPrisma.tenantId);

    let deposit;
    try {
      deposit = await this.tenantPrisma.client.deposit.create({
        data: {
          tenantId: this.tenantPrisma.tenantId,
          appointmentId: dto.appointmentId,
          amount: dto.amount,
          status: 'pending',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este turno ya tiene una seña generada.');
      }
      throw error;
    }

    const notificationUrl = process.env.APP_PUBLIC_URL
      ? `${process.env.APP_PUBLIC_URL}/api/v1/webhooks/mercado-pago/tenant/${this.tenantPrisma.tenantId}`
      : undefined;

    try {
      const preference = await createPreference(
        credentials,
        {
          title: `Seña — ${appointment.service.name}`,
          quantity: 1,
          unitPrice: dto.amount,
          externalReference: deposit.id,
        },
        notificationUrl,
      );
      await this.tenantPrisma.client.deposit.update({
        where: { id: deposit.id },
        data: { mpPreferenceId: preference.id },
      });
      return { ...deposit, mpPreferenceId: preference.id, initPoint: preference.initPoint, sandboxInitPoint: preference.sandboxInitPoint };
    } catch (error) {
      // Compensación: sin preferencia, la Deposit no sirve para nada — no
      // se deja una fila "pending" sin forma de pagarse.
      await this.tenantPrisma.client.deposit.delete({ where: { id: deposit.id } });
      throw error;
    }
  }
}
