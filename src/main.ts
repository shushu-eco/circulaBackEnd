import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );

  const clientUrl = configService.get('CLIENT_URL', 'http://localhost:5173');
  app.enableCors({
    origin: [clientUrl, 'http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Token-Expiry'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Circula API')
    .setDescription(
      `## Circula Subscription Tracker REST API

### Authentication
- Most endpoints require a **Bearer JWT** access token (15-minute lifetime)
- Login returns an \`accessToken\` in the response body and sets a **HttpOnly** \`refreshToken\` cookie
- Use \`POST /api/auth/refresh\` to get a new access token using the cookie
- Subscriptions and Notifications endpoints additionally require email verification

### Rate Limits
- Register / OTP endpoints: **5 req / hour**
- Login: **10 req / 15 min**
- Delete account: **3 req / hour**`,
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Enter your access token' },
      'access-token',
    )
    .addCookieAuth('refreshToken', {
      type: 'apiKey',
      in: 'cookie',
      description: 'HttpOnly refresh token cookie (set automatically on login)',
    })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);

  console.log(`\n🚀 Server:   http://localhost:${port}/api`);
  console.log(`📚 Swagger:  http://localhost:${port}/api/docs\n`);
}

bootstrap();
