import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

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
            entities: [],
            synchronize: configService.get("NODE_ENV") === "development",
          };
        }

        return {
          type: "mysql",
          host: configService.get("DB_HOST"),
          port: +configService.get<number>("DB_PORT"),
          username: configService.get("DB_USERNAME"),
          password: configService.get("DB_PASSWORD"),
          database: configService.get("DB_DATABASE"),
          entities: [],
          synchronize: configService.get("NODE_ENV") === "development",
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
