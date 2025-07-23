import { Controller, Delete, Get, Post, Req, Res, Body, HttpStatus, Logger, Param, Query } from "@nestjs/common";
import { Request, Response } from "express";
import { FileService, UploadStatusResponse, FileInfo } from "./file.service";
import * as fs from "fs";
import { IncomingForm } from "formidable";

// 초기화 요청 DTO
interface InitUploadDto {
    fileName: string;
    fileSize: number;
    totalChunks: number;
    mimeType?: string;
}

@Controller("/api/files")
export class FileController {
    private readonly logger = new Logger(FileController.name);

    constructor(private readonly fileService: FileService) {}

    private sendError(res: Response, statusCode: number, message: string): void {
        if (!res.headersSent) {
            res.status(statusCode).json({
                success: false,
                error: message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    @Get("/download/:id")
    async downloadFile(@Param("id") id: string, @Res() res: Response): Promise<void> {
        try {
            const fileInfo = await this.fileService.getFileForDownload(id);

            if (!fileInfo) {
                return this.sendError(res, HttpStatus.NOT_FOUND, "File not found");
            }

            const stat = fs.statSync(fileInfo.filePath);

            res.set({
                "Content-Type": fileInfo.mimeType || "application/octet-stream",
                "Content-Length": stat.size.toString(),
                "Content-Disposition": `attachment; filename="${fileInfo.originalName}"`,
            });

            const fileStream = fs.createReadStream(fileInfo.filePath);
            fileStream.pipe(res);

            this.logger.log(`[DOWNLOAD] File: ${fileInfo.originalName}`);
        } catch (error) {
            this.logger.error(`[DOWNLOAD ERROR] ${error}`);
            this.sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, "Download failed");
        }
    }

    @Get("/upload/status")
    async getStatus(@Query("sessionId") sessionId: string, @Res() res: Response): Promise<void> {
        if (!sessionId) {
            return this.sendError(res, HttpStatus.BAD_REQUEST, "Session ID is required");
        }

        try {
            const status: UploadStatusResponse = this.fileService.getUploadStatus(sessionId);
            res.status(HttpStatus.OK).json(status);
        } catch (error) {
            this.logger.error(`[STATUS ERROR] ${error}`);
            this.sendError(res, HttpStatus.NOT_FOUND, error.message);
        }
    }

    @Post("/upload/init")
    async uploadInit(@Body() initData: InitUploadDto, @Res() res: Response): Promise<void> {
        try {
            const { fileName, fileSize, totalChunks, mimeType } = initData;

            if (!fileName || !fileSize || !totalChunks) {
                return this.sendError(res, HttpStatus.BAD_REQUEST, "Missing required fields");
            }

            const sessionId = await this.fileService.initializeUploadSession(fileName, fileSize, totalChunks, mimeType);

            res.status(HttpStatus.OK).json({
                success: true,
                sessionId: sessionId,
                message: "Upload session initialized",
            });
        } catch (error) {
            this.logger.error(`[INIT ERROR] ${error}`);
            this.sendError(res, HttpStatus.BAD_REQUEST, "Failed to initialize upload session");
        }
    }

    @Post("/upload/chunk")
    async uploadChunk(@Req() req: Request, @Res() res: Response): Promise<void> {
        const form = new IncomingForm({
            maxFileSize: 10 * 1024 * 1024, // 10MB
            multiples: false,
            maxFields: 5,
            maxFieldsSize: 1024,
            uploadDir: "/Users/yjj8353/Desktop/git/GitRepo/Gitlab/fileserver/uploads", // 업로드 폴더 제한
            keepExtensions: false,
        });

        form.parse(req, async (err: any, fields: any, files: any) => {
            if (err) {
                this.logger.error(`[CHUNK ERROR] ${err.message}`);
                return this.sendError(res, HttpStatus.BAD_REQUEST, `Chunk upload failed: ${err.message}`);
            }

            try {
                const sessionId = Array.isArray(fields.sessionId) ? fields.sessionId[0] : fields.sessionId;
                const chunkIndex = Array.isArray(fields.chunkIndex) ? fields.chunkIndex[0] : fields.chunkIndex;
                const chunkFile = Array.isArray(files.chunk) ? files.chunk[0] : files.chunk;

                if (!sessionId || chunkIndex === undefined || !chunkFile) {
                    return this.sendError(res, HttpStatus.BAD_REQUEST, "Missing required fields");
                }

                const chunkIdx = parseInt(chunkIndex);
                if (isNaN(chunkIdx)) {
                    return this.sendError(res, HttpStatus.BAD_REQUEST, `Invalid chunk index: ${chunkIndex}`);
                }

                // 파일 데이터 읽기
                const chunkBuffer = fs.readFileSync(chunkFile.filepath);

                // 임시 파일 삭제
                fs.unlinkSync(chunkFile.filepath);

                const result = await this.fileService.processChunkUpload(sessionId, chunkIdx, chunkBuffer);

                res.status(HttpStatus.OK).json(result);
            } catch (error) {
                this.logger.error(`[CHUNK SAVE ERROR] ${error}`);
                if (error.message === "Too many concurrent uploads") {
                    this.sendError(res, HttpStatus.TOO_MANY_REQUESTS, error.message);
                } else if (error.message === "Upload session not found") {
                    this.sendError(res, HttpStatus.NOT_FOUND, error.message);
                } else {
                    this.sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save chunk");
                }
            }
        });
    }

    @Post("/upload/complete")
    async uploadComplete(@Body() body: { sessionId: string }, @Res() res: Response): Promise<void> {
        try {
            const { sessionId } = body;

            if (!sessionId) {
                return this.sendError(res, HttpStatus.BAD_REQUEST, "Session ID is required");
            }

            const fileInfo: FileInfo = await this.fileService.completeUpload(sessionId);

            res.status(HttpStatus.OK).json({
                success: true,
                message: "File upload completed successfully",
                file: fileInfo,
            });
        } catch (error) {
            this.logger.error(`[COMPLETE ERROR] ${error}`);
            if (error.message === "Upload session not found") {
                this.sendError(res, HttpStatus.NOT_FOUND, error.message);
            } else if (error.message === "Missing chunks") {
                this.sendError(res, HttpStatus.BAD_REQUEST, error.message);
            } else {
                this.sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, "Failed to complete upload");
            }
        }
    }

    @Delete("/upload/cancel")
    async uploadCancel(@Body() body: { sessionId: string }, @Res() res: Response): Promise<void> {
        try {
            const { sessionId } = body;

            if (!sessionId) {
                return this.sendError(res, HttpStatus.BAD_REQUEST, "Session ID is required");
            }

            this.fileService.cancelUpload(sessionId);

            res.status(HttpStatus.OK).json({
                success: true,
                message: "Upload cancelled successfully",
            });
        } catch (error) {
            this.logger.error(`[CANCEL ERROR] ${error}`);
            if (error.message === "Upload session not found") {
                this.sendError(res, HttpStatus.NOT_FOUND, error.message);
            } else {
                this.sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, "Failed to cancel upload");
            }
        }
    }
}
