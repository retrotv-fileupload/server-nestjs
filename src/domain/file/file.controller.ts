import fs from "fs";
import { Request, Response } from "express";
import { Controller, Delete, Get, Post, Req, Res, Body, Logger, Param, Query } from "@nestjs/common";

import { FileService } from "src/domain/file/file.service";
import { FileInfo, InitData, UploadStatusResponse } from "src/common/types/file";
import {
    sendBadRequest,
    sendInternalServerError,
    sendNotFound,
    sendOK,
    sendTooManyRequests,
} from "src/common/utils/response";
import { getSafeFilename } from "src/common/utils/file";

@Controller("/api/files")
export class FileController {
    private readonly logger = new Logger(FileController.name);

    constructor(private readonly fileService: FileService) {}

    @Get("/download/:id")
    async downloadFile(@Param("id") id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const userAgent = req.headers["user-agent"];
            const fileInfo = await this.fileService.getFileForDownload(id);

            this.logger.debug(`[DOWNLOAD] User-Agent: ${userAgent}`);

            if (!fileInfo) {
                return sendNotFound(res, "파일을 찾을 수 없습니다.");
            }

            const stat = await fs.promises.stat(fileInfo.filePath);
            const contentType = fileInfo.mimeType || "application/octet-stream";
            const contentLength = stat.size;
            const contentDisposition = getSafeFilename(fileInfo.originalFileName, userAgent);

            this.logger.debug(`[DOWNLOAD] Content-Type: ${contentType}`);
            this.logger.debug(`[DOWNLOAD] Content-Length: ${contentLength}`);
            this.logger.debug(`[DOWNLOAD] Content-Disposition: ${contentDisposition}`);
            this.logger.debug(`[DOWNLOAD] Saved file name: ${fileInfo.savedFileName}`);
            this.logger.debug(`[DOWNLOAD] Original file name: ${fileInfo.originalFileName}`);

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
        this.logger.debug(`[STATUS] 세션 ID: ${sessionId}`);

        if (!sessionId) {
            this.logger.debug(`[STATUS] 세션 ID가 제공되지 않았습니다.`);
            return sendBadRequest(res, "세션 ID는 필수입니다.");
        }

        try {
            const status: UploadStatusResponse = this.fileService.getUploadStatus(sessionId);
            this.logger.debug(
                `[STATUS] 파일명: ${status.fileName}, 청크: ${status.uploadedChunks}/${status.totalChunks}, 진행도: ${status.progress}%`,
            );
            sendOK(res, null, status);
        } catch (error) {
            this.logger.error(`[STATUS ERROR] ${error}`);
            sendNotFound(res, error.message);
        }
    }

    @Post("/upload/init")
    async uploadInit(@Body() initData: InitData, @Res() res: Response): Promise<void> {
        try {
            const { fileName, fileSize, totalChunks, mimeType } = initData;
            if (!fileName || !fileSize || !totalChunks) {
                return sendBadRequest(res, "필수 필드가 누락되었습니다.");
            }

            const sessionId = await this.fileService.initializeUploadSession(fileName, fileSize, totalChunks, mimeType);
            this.logger.debug(`[INIT] 세션 ID: ${sessionId}`);
            sendOK(res, "업로드 세션 설정 완료", { sessionId });
        } catch (error) {
            this.logger.error(`[INIT ERROR] ${error}`);
            sendBadRequest(res, "업로드 세션 초기화에 실패했습니다.");
        }
    }

    @Post("/upload/chunk")
    async uploadChunk(@Req() req: Request, @Res() res: Response): Promise<void> {
        const form = this.fileService.getIncomingForm();

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
                const chunkBuffer = await fs.promises.readFile(chunkFile.filepath);

                // 임시 파일 삭제
                await fs.promises.unlink(chunkFile.filepath);

                const result = await this.fileService.processChunkUpload(sessionId, chunkIdx, chunkBuffer);

                sendOK(res, "SUCCESS", result);
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

            sendOK(res, "업로드 완료", fileInfo);
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

            sendOK(res, "업로드가 성공적으로 취소되었습니다.");
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
