import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { sendTextMessage } from './whatsapp-client';
import { resolveWhatsAppCredentialsOrNull } from '../integrations/whatsapp-credentials.util';

interface AppointmentForMessage {
  startAt: Date;
  service: { name: string };
  client: { phone: string | null };
}

// Mismo criterio de UTC-sin-zona-horaria-por-sucursal ya documentado en
// ScheduleService (doc `13-HORARIOS.md` §7) — se formatea la fecha tal
// cual está guardada, sin convertir a ninguna zona.
function formatWhen(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Envío de mensajes de WhatsApp (Etapa 16, doc `20-WHATSAPP.md`). Singleton
 * sin estado — mismo molde que `NotificationsService`/`FeatureFlagsService`:
 * lo inyecta `AppointmentsService` (request-scoped), así que no puede
 * depender de `TenantPrismaService` sin arrastrar el riesgo de scope ya
 * documentado en Etapas 2/5/10/14.
 *
 * NUNCA deja que un fallo de WhatsApp rompa el flujo que lo dispara
 * (confirmar/cancelar un turno sigue funcionando aunque el envío falle o
 * el negocio no tenga WhatsApp conectado) — se resuelve todo en `trySend`,
 * que absorbe cualquier error y solo lo deja en el log.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger('WhatsAppService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  private async trySend(tenantId: string, to: string | null | undefined, body: string): Promise<void> {
    if (!to) {
      return;
    }
    try {
      const enabled = await this.featureFlagsService.isEnabledForTenant(tenantId, 'whatsapp');
      if (!enabled) {
        return;
      }
      const credentials = await resolveWhatsAppCredentialsOrNull(this.prisma, tenantId);
      if (!credentials) {
        return;
      }
      await sendTextMessage(credentials, to, body);
    } catch (error) {
      this.logger.warn(`No se pudo enviar el WhatsApp a ${to} (tenant ${tenantId}): ${error}`);
    }
  }

  notifyAppointmentConfirmed(tenantId: string, appointment: AppointmentForMessage) {
    return this.trySend(
      tenantId,
      appointment.client.phone,
      `Tu turno para "${appointment.service.name}" el ${formatWhen(appointment.startAt)} fue confirmado. ¡Te esperamos!`,
    );
  }

  notifyAppointmentCancelled(tenantId: string, appointment: AppointmentForMessage) {
    return this.trySend(
      tenantId,
      appointment.client.phone,
      `Tu turno para "${appointment.service.name}" el ${formatWhen(appointment.startAt)} fue cancelado.`,
    );
  }

  // A diferencia de `notifyAppointmentConfirmed`/`Cancelled` (best-effort,
  // secundario a la transición de estado que los dispara), acá SÍ importa
  // que el negocio sepa si el recordatorio se mandó de verdad — es la
  // única razón de ser de este endpoint (doc `20-WHATSAPP.md` §6).
  async sendReminder(tenantId: string, appointment: AppointmentForMessage): Promise<void> {
    if (!appointment.client.phone) {
      throw new BadRequestException('El cliente de este turno no tiene un teléfono cargado.');
    }
    const enabled = await this.featureFlagsService.isEnabledForTenant(tenantId, 'whatsapp');
    if (!enabled) {
      throw new BadRequestException('Este negocio no tiene el módulo de WhatsApp habilitado.');
    }
    const credentials = await resolveWhatsAppCredentialsOrNull(this.prisma, tenantId);
    if (!credentials) {
      throw new BadRequestException('Este negocio no tiene WhatsApp conectado.');
    }
    await sendTextMessage(
      credentials,
      appointment.client.phone,
      `Te recordamos tu turno para "${appointment.service.name}" el ${formatWhen(appointment.startAt)}.`,
    );
  }
}
