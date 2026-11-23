import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface AuthorizerResponse {
  status?: string;
  data?: {
    authorization?: boolean;
  };
}

@Injectable()
export class AuthorizerService {
  private readonly logger = new Logger(AuthorizerService.name);
  private readonly authorizerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.authorizerUrl =
      this.configService.get<string>('AUTHORIZER_URL') ??
      'https://util.devi.tools/api/v2/authorize';
  }

  async isAuthorized(): Promise<boolean> {
    try {
      const response = await fetch(this.authorizerUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return false;
      }

      const body = (await response.json()) as AuthorizerResponse;
      return body.status === 'success' && body.data?.authorization === true;
    } catch (error: unknown) {
      this.logger.error('External authorizer request failed', error);
      throw new BadGatewayException('External authorizer unavailable');
    }
  }
}
