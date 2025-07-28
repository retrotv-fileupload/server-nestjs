import "tsconfig-paths/register";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "src/app.module";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // CORS 설정
    app.enableCors();

    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`🚀 Application is running on: http://localhost:${port}`);
}

bootstrap();
