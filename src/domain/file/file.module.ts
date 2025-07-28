import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { FileEntity } from "./file.entity";
import { FileRepository } from "./file.repository";
import { FileService } from "./file.service";
import { FileController } from "./file.controller";

@Module({
    imports: [TypeOrmModule.forFeature([FileEntity])],
    providers: [FileRepository, FileService],
    controllers: [FileController],
    exports: [FileRepository, FileService],
})
export class FileModule {}
