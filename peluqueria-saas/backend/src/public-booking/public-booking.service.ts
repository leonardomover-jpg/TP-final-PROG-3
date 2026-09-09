import { BadRequestException, Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { ScheduleService } from '../schedule/schedule.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';
import { AvailabilityQueryDto } from '../schedule/dto/availability.query.dto';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';

// Selects explícitos de campos "seguros" para exponer sin login: nunca
// costos, stock, comisiones, notas internas ni datos de otros negocios —
// solo lo que un cliente necesita para elegir y reservar (doc
// `22-PAGINA-PUBLICA-QR-PWA.md` §3).
const PUBLIC_BRANCH_SELECT = { id: true, name: true, address: true } as const;
const PUBLIC_SERVICE_SELECT = {
  id: true,
  name: true,
  description: true,
  category: true,
  durationMinutes: true,
  price: true,
} as const;
const PUBLIC_PROFESSIONAL_SELECT = { id: true, firstName: true, lastName: true, specialties: true } as const;

@Injectable()
export class PublicBookingService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly scheduleService: ScheduleService,
    private readonly appointmentsService: AppointmentsService,
    private readonly planLimitsService: PlanLimitsService,
  ) {}

  // request.tenant lo setea PublicTenantGuard — evita una segunda consulta
  // acá solo para el nombre del negocio.
  async getCatalog(tenantName: string) {
    const [branches, services, professionals] = await Promise.all([
      this.tenantPrisma.client.branch.findMany({
        where: { status: 'active', deletedAt: null },
        select: PUBLIC_BRANCH_SELECT,
        orderBy: { name: 'asc' },
      }),
      this.tenantPrisma.client.service.findMany({
        where: { status: 'active', deletedAt: null },
        select: PUBLIC_SERVICE_SELECT,
        orderBy: { name: 'asc' },
      }),
      this.tenantPrisma.client.professional.findMany({
        where: { status: 'active', deletedAt: null },
        select: PUBLIC_PROFESSIONAL_SELECT,
        orderBy: { firstName: 'asc' },
      }),
    ]);

    return { businessName: tenantName, branches, services, professionals };
  }

  // Delega 100% en ScheduleService.getAvailability (Etapa 9, ya probado) —
  // PublicTenantGuard ya dejó a tenantPrisma acotada al tenant correcto,
  // así que no hay nada tenant-específico que reimplementar acá.
  getAvailability(query: AvailabilityQueryDto) {
    return this.scheduleService.getAvailability(query);
  }

  async createAppointment(dto: CreatePublicAppointmentDto) {
    if (!dto.clientPhone && !dto.clientEmail) {
      throw new BadRequestException('Indicá al menos un teléfono o email de contacto.');
    }

    // Busca por teléfono primero (más estable que el email para un
    // negocio local) para no duplicar el mismo cliente en cada reserva.
    const existingClient = dto.clientPhone
      ? await this.tenantPrisma.client.client.findFirst({
          where: { phone: dto.clientPhone, deletedAt: null },
        })
      : await this.tenantPrisma.client.client.findFirst({
          where: { email: dto.clientEmail, deletedAt: null },
        });

    const client =
      existingClient ??
      (await (async () => {
        // El alta pública de un cliente NUEVO tiene que respetar el mismo
        // límite de plan que ClientsController (PlanLimitsGuard) — acá se
        // llama a mano porque este flujo crea el Client directamente, sin
        // pasar por ese controller (doc `22-PAGINA-PUBLICA-QR-PWA.md` §4).
        await this.planLimitsService.assertCanCreate(this.tenantPrisma.tenantId, 'clients');
        return this.tenantPrisma.client.client.create({
          data: {
            tenantId: this.tenantPrisma.tenantId,
            firstName: dto.clientFirstName,
            lastName: dto.clientLastName,
            phone: dto.clientPhone,
            email: dto.clientEmail,
          },
        });
      })());

    // Reusa AppointmentsService.create tal cual (Etapa 10, ya probado):
    // valida sucursal/profesional/servicio, habilitación del profesional
    // para el servicio, y disponibilidad — cero lógica de turnos duplicada.
    return this.appointmentsService.create({
      branchId: dto.branchId,
      professionalId: dto.professionalId,
      clientId: client.id,
      serviceId: dto.serviceId,
      startAt: dto.startAt,
      notes: dto.notes,
    });
  }

  // El QR codifica la URL pública del catálogo de este negocio. Todavía no
  // existe una página HTML real (Etapa 18 quedó "solo backend" por
  // decisión explícita) — apunta al propio endpoint JSON de la API como
  // placeholder honesto, documentado en `22-PAGINA-PUBLICA-QR-PWA.md` §5.
  async generateQrPng(tenantSlug: string): Promise<Buffer> {
    const base = process.env.APP_PUBLIC_URL ?? 'http://localhost:3000';
    const url = `${base}/api/v1/public/${tenantSlug}`;
    return QRCode.toBuffer(url, { type: 'png', width: 320, margin: 2 });
  }
}
