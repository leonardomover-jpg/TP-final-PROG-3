import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// Nunca se devuelve un stack trace ni un detalle técnico al cliente
// (doc 04-SEGURIDAD-BASELINE.md, sección 9). El detalle completo se loguea
// del lado del servidor con un errorId correlacionable.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorId = `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (!isHttpException || status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${errorId}] ${request.method} ${request.url} -> ${
          exception instanceof Error ? exception.stack : String(exception)
        }`,
      );
    }

    const clientMessage = isHttpException
      ? exception.getResponse()
      : { message: 'No pudimos procesar la operación. Intentá nuevamente.' };

    response.status(status).json({
      statusCode: status,
      errorId,
      ...(typeof clientMessage === 'string'
        ? { message: clientMessage }
        : clientMessage),
    });
  }
}
