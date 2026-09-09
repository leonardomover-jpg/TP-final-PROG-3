import { IsInt, IsString, MaxLength, MinLength, NotEquals } from 'class-validator';

// delta puede ser negativo (mermas, roturas) o positivo (conteo de
// inventario que encontró más stock del registrado) — nunca cero, no
// tendría sentido un ajuste que no ajusta nada.
export class StockAdjustmentDto {
  @IsInt()
  @NotEquals(0)
  delta: number;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reason: string;
}
