import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CancelSaleDto } from './dto/cancel-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales.query.dto';
import { CommissionsQueryDto } from './dto/commissions.query.dto';
import { NotificationsService } from '../notifications/notifications.service';

const SALE_INCLUDE = {
  branch: { select: { id: true, name: true } },
  client: { select: { id: true, firstName: true, lastName: true } },
  professional: { select: { id: true, firstName: true, lastName: true } },
  items: true,
  payments: true,
} as const;

// Centésimos de tolerancia al comparar la suma de pagos contra el total —
// evita falsos rechazos por redondeo de punto flotante en el cliente
// (0.1 + 0.2 !== 0.3), sin abrir la puerta a un pago mal armado de verdad.
const AMOUNT_EPSILON = 0.01;

/**
 * Ventas mixtas (servicios + productos) con pagos combinados (punto de la
 * Etapa 12 del roadmap). El precio de cada ítem SIEMPRE sale del catálogo
 * (Service.price/Product.price) en el momento de la venta, nunca del
 * body del request — mismo principio ya aplicado con Mercado Pago en la
 * Etapa 5: no confiar en el cliente para montos de dinero.
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  findAll(query: ListSalesQueryDto) {
    return this.tenantPrisma.client.sale.findMany({
      where: {
        ...(query.from || query.to
          ? { createdAt: { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lte: new Date(query.to) }) } }
          : {}),
        ...(query.branchId && { branchId: query.branchId }),
        ...(query.clientId && { clientId: query.clientId }),
        ...(query.professionalId && { professionalId: query.professionalId }),
        ...(query.status && { status: query.status }),
      },
      include: SALE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const sale = await this.tenantPrisma.client.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
    if (!sale) {
      throw new NotFoundException('Venta no encontrada.');
    }
    return sale;
  }

  async create(dto: CreateSaleDto) {
    const [branch, cashRegister] = await Promise.all([
      this.tenantPrisma.client.branch.findUnique({ where: { id: dto.branchId } }),
      this.tenantPrisma.client.cashRegister.findUnique({ where: { id: dto.cashRegisterId } }),
    ]);
    if (!branch || branch.deletedAt) {
      throw new BadRequestException('La sucursal indicada no existe en este negocio.');
    }
    if (!cashRegister) {
      throw new BadRequestException('La caja indicada no existe en este negocio.');
    }
    if (cashRegister.status !== 'open' || cashRegister.branchId !== dto.branchId) {
      throw new BadRequestException('La caja indicada no está abierta en esa sucursal.');
    }
    if (dto.clientId) {
      const client = await this.tenantPrisma.client.client.findUnique({ where: { id: dto.clientId } });
      if (!client || client.deletedAt) {
        throw new BadRequestException('El cliente indicado no existe en este negocio.');
      }
    }
    if (dto.professionalId) {
      const professional = await this.tenantPrisma.client.professional.findUnique({
        where: { id: dto.professionalId },
      });
      if (!professional || professional.deletedAt) {
        throw new BadRequestException('El profesional indicado no existe en este negocio.');
      }
    }

    // Precio SIEMPRE del catálogo — se resuelve acá, nunca se toma del body.
    const resolvedItems: {
      itemType: string;
      serviceId?: string;
      productId?: string;
      name: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }[] = [];
    // Foto del stock/minStock de cada producto ANTES de descontar — se usa
    // después de la transacción para detectar el cruce hacia stock bajo
    // (Etapa 14), sin repetir la consulta.
    const productSnapshots = new Map<string, { name: string; stock: number; minStock: number }>();
    for (const item of dto.items) {
      if (item.itemType === 'service') {
        if (!item.serviceId || item.productId) {
          throw new BadRequestException('Un ítem de tipo "service" debe traer serviceId y no productId.');
        }
        const service = await this.tenantPrisma.client.service.findUnique({ where: { id: item.serviceId } });
        if (!service || service.deletedAt) {
          throw new BadRequestException('Alguno de los servicios indicados no existe en este negocio.');
        }
        const unitPrice = service.price.toNumber();
        resolvedItems.push({
          itemType: 'service',
          serviceId: service.id,
          name: service.name,
          quantity: item.quantity,
          unitPrice,
          subtotal: unitPrice * item.quantity,
        });
      } else {
        if (!item.productId || item.serviceId) {
          throw new BadRequestException('Un ítem de tipo "product" debe traer productId y no serviceId.');
        }
        const product = await this.tenantPrisma.client.product.findUnique({ where: { id: item.productId } });
        if (!product || product.deletedAt) {
          throw new BadRequestException('Alguno de los productos indicados no existe en este negocio.');
        }
        // Etapa 19: un producto con stock exclusivo de una sucursal no se
        // puede vender desde otra — branchId null (compartido) se puede
        // vender desde cualquiera, mismo comportamiento que antes de esta etapa.
        if (product.branchId && product.branchId !== dto.branchId) {
          throw new BadRequestException(
            `"${product.name}" pertenece a otra sucursal y no se puede vender desde esta.`,
          );
        }
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente de "${product.name}" (disponible: ${product.stock}, pedido: ${item.quantity}).`,
          );
        }
        const unitPrice = product.price.toNumber();
        resolvedItems.push({
          itemType: 'product',
          productId: product.id,
          name: product.name,
          quantity: item.quantity,
          unitPrice,
          subtotal: unitPrice * item.quantity,
        });
        productSnapshots.set(product.id, { name: product.name, stock: product.stock, minStock: product.minStock });
      }
    }

    const total = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const paymentsTotal = dto.payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paymentsTotal - total) > AMOUNT_EPSILON) {
      throw new BadRequestException(
        `Los pagos suman ${paymentsTotal.toFixed(2)} pero el total de la venta es ${total.toFixed(2)}.`,
      );
    }

    // Ítems de producto agrupados por productId (puede venir más de un
    // ítem del mismo producto): la cantidad total a descontar es la suma.
    const stockDeltas = new Map<string, number>();
    for (const item of resolvedItems) {
      if (item.productId) {
        stockDeltas.set(item.productId, (stockDeltas.get(item.productId) ?? 0) + item.quantity);
      }
    }

    const sale = await this.tenantPrisma.client.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          tenantId: this.tenantPrisma.tenantId,
          branchId: dto.branchId,
          cashRegisterId: dto.cashRegisterId,
          clientId: dto.clientId,
          professionalId: dto.professionalId,
          status: 'completed',
          total,
          items: { create: resolvedItems },
          payments: { create: dto.payments },
        },
        include: SALE_INCLUDE,
      });

      for (const [productId, quantity] of stockDeltas) {
        await tx.product.update({ where: { id: productId }, data: { stock: { decrement: quantity } } });
      }

      return created;
    });

    // Recién después de confirmada la transacción (nunca si algo la hizo
    // fallar) — mismo cruce que ProductsService.adjustStock, sobre la foto
    // de stock tomada antes de descontar.
    for (const [productId, quantity] of stockDeltas) {
      const snapshot = productSnapshots.get(productId);
      if (!snapshot) continue;
      const newStock = snapshot.stock - quantity;
      if (newStock <= snapshot.minStock && snapshot.stock > snapshot.minStock) {
        await this.notificationsService.notifyUsersWithPermission(
          this.tenantPrisma.tenantId,
          'inventario.gestionar',
          'low_stock',
          `Stock bajo: ${snapshot.name}`,
          `El stock de "${snapshot.name}" bajó a ${newStock} unidades (mínimo: ${snapshot.minStock}).`,
          { productId },
        );
      }
    }

    return sale;
  }

  // Repone el stock de los ítems de producto — una venta cancelada nunca
  // debería dejar el inventario "corto" por algo que no se llevó nadie.
  async cancel(id: string, dto: CancelSaleDto) {
    const sale = await this.tenantPrisma.client.sale.findUnique({ where: { id }, include: { items: true } });
    if (!sale) {
      throw new NotFoundException('Venta no encontrada.');
    }
    if (sale.status !== 'completed') {
      throw new BadRequestException('Esta venta ya está cancelada.');
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      for (const item of sale.items) {
        if (item.productId) {
          await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        }
      }
      return tx.sale.update({
        where: { id },
        data: { status: 'cancelled', cancelReason: dto.reason },
        include: SALE_INCLUDE,
      });
    });
  }

  // Comisiones (punto de la Etapa 12 del roadmap): solo sobre el
  // SUBTOTAL DE SERVICIOS de cada venta completada con profesional
  // asignado — la venta de productos no comisiona con este porcentaje
  // (doc `16-VENTAS-CAJA-GASTOS-COMISIONES.md` §6). Reporte calculado al
  // vuelo, sin persistir una liquidación — eso es una extensión natural
  // si aparece el caso concreto, no antes.
  async getCommissions(query: CommissionsQueryDto) {
    const sales = await this.tenantPrisma.client.sale.findMany({
      where: {
        status: 'completed',
        professionalId: query.professionalId ?? { not: null },
        ...(query.from || query.to
          ? { createdAt: { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lte: new Date(query.to) }) } }
          : {}),
      },
      include: {
        items: true,
        professional: { select: { id: true, firstName: true, lastName: true, commissionPercentage: true } },
      },
    });

    const byProfessional = new Map<
      string,
      { professionalId: string; professionalName: string; commissionPercentage: number; serviceSubtotal: number; commission: number; salesCount: number }
    >();

    for (const sale of sales) {
      if (!sale.professional || sale.professional.commissionPercentage === null) {
        continue; // sin comisión configurada: no entra en el reporte, no es un 0 engañoso
      }
      const serviceSubtotal = sale.items
        .filter((item) => item.itemType === 'service')
        .reduce((sum, item) => sum + item.subtotal.toNumber(), 0);
      if (serviceSubtotal === 0) continue;

      const percentage = sale.professional.commissionPercentage.toNumber();
      const key = sale.professional.id;
      const entry = byProfessional.get(key) ?? {
        professionalId: key,
        professionalName: `${sale.professional.firstName} ${sale.professional.lastName}`,
        commissionPercentage: percentage,
        serviceSubtotal: 0,
        commission: 0,
        salesCount: 0,
      };
      entry.serviceSubtotal += serviceSubtotal;
      entry.commission += (serviceSubtotal * percentage) / 100;
      entry.salesCount += 1;
      byProfessional.set(key, entry);
    }

    return [...byProfessional.values()];
  }
}
