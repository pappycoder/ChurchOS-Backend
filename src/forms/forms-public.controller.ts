/**
 * @file forms-public.controller.ts
 * @description Public HTTP endpoint for anonymous form submissions.
 *
 * Allows anyone with a valid public token to submit a published form.
 * This endpoint is intentionally not protected by JWT authentication.
 *
 * @module forms/forms-public.controller
 * @since 1.0.0
 */

import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FormsService } from './forms.service';
import { CreateFormSubmissionDto, FormSubmissionResponseDto } from './dto';

@ApiTags('Forms')
@Controller('forms/public')
export class FormsPublicController {
  constructor(private readonly formsService: FormsService) {}

  /**
   * Submits a form using a public token.
   */
  @Post(':publicToken/submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a form publicly',
    description: 'Anonymous submission using a public token.',
  })
  @ApiParam({ name: 'publicToken', description: 'Public form token' })
  async submitPublicForm(
    @Param('publicToken') publicToken: string,
    @Body() dto: CreateFormSubmissionDto,
  ): Promise<FormSubmissionResponseDto> {
    return this.formsService.submitByPublicToken(publicToken, dto);
  }
}
