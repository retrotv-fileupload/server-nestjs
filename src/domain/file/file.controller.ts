import fs from "fs";
import { Request, Response } from "express";
import { Controller, Delete, Get, Post, Req, Res, Body, Logger, Param, Query } from "@nestjs/common";
import { pipeline } from "stream";
import { promisify } from "util";

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
import { removeIndentation } from "src/common/utils/string";
import { getBestCompression, shouldCompress } from "src/common/utils/compress";
import { formatBytes, formatPercent } from "src/common/utils/format";

@Controller("/api/files")
export class FileController {
    private readonly logger = new Logger(FileController.name);
    private readonly pipelineAsync = promisify(pipeline);

    constructor(private readonly fileService: FileService) {}

    @Get("/download/:id")
    async downloadFile(@Param("id") id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const userAgent = req.headers["user-agent"];
            const fileInfo = await this.fileService.getFileForDownload(id);
            if (!fileInfo) {
                return sendNotFound(res, "파일을 찾을 수 없습니다.");
            }

            const stat = await fs.promises.stat(fileInfo.filePath);
            const acceptEncoding = req.headers["accept-encoding"] || "";
            const contentType = fileInfo.mimeType || "application/octet-stream";
            const contentLength = stat.size;
            const contentDisposition = getSafeFilename(fileInfo.originalFileName, userAgent);
            const isCompressed = shouldCompress(fileInfo.mimeType || "application/octet-stream", stat.size);

            this.logger.debug(
                removeIndentation(`
                    [ 다운로드 요청 ]
                    User-Agent: ${userAgent}
                    Content-Type: ${contentType}
                    Content-Length: ${contentLength}
                    Saved file name: ${fileInfo.savedFileName}
                    Original file name: ${fileInfo.originalFileName}
                    압축여부: ${isCompressed}
                `),
            );

            res.set({
                "Content-Type": contentType,
                "Content-Disposition": contentDisposition,
                "Cache-Control": "public, max-age=1800",
            });

            const fileStream = fs.createReadStream(fileInfo.filePath);

            if (isCompressed) {
                const compression = getBestCompression(acceptEncoding);

                if (compression) {
                    res.set({
                        "Content-Encoding": compression.encoding,
                        Vary: "Accept-Encoding",
                        "Transfer-Encoding": "chunked",
                    });

                    // 압축 시작 로그
                    this.logger.debug(
                        `[DOWNLOAD] 압축 시작: ${compression.encoding}, 파일: ${fileInfo.originalFileName}`,
                    );

                    // 압축 통계를 위한 변수
                    let compressedBytes = 0;
                    compression.stream.on("data", chunk => {
                        compressedBytes += chunk.length;
                    });

                    // 파이프라인 실행 및 완료 로그
                    try {
                        await this.pipelineAsync(fileStream, compression.stream, res);

                        const savedBytes = contentLength - compressedBytes;
                        this.logger.debug(
                            removeIndentation(`
                                [ DOWNLOAD - 압축 완료 ]
                                File: ${fileInfo.originalFileName}
                                Method: ${compression.encoding.toUpperCase()}
                                원본: ${formatBytes(contentLength)}
                                압축: ${formatBytes(compressedBytes)}
                                압축률: ${formatPercent(savedBytes, contentLength)}
                                절약: ${formatBytes(savedBytes)}
                            `),
                        );

                        this.logger.debug(`[DOWNLOAD] 파이프라인 완료: ${fileInfo.originalFileName}`);
                    } catch (pipelineError) {
                        this.logger.error(`[DOWNLOAD] 파이프라인 에러: ${pipelineError}`);
                        throw pipelineError;
                    }

                    return;
                }
            }

            // 압축하지 않는 경우
            this.logger.debug(
                `[DOWNLOAD] 압축 없음: ${fileInfo.originalFileName}, 크기: ${formatBytes(contentLength)}`,
            );

            res.set("Content-Length", contentLength.toString());
            fileStream.pipe(res);
        } catch (error) {
            this.logger.error(`[DOWNLOAD ERROR] ${error}`);
            if (!res.headersSent) {
                sendInternalServerError(res, "다운로드에 실패 했습니다.");
            }
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

            this.logger.debug(
                removeIndentation(`
                    [ 업로드 초기화 요청 ]
                    파일명: ${fileName}
                    파일 크기: ${fileSize}
                    총 청크 수: ${totalChunks}
                    MIME 타입: ${mimeType}
                `),
            );

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
