import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { GiftCardsService } from './gift-cards.service';
import { IssueGiftCardDto } from './dto/issue-gift-card.dto';
import { RedeemGiftCardDto } from './dto/redeem-gift-card.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { FeatureFlagGuard } from '../feature-flags/guards/feature-flag.guard';
import { RequiresFeature } from '../feature-flags/decorators/requires-feature.decorator';

@UseGuards(FeatureFlagGuard)
@RequiresFeature('gift_cards')
@Controller('gift-cards')
export class GiftCardsController {
  constructor(private readonly giftCardsService: GiftCardsService) {}

  @RequirePermissions('giftcards.gestionar')
  @Get()
  findAll() {
    return this.giftCardsService.findAll();
  }

  @RequirePermissions('giftcards.gestionar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.giftCardsService.findOne(id);
  }

  @RequirePermissions('giftcards.gestionar')
  @Post()
  issue(@Body() dto: IssueGiftCardDto) {
    return this.giftCardsService.issue(dto);
  }

  @RequirePermissions('giftcards.gestionar')
  @Post(':id/redeem')
  redeem(@Param('id') id: string, @Body() dto: RedeemGiftCardDto) {
    return this.giftCardsService.redeem(id, dto);
  }

  @RequirePermissions('giftcards.gestionar')
  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.giftCardsService.cancel(id);
  }
}
