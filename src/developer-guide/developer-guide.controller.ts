import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { renderGuidePage } from './developer-guide.content';

@Controller('developer-guide')
export class DeveloperGuideController {
  @Get()
  @ApiExcludeEndpoint()
  getGuide(@Req() req: Request, @Res() res: Response): void {
    const baseUrl = `${req.protocol}://${req.get('host')}/api/v1`;
    const swaggerUrl = `${baseUrl}/docs`;
    res.setHeader('Content-Type', 'text/html');
    res.send(renderGuidePage(baseUrl, swaggerUrl));
  }
}
