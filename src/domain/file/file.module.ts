import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { FileEntity } from "src/domain/file/file.entity";
import { FileRepository } from "src/domain/file/file.repository";
import { FileService } from "src/domain/file/file.service";
import { FileController } from "src/domain/file/file.controller";

@Module({
    imports: [TypeOrmModule.forFeature([FileEntity])],
    providers: [FileRepository, FileService],
    controllers: [FileController],
    exports: [FileRepository, FileService],
})
export class FileModule {}
