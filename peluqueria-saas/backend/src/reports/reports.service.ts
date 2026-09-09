import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ExportQueryDto } from './dto/export-query.dto';
import { buildCsv, buildPdf, buildXlsx, ExportColumn } from './export-formats';

const SALES_COLUMNS: ExportColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'date', label: 'Fecha' },
  { key: 'branch', label: 'Sucursal' },
  { key: 'client', label: 'Cliente' },
  { key: 'professional', label: 'Profesional' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Estado' },
];

const APPOINTMENTS_COLUMNS: ExportColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'startAt', label: 'Inicio' },
  { key: 'branch', label: 'Sucursal' },
  { key: 'professional', label: 'Profesional' },
  { key: 'client', label: 'Cliente' },
  { key: 'service', label: 'Servicio' },
  { key: 'status', label: 'Estado' },
];

@Injectable()
export class ReportsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) };
  }

  async getDashboard(query: DashboardQueryDto) {
    const createdAtRange = this.dateRange(query.from, query.to);
    const branchFilter = query.branchId ? { branchId: query.branchId } : {};

    // findMany + agregación en memoria en vez de groupBy/aggregate a
    // propósito: tenant-scope.extension.ts (doc `02-MULTI-TENANCY.md` §3)
    // solo intercepta find*/create/update por modelo — groupBy/aggregate
    // NO están interceptados ahí, así que usarlos acá filtrarían por
    // TODOS los tenants a la vez (mismo motivo por el que
    // SalesService.getCommissions ya evita groupBy desde la Etapa 12).
    const [sales, expenses, appointments, products] = await Promise.all([
      this.tenantPrisma.client.sale.findMany({
        where: { status: 'completed', ...branchFilter, ...(createdAtRange && { createdAt: createdAtRange }) },
        include: { items: true },
      }),
      this.tenantPrisma.client.expense.findMany({
        where: { ...branchFilter, ...(createdAtRange && { date: createdAtRange }) },
        select: { amount: true },
      }),
      this.tenantPrisma.client.appointment.findMany({
        where: { ...branchFilter, ...(createdAtRange && { startAt: createdAtRange }) },
        select: { status: true },
      }),
      this.tenantPrisma.client.product.findMany({
        where: { deletedAt: null, ...(query.branchId && { OR: [{ branchId: query.branchId }, { branchId: null }] }) },
      }),
    ]);

    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total.toNumber(), 0);
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount.toNumber(), 0);

    const appointmentsByStatus = new Map<string, number>();
    for (const appt of appointments) {
      appointmentsByStatus.set(appt.status, (appointmentsByStatus.get(appt.status) ?? 0) + 1);
    }

    // Top 5 servicios/productos por facturación — agregado en memoria
    // sobre los ítems de las ventas ya traídas, mismo criterio que
    // SalesService.getCommissions (Etapa 12) para no repetir la consulta.
    const byService = new Map<string, { name: string; subtotal: number; quantity: number }>();
    const byProduct = new Map<string, { name: string; subtotal: number; quantity: number }>();
    for (const sale of sales) {
      for (const item of sale.items) {
        const target = item.itemType === 'service' ? byService : byProduct;
        const key = item.serviceId ?? item.productId ?? item.name;
        const entry = target.get(key) ?? { name: item.name, subtotal: 0, quantity: 0 };
        entry.subtotal += item.subtotal.toNumber();
        entry.quantity += item.quantity;
        target.set(key, entry);
      }
    }
    const topN = (map: Map<string, { name: string; subtotal: number; quantity: number }>) =>
      [...map.values()].sort((a, b) => b.subtotal - a.subtotal).slice(0, 5);

    const lowStockProductsCount = products.filter((p) => p.stock <= p.minStock).length;

    return {
      period: { from: query.from ?? null, to: query.to ?? null },
      sales: { count: sales.length, totalRevenue },
      expenses: { totalAmount: totalExpenses },
      netRevenue: totalRevenue - totalExpenses,
      appointmentsByStatus: [...appointmentsByStatus.entries()].map(([status, count]) => ({ status, count })),
      topServices: topN(byService),
      topProducts: topN(byProduct),
      lowStockProductsCount,
    };
  }

  async exportSales(query: ExportQueryDto) {
    const createdAtRange = this.dateRange(query.from, query.to);
    const sales = await this.tenantPrisma.client.sale.findMany({
      where: {
        ...(query.branchId && { branchId: query.branchId }),
        ...(createdAtRange && { createdAt: createdAtRange }),
      },
      include: { branch: true, client: true, professional: true },
      orderBy: { createdAt: 'desc' },
    });

    const rows = sales.map((sale) => ({
      id: sale.id,
      date: sale.createdAt.toISOString(),
      branch: sale.branch.name,
      client: sale.client ? `${sale.client.firstName} ${sale.client.lastName}` : '',
      professional: sale.professional ? `${sale.professional.firstName} ${sale.professional.lastName}` : '',
      total: sale.total.toNumber(),
      status: sale.status,
    }));

    return this.buildExport('ventas', SALES_COLUMNS, rows, query.format);
  }

  async exportAppointments(query: ExportQueryDto) {
    const startAtRange = this.dateRange(query.from, query.to);
    const appointments = await this.tenantPrisma.client.appointment.findMany({
      where: {
        ...(query.branchId && { branchId: query.branchId }),
        ...(startAtRange && { startAt: startAtRange }),
      },
      include: { branch: true, professional: true, client: true, service: true },
      orderBy: { startAt: 'desc' },
    });

    const rows = appointments.map((appt) => ({
      id: appt.id,
      startAt: appt.startAt.toISOString(),
      branch: appt.branch.name,
      professional: `${appt.professional.firstName} ${appt.professional.lastName}`,
      client: `${appt.client.firstName} ${appt.client.lastName}`,
      service: appt.service.name,
      status: appt.status,
    }));

    return this.buildExport('turnos', APPOINTMENTS_COLUMNS, rows, query.format);
  }

  private async buildExport(
    title: string,
    columns: ExportColumn[],
    rows: Record<string, string | number>[],
    format: 'csv' | 'pdf' | 'xlsx',
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    switch (format) {
      case 'csv':
        return { buffer: buildCsv(columns, rows), contentType: 'text/csv', filename: `${title}.csv` };
      case 'xlsx':
        return {
          buffer: await buildXlsx(title, columns, rows),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          filename: `${title}.xlsx`,
        };
      case 'pdf':
        return {
          buffer: await buildPdf(title, columns, rows),
          contentType: 'application/pdf',
          filename: `${title}.pdf`,
        };
    }
  }
}
