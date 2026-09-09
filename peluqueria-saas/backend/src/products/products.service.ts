import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(query: ListProductsQueryDto) {
    const products = await this.tenantPrisma.client.product.findMany({
      where: {
        deletedAt: null,
        // Productos de ESA sucursal + los compartidos (branchId null) —
        // nunca los de otra sucursal puntual (Etapa 19).
        ...(query.branchId && { OR: [{ branchId: query.branchId }, { branchId: null }] }),
      },
      orderBy: { createdAt: 'desc' },
    });
    // stock <= minStock no se puede expresar como filtro de Prisma (compara
    // dos columnas entre sí) sin SQL crudo — con el volumen esperado de
    // productos de un negocio, filtrar en memoria es más simple y no
    // justifica esa fricción.
    return query.lowStock === 'true' ? products.filter((p) => p.stock <= p.minStock) : products;
  }

  async findOne(id: string) {
    const product = await this.tenantPrisma.client.product.findUnique({ where: { id } });
    if (!product || product.deletedAt) {
      throw new NotFoundException('Producto no encontrado.');
    }
    return product;
  }

  private async assertExists(id: string) {
    const product = await this.findOne(id);
    return product;
  }

  private async assertBranchBelongsToTenant(branchId: string) {
    const branch = await this.tenantPrisma.client.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.deletedAt) {
      throw new BadRequestException('La sucursal indicada no existe en este negocio.');
    }
  }

  async create(dto: CreateProductDto) {
    if (dto.branchId) {
      await this.assertBranchBelongsToTenant(dto.branchId);
    }
    try {
      return await this.tenantPrisma.client.product.create({
        data: {
          tenantId: this.tenantPrisma.tenantId,
          branchId: dto.branchId,
          name: dto.name,
          sku: dto.sku,
          description: dto.description,
          category: dto.category,
          price: dto.price,
          unit: dto.unit ?? 'unidad',
          stock: dto.stock ?? 0,
          minStock: dto.minStock ?? 0,
          status: dto.status ?? 'active',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un producto con ese SKU en este negocio.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.assertExists(id);
    if (dto.branchId) {
      await this.assertBranchBelongsToTenant(dto.branchId);
    }

    const data: Prisma.ProductUpdateInput = {
      ...(dto.branchId && { branch: { connect: { id: dto.branchId } } }),
      ...(dto.name && { name: dto.name }),
      ...(dto.sku !== undefined && { sku: dto.sku }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.price !== undefined && { price: dto.price }),
      ...(dto.unit && { unit: dto.unit }),
      ...(dto.minStock !== undefined && { minStock: dto.minStock }),
      ...(dto.status && { status: dto.status }),
    };

    try {
      return await this.tenantPrisma.client.product.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un producto con ese SKU en este negocio.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.assertExists(id);
    return this.tenantPrisma.client.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'inactive' },
    });
  }

  // Ajuste manual de stock (mermas, roturas, conteo de inventario que
  // encontró una diferencia) — no es una compra ni una venta, así que no
  // pasa por Purchase. Sin ledger de movimientos en esta etapa (doc
  // `15-PRODUCTOS-INVENTARIO.md` §6): el valor resultante queda en
  // Product.stock, con el motivo solo en la respuesta de este endpoint,
  // no persistido aparte.
  async adjustStock(id: string, dto: StockAdjustmentDto) {
    const product = await this.assertExists(id);
    const newStock = product.stock + dto.delta;
    if (newStock < 0) {
      throw new BadRequestException(
        `El ajuste dejaría el stock en ${newStock}: no puede quedar negativo (stock actual: ${product.stock}).`,
      );
    }
    const updated = await this.tenantPrisma.client.product.update({ where: { id }, data: { stock: newStock } });

    // Aviso solo en el CRUCE hacia stock bajo (Etapa 14) — si ya estaba
    // bajo antes de este ajuste, no se repite en cada ajuste posterior.
    if (newStock <= product.minStock && product.stock > product.minStock) {
      await this.notificationsService.notifyUsersWithPermission(
        this.tenantPrisma.tenantId,
        'inventario.gestionar',
        'low_stock',
        `Stock bajo: ${product.name}`,
        `El stock de "${product.name}" bajó a ${newStock} unidades (mínimo: ${product.minStock}).`,
        { productId: id },
      );
    }

    return updated;
  }
}
