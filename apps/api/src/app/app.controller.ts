import { Controller, Get } from '@nestjs/common';
import { LingoTrackerConfig } from '@simoncodes-ca/common';
import { ConfigService } from './config/config.service';

@Controller()
export class AppController {
  constructor(private readonly configService: ConfigService) {}

  @Get('health')
  getHealth(): { status: string } {
    return { status: 'all is good' };
  }

  @Get('config')
  getConfig(): LingoTrackerConfig {
    return this.configService.getConfig();
  }
}
