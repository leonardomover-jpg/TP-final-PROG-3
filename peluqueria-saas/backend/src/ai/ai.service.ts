import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { ReportsService } from '../reports/reports.service';
import { InsightsQueryDto } from './dto/insights-query.dto';
import { AiCredentials, generateInsights } from './ai-client';

const SYSTEM_PROMPT = `Sos un asistente de negocio para peluquerías y barberías que usan
PROMPT MAESTRO, un SaaS de gestión. Te van a pasar un resumen de datos
(en JSON) de UN ÚNICO negocio — nunca mencionás ni comparás con otros
negocios, porque no tenés ni deberías tener esa información. Respondé en
español, en 3 a 5 puntos breves y accionables (qué está funcionando, qué
mejorar, alertas a atender). No repitas los números tal cual — interpretalos.`;

/**
 * Asistencia de IA sobre estadísticas y clientes (Etapa 20 del roadmap,
 * doc `01-ANALISIS-Y-ARQUITECTURA.md` §3: "IA → Estadísticas, Clientes
 * [flag: ai]"), gateada por el feature flag `ai` (jerarquía SUPER ADMIN →
 * Plan → Negocio, Etapa 4).
 *
 * "Nunca cruza tenants" (doc 01 §2, Capa 5): el prompt que se arma acá
 * SOLO contiene datos ya acotados al tenant actual (reusa
 * `ReportsService.getDashboard`, que a su vez usa `TenantPrismaService`) —
 * nunca se agregan datos de otro negocio a la misma consulta al modelo.
 *
 * Credenciales de LA PLATAFORMA (no por-tenant, a diferencia de Mercado
 * Pago/WhatsApp/Meta de las Etapas 15-17): la IA es una feature que ofrece
 * la plataforma sobre los datos DEL negocio, no una cuenta externa que
 * cada negocio conecta — no hay "cuenta de IA propia" que un negocio
 * pudiera tener, a diferencia de una cuenta de WhatsApp Business real.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  private get credentials(): AiCredentials {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException('La asistencia de IA no está configurada en este ambiente.');
    }
    return {
      apiKey,
      baseUrl: process.env.AI_API_BASE_URL || 'https://api.anthropic.com',
      model: process.env.AI_MODEL || 'claude-3-5-haiku-latest',
    };
  }

  async getInsights(query: InsightsQueryDto) {
    const dashboard = await this.reportsService.getDashboard(query);

    const createdAtRange =
      query.from || query.to
        ? { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lte: new Date(query.to) }) }
        : undefined;
    const [activeClients, newClients] = await Promise.all([
      this.tenantPrisma.client.client.count({ where: { status: 'active', deletedAt: null } }),
      this.tenantPrisma.client.client.count({
        where: { deletedAt: null, ...(createdAtRange && { createdAt: createdAtRange }) },
      }),
    ]);

    const dataSummary = { ...dashboard, clients: { active: activeClients, new: newClients } };
    const userPrompt = `Datos del negocio (JSON):\n${JSON.stringify(dataSummary)}`;

    const insights = await generateInsights(this.credentials, SYSTEM_PROMPT, userPrompt);

    return { insights, basedOn: dataSummary };
  }
}
