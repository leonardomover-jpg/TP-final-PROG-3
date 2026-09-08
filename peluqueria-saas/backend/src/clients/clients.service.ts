import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateClientNoteDto } from './dto/create-client-note.dto';

const CLIENT_SELECT = {
  id: true,
  tenantId: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  birthDate: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClientSelect;

@Injectable()
export class ClientsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll() {
    return this.tenantPrisma.client.client.findMany({
      where: { deletedAt: null },
      select: CLIENT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Ficha del cliente: datos personales + notas internas + un placeholder
  // de historial (turnos/ventas/puntos van a ir agregándose acá a medida
  // que existan esos módulos — doc `10-CLIENTES.md` §5, roadmap Etapa 6).
  async findOne(id: string) {
    const client = await this.tenantPrisma.client.client.findUnique({
      where: { id },
      select: {
        ...CLIENT_SELECT,
        deletedAt: true,
        clientNotes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!client || client.deletedAt) {
      throw new NotFoundException('Cliente no encontrado.');
    }
    const { deletedAt: _deletedAt, clientNotes, ...safeClient } = client;
    return {
      ...safeClient,
      notesHistory: clientNotes,
      history: {
        appointments: [],
        sales: [],
        loyaltyPoints: null,
        // Se completa en etapas futuras (10 Agenda/Turnos, 12 Ventas, 13
        // Fidelización) — se documenta como placeholder explícito, no como
        // un campo olvidado.
      },
    };
  }

  private async assertExists(id: string): Promise<void> {
    const client = await this.tenantPrisma.client.client.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!client || client.deletedAt) {
      throw new NotFoundException('Cliente no encontrado.');
    }
  }

  async create(dto: CreateClientDto) {
    return this.tenantPrisma.client.client.create({
      data: {
        // tenantId también lo inyecta tenant-scope.extension.ts, pero se
        // pasa explícito acá por el mismo motivo documentado en
        // UsersService.create: this.tenantPrisma.tenantId sale del JWT
        // verificado, no del body.
        tenantId: this.tenantPrisma.tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        email: dto.email,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        notes: dto.notes,
      },
      select: CLIENT_SELECT,
    });
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.assertExists(id);

    const data: Prisma.ClientUpdateInput = {
      ...(dto.firstName && { firstName: dto.firstName }),
      ...(dto.lastName && { lastName: dto.lastName }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.birthDate !== undefined && { birthDate: dto.birthDate ? new Date(dto.birthDate) : null }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.status && { status: dto.status }),
    };

    return this.tenantPrisma.client.client.update({
      where: { id },
      data,
      select: CLIENT_SELECT,
    });
  }

  // Soft delete (mismo patrón que User/Branch, punto 97 del pedido): se
  // conserva el historial (turnos/ventas futuros siguen apuntando a este
  // Client), se saca de las listas activas.
  async remove(id: string) {
    await this.assertExists(id);
    return this.tenantPrisma.client.client.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'inactive' },
      select: CLIENT_SELECT,
    });
  }

  // Notas internas (punto 25 del pedido: historial de observaciones por
  // empleado). Gateadas por los mismos permisos de clientes.ver/editar —
  // no se introduce un permiso granular nuevo sin un pedido concreto de
  // "quién puede ver notas y quién no" (doc 05 — decisión de scope, igual
  // que en etapas anteriores).
  async addNote(clientId: string, authorId: string, dto: CreateClientNoteDto) {
    await this.assertExists(clientId);
    return this.tenantPrisma.client.clientNote.create({
      data: { clientId, authorId, body: dto.body },
    });
  }

  async listNotes(clientId: string) {
    await this.assertExists(clientId);
    return this.tenantPrisma.client.clientNote.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
