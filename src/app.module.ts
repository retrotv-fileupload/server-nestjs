import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppController } from "src/app.controller";
import { AppService } from "src/app.service";
import { FileModule, FileEntity } from "src/domain/file";
import { LoggingMiddleware } from "src/common/middleware/logging.middleware";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ".env",
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => {
                const dbType = configService.get("DB_TYPE") || "sqlite";

                if (dbType === "sqlite") {
                    return {
                        type: "sqlite",
                        database: configService.get("DB_DATABASE") || "./fileserver.db",
                        entities: [FileEntity],
                        synchronize: configService.get("NODE_ENV") === "dev",
                    };
                }

                return {
                    type: "mysql",
                    host: configService.get("DB_HOST"),
                    port: +configService.get<number>("DB_PORT"),
                    username: configService.get("DB_USERNAME"),
                    password: configService.get("DB_PASSWORD"),
                    database: configService.get("DB_DATABASE"),
                    entities: [FileEntity],
                    synchronize: configService.get("NODE_ENV") === "dev",
                };
            },
            inject: [ConfigService],
        }),
        FileModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(LoggingMiddleware).forRoutes("*"); // 모든 라우트에 적용
    }
}
