import fs from "fs";
import { IncomingForm } from "formidable";
import { Request, Response } from "express";
import { Controller, Delete, Get, Post, Req, Res, Body, HttpStatus, Logger, Param, Query } from "@nestjs/common";

import { FileService } from "src/domain/file/file.service";
import { FileInfo, InitUploadDto, UploadStatusResponse } from "src/common/types/file";
import { sendBadRequest, sendInternalServerError, sendNotFound, sendTooManyRequests } from "src/common/utils/response";
import { FileUtils } from "src/common/utils/file";

@Controller("/api/files")
export class FileController {
    private readonly logger = new Logger(FileController.name);
    private readonly UPLOAD_DIR =
        process.env.UPLOAD_DIR ||
        (process.platform === "win32"
            ? "C:\\GitRepo\\fileupload\\uploads"
            : "/Users/yjj8353/Desktop/git/GitRepo/Gitlab/fileserver/uploads");

    constructor(private readonly fileService: FileService) {}

    @Get("/download/:id")
    async downloadFile(@Param("id") id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const userAgent = req.headers["user-agent"];
            const fileInfo = await this.fileService.getFileForDownload(id);

            this.logger.debug(`[DOWNLOAD] User-Agent: ${userAgent}`);

            if (!fileInfo) {
                this.logger.debug(`[DOWNLOAD] ${id} 파일이 없습니다.`);
                return sendNotFound(res, "파일을 찾을 수 없습니다.");
            }

            const stat = await fs.promises.stat(fileInfo.filePath);
            const contentType = fileInfo.mimeType || "application/octet-stream";
            const contentLength = stat.size;
            const contentDisposition = FileUtils.getSafeFilename(fileInfo.originalFileName, userAgent);

            this.logger.debug(`[DOWNLOAD] Content-Type: ${contentType}`);
            this.logger.debug(`[DOWNLOAD] Content-Length: ${contentLength}`);
            this.logger.debug(`[DOWNLOAD] Content-Disposition: ${contentDisposition}`);
            this.logger.debug(`[DOWNLOAD] Saved filename: ${fileInfo.savedFileName}`);
            this.logger.debug(`[DOWNLOAD] Original filename: ${fileInfo.originalFileName}`);

            res.set({
                "Content-Type": contentType,
                "Content-Length": contentLength.toString(),
                "Content-Disposition": contentDisposition,
            });

            const fileStream = fs.createReadStream(fileInfo.filePath);
            fileStream.pipe(res);
        } catch (error) {
            this.logger.error(`[DOWNLOAD ERROR] ${error}`);
            sendInternalServerError(res, "다운로드에 실패 했습니다.");
        }
    }

    @Get("/upload/status")
    async getStatus(@Query("sessionId") sessionId: string, @Res() res: Response): Promise<void> {
        if (!sessionId) {
            return sendBadRequest(res, "세션 ID는 필수입니다.");
        }

        try {
            const status: UploadStatusResponse = this.fileService.getUploadStatus(sessionId);
            res.status(HttpStatus.OK).json(status);
        } catch (error) {
            this.logger.error(`[STATUS ERROR] ${error}`);
            sendNotFound(res, error.message);
        }
    }

    @Post("/upload/init")
    async uploadInit(@Body() initData: InitUploadDto, @Res() res: Response): Promise<void> {
        try {
            const { fileName, fileSize, totalChunks, mimeType } = initData;

            if (!fileName || !fileSize || !totalChunks) {
                return sendBadRequest(res, "필수 필드가 누락되었습니다.");
            }

            const sessionId = await this.fileService.initializeUploadSession(fileName, fileSize, totalChunks, mimeType);

            res.status(HttpStatus.OK).json({
                success: true,
                sessionId: sessionId,
                message: "Upload session initialized",
            });
        } catch (error) {
            this.logger.error(`[INIT ERROR] ${error}`);
            sendBadRequest(res, "업로드 세션 초기화에 실패했습니다.");
        }
    }

    @Post("/upload/chunk")
    async uploadChunk(@Req() req: Request, @Res() res: Response): Promise<void> {
        this.logger.debug(`UPLOAD DIR: ${this.UPLOAD_DIR}`);

        const form = new IncomingForm({
            maxFileSize: 8 * 1024 * 1024, // 10MB
            multiples: false,
            maxFields: 5,
            maxFieldsSize: 1024,
            uploadDir: this.UPLOAD_DIR, // 업로드 폴더 제한
            keepExtensions: false,
        });

        form.parse(req, async (err: any, fields: any, files: any) => {
            if (err) {
                this.logger.error(`[CHUNK ERROR] ${err.message}`);
                return sendBadRequest(res, `청크 업로드 실패: ${err.message}`);
            }

            try {
                const sessionId = Array.isArray(fields.sessionId) ? fields.sessionId[0] : fields.sessionId;
                const chunkIndex = Array.isArray(fields.chunkIndex) ? fields.chunkIndex[0] : fields.chunkIndex;
                const chunkFile = Array.isArray(files.chunk) ? files.chunk[0] : files.chunk;

                if (!sessionId || chunkIndex === undefined || !chunkFile) {
                    return sendBadRequest(res, "필수 필드가 누락되었습니다.");
                }

                const chunkIdx = parseInt(chunkIndex);
                if (isNaN(chunkIdx)) {
                    return sendBadRequest(res, `유효하지 않은 청크 인덱스: ${chunkIndex}`);
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
                    sendTooManyRequests(res, "한 번에 너무 많은 업로드가 요청이 들어왔습니다.");
                } else if (error.message === "Upload session not found") {
                    sendNotFound(res, "업로드 세션을 찾을 수 없습니다.");
                } else {
                    sendInternalServerError(res, "청크 저장에 실패했습니다.");
                }
            }
        });
    }

    @Post("/upload/complete")
    async uploadComplete(@Body() body: { sessionId: string }, @Res() res: Response): Promise<void> {
        try {
            const { sessionId } = body;
            if (!sessionId) {
                return sendBadRequest(res, "세션 ID는 필수입니다.");
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
                sendNotFound(res, "업로드 세션을 찾을 수 없습니다.");
            } else if (error.message === "Missing chunks") {
                sendBadRequest(res, "필요한 청크가 누락되었습니다.");
            } else {
                sendInternalServerError(res, "업로드 완료에 실패했습니다.");
            }
        }
    }

    @Delete("/upload/cancel")
    async uploadCancel(@Body() body: { sessionId: string }, @Res() res: Response): Promise<void> {
        try {
            const { sessionId } = body;

            if (!sessionId) {
                return sendBadRequest(res, "세션 ID는 필수입니다.");
            }

            this.fileService.cancelUpload(sessionId);

            res.status(HttpStatus.OK).json({
                success: true,
                message: "Upload cancelled successfully",
            });
        } catch (error) {
            this.logger.error(`[CANCEL ERROR] ${error}`);
            if (error.message === "Upload session not found") {
                sendNotFound(res, "업로드 세션을 찾을 수 없습니다.");
            } else {
                sendInternalServerError(res, "업로드 취소에 실패했습니다.");
            }
        }
    }
}
