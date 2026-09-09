import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { PublicBookingService } from './public-booking.service';
import { PublicTenantGuard } from './guards/public-tenant.guard';
import { Public } from '../auth/decorators/public.decorator';
import { AvailabilityQueryDto } from '../schedule/dto/availability.query.dto';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';

// Rutas sin login (Etapa 18, doc `22-PAGINA-PUBLICA-QR-PWA.md`): @Public()
// evita JwtAuthGuard, PublicTenantGuard resuelve el tenant desde
// :tenantSlug y deja tenantPrisma acotada correctamente (ver el guard).
@Public()
@UseGuards(PublicTenantGuard)
@Controller('public/:tenantSlug')
export class PublicBookingController {
  constructor(private readonly publicBookingService: PublicBookingService) {}

  @Get()
  getCatalog(@Req() request: Request) {
    const tenant = (request as Request & { tenant?: { name: string } }).tenant;
    return this.publicBookingService.getCatalog(tenant?.name ?? '');
  }

  @Get('availability')
  getAvailability(@Query() query: AvailabilityQueryDto) {
    return this.publicBookingService.getAvailability(query);
  }

  // Límite más generoso que login/register (no es una acción sensible de
  // cuenta), pero igual acotado: evita que un mismo IP spamee reservas
  // falsas contra la agenda de un negocio.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('appointments')
  createAppointment(@Body() dto: CreatePublicAppointmentDto) {
    return this.publicBookingService.createAppointment(dto);
  }

  @Get('qr')
  async getQr(@Param('tenantSlug') tenantSlug: string, @Res() res: Response) {
    const png = await this.publicBookingService.generateQrPng(tenantSlug);
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  }
}
