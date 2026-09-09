import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

const PURCHASE_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
} as const;

/**
 * Una compra a un proveedor, con sus ítems. `pending` no toca stock;
 * `receive()` es la única operación que lo hace, en una transacción (doc
 * `15-PRODUCTOS-INVENTARIO.md` §3): por cada ítem, incrementa
 * Product.stock y actualiza Product.cost al último costo de compra.
 */
@Injectable()
export class PurchasesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll() {
    return this.tenantPrisma.client.purchase.findMany({
      include: PURCHASE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const purchase = await this.tenantPrisma.client.purchase.findUnique({
      where: { id },
      include: PURCHASE_INCLUDE,
    });
    if (!purchase) {
      throw new NotFoundException('Compra no encontrada.');
    }
    return purchase;
  }

  async create(dto: CreatePurchaseDto) {
    const supplier = await this.tenantPrisma.client.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || supplier.deletedAt) {
      throw new BadRequestException('El proveedor indicado no existe en este negocio.');
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.tenantPrisma.client.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Alguno de los productos indicados no existe en este negocio.');
    }

    return this.tenantPrisma.client.purchase.create({
      data: {
        tenantId: this.tenantPrisma.tenantId,
        supplierId: dto.supplierId,
        notes: dto.notes,
        status: 'pending',
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
        },
      },
      include: PURCHASE_INCLUDE,
    });
  }

  private async assertPending(id: string) {
    const purchase = await this.tenantPrisma.client.purchase.findUnique({ where: { id } });
    if (!purchase) {
      throw new NotFoundException('Compra no encontrada.');
    }
    if (purchase.status !== 'pending') {
      throw new BadRequestException(`La compra ya está en estado "${purchase.status}", no se puede modificar.`);
    }
    return purchase;
  }

  async receive(id: string) {
    await this.assertPending(id);
    const items = await this.tenantPrisma.client.purchaseItem.findMany({ where: { purchaseId: id } });

    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.purchase.update({
        where: { id },
        data: { status: 'received', receivedAt: new Date() },
      }),
      ...items.map((item) =>
        this.tenantPrisma.client.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity }, cost: item.unitCost },
        }),
      ),
    ]);

    return this.findOne(id);
  }

  async cancel(id: string) {
    await this.assertPending(id);
    return this.tenantPrisma.client.purchase.update({
      where: { id },
      data: { status: 'cancelled' },
      include: PURCHASE_INCLUDE,
    });
  }
}
