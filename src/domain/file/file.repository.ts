import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, FindManyOptions } from "typeorm";

import { FileEntity } from "src/domain/file/file.entity";

@Injectable()
export class FileRepository {
    constructor(
        @InjectRepository(FileEntity)
        private readonly fileRepository: Repository<FileEntity>,
    ) {}

    /**
     * 새 파일 엔티티를 생성합니다.
     */
    async create(fileData: Partial<FileEntity>): Promise<FileEntity> {
        const file = this.fileRepository.create(fileData);
        return await this.fileRepository.save(file);
    }

    /**
     * ID로 파일을 조회합니다.
     */
    async findById(id: string): Promise<FileEntity | null> {
        return await this.fileRepository.findOne({ where: { id } });
    }

    /**
     * 모든 활성 파일을 조회합니다.
     */
    async findAllActive(options?: FindManyOptions<FileEntity>): Promise<FileEntity[]> {
        return await this.fileRepository.find({
            ...options,
            where: {
                ...options?.where,
                isActive: true,
            },
        });
    }

    /**
     * 파일명으로 파일을 조회합니다.
     */
    async findByFileName(fileName: string): Promise<FileEntity | null> {
        return await this.fileRepository.findOne({
            where: { fileName, isActive: true },
        });
    }

    /**
     * 해시값으로 파일을 조회합니다 (중복 파일 확인용).
     */
    async findByHash(hash: string): Promise<FileEntity | null> {
        return await this.fileRepository.findOne({
            where: { hash, isActive: true },
        });
    }

    /**
     * 카테고리별로 파일을 조회합니다.
     */
    async findByCategory(category: string): Promise<FileEntity[]> {
        return await this.fileRepository.find({
            where: { category, isActive: true },
            order: { createdAt: "DESC" },
        });
    }

    /**
     * 업로더별로 파일을 조회합니다.
     */
    async findByUploader(uploadedBy: string): Promise<FileEntity[]> {
        return await this.fileRepository.find({
            where: { uploadedBy, isActive: true },
            order: { createdAt: "DESC" },
        });
    }

    /**
     * MIME 타입별로 파일을 조회합니다.
     */
    async findByMimeType(mimeType: string): Promise<FileEntity[]> {
        return await this.fileRepository.find({
            where: { mimeType, isActive: true },
            order: { createdAt: "DESC" },
        });
    }

    /**
     * 파일 정보를 업데이트합니다.
     */
    async update(id: string, updateData: Partial<FileEntity>): Promise<FileEntity | null> {
        await this.fileRepository.update(id, updateData);
        return await this.findById(id);
    }

    /**
     * 파일을 논리 삭제합니다 (isActive = false).
     */
    async softDelete(id: string): Promise<boolean> {
        const result = await this.fileRepository.update(id, { isActive: false });
        return result.affected > 0;
    }

    /**
     * 파일을 물리 삭제합니다.
     */
    async hardDelete(id: string): Promise<boolean> {
        const result = await this.fileRepository.delete(id);
        return result.affected > 0;
    }

    /**
     * 전체 파일 개수를 조회합니다.
     */
    async count(options?: FindManyOptions<FileEntity>): Promise<number> {
        return await this.fileRepository.count({
            ...options,
            where: {
                ...options?.where,
                isActive: true,
            },
        });
    }

    /**
     * 페이지네이션으로 파일을 조회합니다.
     */
    async findWithPagination(
        page: number = 1,
        limit: number = 10,
        options?: FindManyOptions<FileEntity>,
    ): Promise<{ files: FileEntity[]; total: number; totalPages: number }> {
        const skip = (page - 1) * limit;

        const [files, total] = await this.fileRepository.findAndCount({
            ...options,
            where: {
                ...options?.where,
                isActive: true,
            },
            order: { createdAt: "DESC" },
            skip,
            take: limit,
        });

        return {
            files,
            total,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * 파일명으로 검색합니다.
     */
    async searchByName(searchTerm: string): Promise<FileEntity[]> {
        return await this.fileRepository
            .createQueryBuilder("file")
            .where("file.originalName LIKE :searchTerm", { searchTerm: `%${searchTerm}%` })
            .andWhere("file.isActive = :isActive", { isActive: true })
            .orderBy("file.createdAt", "DESC")
            .getMany();
    }

    /**
     * 크기 범위로 파일을 조회합니다.
     */
    async findBySizeRange(minSize: number, maxSize: number): Promise<FileEntity[]> {
        return await this.fileRepository
            .createQueryBuilder("file")
            .where("file.size >= :minSize", { minSize })
            .andWhere("file.size <= :maxSize", { maxSize })
            .andWhere("file.isActive = :isActive", { isActive: true })
            .orderBy("file.size", "ASC")
            .getMany();
    }
}
