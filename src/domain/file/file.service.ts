import { Injectable, Logger } from "@nestjs/common";
import { FileRepository } from "./file.repository";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// 업로드 세션 인터페이스
export interface UploadSession {
    sessionId: string;
    fileName: string;
    fileSize: number;
    totalChunks: number;
    mimeType: string;
    tempDir: string;
    uploadedChunks: Set<number>;
    status: "initialized" | "uploading" | "all_chunks_uploaded" | "merging" | "completed" | "failed";
    createdAt: number;
    lastActivity: number;
}

export interface FileInfo {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    uploadDate: string;
    downloadUrl: string;
}

export interface UploadStatusResponse {
    sessionId: string;
    status: string;
    progress: number;
    uploadedChunks: number;
    totalChunks: number;
    missingChunks: number[];
    fileName: string;
    fileSize: number;
    lastActivity: number;
}

export interface ChunkUploadResponse {
    success: boolean;
    message: string;
    chunkIndex: number;
    progress: number;
    uploadedChunks: number;
    totalChunks: number;
    status: string;
    isComplete: boolean;
}

@Injectable()
export class FileService {
    private readonly logger = new Logger(FileService.name);
    private readonly UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
    private readonly TEMP_DIR = path.join(this.UPLOAD_DIR, "temp");
    private readonly MAX_CONCURRENT_UPLOADS = 5;

    // 업로드 세션 저장소
    private readonly uploadSessions = new Map<string, UploadSession>();
    private activeUploads = 0;

    constructor(private readonly fileRepository: FileRepository) {
        // 디렉토리 생성
        this.initializeDirectories();

        // 세션 정리 스케줄러 시작
        this.startSessionCleanup();
    }

    private initializeDirectories(): void {
        if (!fs.existsSync(this.UPLOAD_DIR)) {
            fs.mkdirSync(this.UPLOAD_DIR, { recursive: true });
            this.logger.log(`Upload directory created: ${this.UPLOAD_DIR}`);
        }
        if (!fs.existsSync(this.TEMP_DIR)) {
            fs.mkdirSync(this.TEMP_DIR, { recursive: true });
            this.logger.log(`Temp directory created: ${this.TEMP_DIR}`);
        }
    }

    private startSessionCleanup(): void {
        // 세션 정리 (30분 후 자동 삭제)
        setInterval(
            () => {
                const now = Date.now();
                for (const [sessionId, session] of this.uploadSessions.entries()) {
                    if (now - session.lastActivity > 30 * 60 * 1000) {
                        // 30분
                        this.cleanupSession(sessionId);
                        this.logger.log(`[CLEANUP] Expired session removed: ${sessionId}`);
                    }
                }
            },
            5 * 60 * 1000,
        ); // 5분마다 정리
    }

    private generateSessionId(): string {
        return `${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    }

    private generateUniqueId(): string {
        return crypto.randomBytes(6).toString("hex");
    }

    private cleanupSession(sessionId: string): void {
        const session = this.uploadSessions.get(sessionId);
        if (session && fs.existsSync(session.tempDir)) {
            try {
                fs.rmSync(session.tempDir, { recursive: true, force: true });
            } catch (error) {
                this.logger.error(`Failed to cleanup session ${sessionId}: ${error}`);
            }
        }
        this.uploadSessions.delete(sessionId);
    }

    /**
     * 업로드 세션 초기화
     */
    initializeUploadSession(
        fileName: string,
        fileSize: number,
        totalChunks: number,
        mimeType?: string,
    ): { sessionId: string } {
        const sessionId = this.generateSessionId();
        const tempDir = path.join(this.TEMP_DIR, sessionId);
        fs.mkdirSync(tempDir, { recursive: true });

        const session: UploadSession = {
            sessionId,
            fileName,
            fileSize,
            totalChunks,
            mimeType: mimeType || "application/octet-stream",
            tempDir,
            uploadedChunks: new Set(),
            status: "initialized",
            createdAt: Date.now(),
            lastActivity: Date.now(),
        };

        this.uploadSessions.set(sessionId, session);
        this.logger.log(`[INIT] Session: ${sessionId}, File: ${fileName}, Chunks: ${totalChunks}`);

        return { sessionId };
    }

    /**
     * 청크 업로드 처리
     */
    processChunkUpload(sessionId: string, chunkIndex: number, chunkBuffer: Buffer): ChunkUploadResponse {
        // 동시 업로드 수 제한
        if (this.activeUploads >= this.MAX_CONCURRENT_UPLOADS) {
            throw new Error("Too many concurrent uploads");
        }

        this.activeUploads++;

        try {
            const session = this.uploadSessions.get(sessionId);
            if (!session) {
                throw new Error("Upload session not found");
            }

            if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
                throw new Error(`Invalid chunk index: ${chunkIndex}`);
            }

            // 중복 청크 체크
            if (session.uploadedChunks.has(chunkIndex)) {
                this.logger.log(`[CHUNK] Duplicate chunk ${chunkIndex} for session ${sessionId}`);
                return {
                    success: true,
                    message: "Chunk already uploaded",
                    chunkIndex,
                    progress: Math.round((session.uploadedChunks.size / session.totalChunks) * 100),
                    uploadedChunks: session.uploadedChunks.size,
                    totalChunks: session.totalChunks,
                    status: session.status,
                    isComplete: session.uploadedChunks.size === session.totalChunks,
                };
            }

            // 청크 파일 저장
            const chunkPath = path.join(session.tempDir, `chunk_${chunkIndex.toString().padStart(6, "0")}`);
            fs.writeFileSync(chunkPath, chunkBuffer);

            // 청크 등록
            session.uploadedChunks.add(chunkIndex);
            session.lastActivity = Date.now();

            if (session.uploadedChunks.size === session.totalChunks) {
                session.status = "all_chunks_uploaded";
            } else {
                session.status = "uploading";
            }

            this.logger.log(
                `[CHUNK] ${chunkIndex}/${session.totalChunks - 1} (${session.uploadedChunks.size}/${session.totalChunks})`,
            );

            const progress = Math.round((session.uploadedChunks.size / session.totalChunks) * 100);

            return {
                success: true,
                message: "Chunk uploaded successfully",
                chunkIndex,
                progress,
                uploadedChunks: session.uploadedChunks.size,
                totalChunks: session.totalChunks,
                status: session.status,
                isComplete: session.uploadedChunks.size === session.totalChunks,
            };
        } finally {
            this.activeUploads--;
        }
    }

    /**
     * 청크 병합 (스트림 방식으로 메모리 효율적으로)
     */
    private async mergeChunks(session: UploadSession, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(outputPath);
            let currentChunk = 0;

            const writeNextChunk = (): void => {
                if (currentChunk >= session.totalChunks) {
                    writeStream.end();
                    resolve();
                    return;
                }

                const chunkPath = path.join(session.tempDir, `chunk_${currentChunk.toString().padStart(6, "0")}`);

                if (!fs.existsSync(chunkPath)) {
                    writeStream.destroy();
                    reject(new Error(`Missing chunk file: ${currentChunk}`));
                    return;
                }

                const readStream = fs.createReadStream(chunkPath);

                readStream.on("end", () => {
                    currentChunk++;
                    setImmediate(writeNextChunk); // 비동기적으로 다음 청크 처리
                });

                readStream.on("error", error => {
                    writeStream.destroy();
                    reject(error);
                });

                readStream.pipe(writeStream, { end: false });
            };

            writeStream.on("error", reject);
            writeNextChunk();
        });
    }

    /**
     * 업로드 완료 처리
     */
    async completeUpload(sessionId: string): Promise<FileInfo> {
        const session = this.uploadSessions.get(sessionId);
        if (!session) {
            throw new Error("Upload session not found");
        }

        if (session.uploadedChunks.size !== session.totalChunks) {
            throw new Error("Missing chunks");
        }

        session.status = "merging";
        const finalFileName = `${Date.now()}_${this.generateUniqueId()}_${session.fileName}`;
        const finalFilePath = path.join(this.UPLOAD_DIR, finalFileName);

        try {
            await this.mergeChunks(session, finalFilePath);

            // 파일 해시 계산
            const hash = await this.calculateFileHash(finalFilePath);

            // 데이터베이스에 저장
            const fileEntity = await this.fileRepository.create({
                originalName: session.fileName,
                fileName: finalFileName,
                filePath: finalFilePath,
                mimeType: session.mimeType,
                size: session.fileSize,
                hash,
                isActive: true,
            });

            this.cleanupSession(sessionId);

            const fileInfo: FileInfo = {
                id: fileEntity.id,
                fileName: session.fileName,
                fileSize: session.fileSize,
                mimeType: session.mimeType,
                uploadDate: new Date().toISOString(),
                downloadUrl: `/api/files/download/${fileEntity.id}`,
            };

            this.logger.log(`[COMPLETE] File merged: ${finalFileName}`);
            return fileInfo;
        } catch (error) {
            session.status = "failed";
            throw error;
        }
    }

    /**
     * 업로드 상태 조회
     */
    getUploadStatus(sessionId: string): UploadStatusResponse {
        const session = this.uploadSessions.get(sessionId);
        if (!session) {
            throw new Error("Upload session not found");
        }

        const progress = Math.round((session.uploadedChunks.size / session.totalChunks) * 100);
        const missingChunks: number[] = [];

        for (let i = 0; i < session.totalChunks; i++) {
            if (!session.uploadedChunks.has(i)) {
                missingChunks.push(i);
            }
        }

        return {
            sessionId,
            status: session.status,
            progress,
            uploadedChunks: session.uploadedChunks.size,
            totalChunks: session.totalChunks,
            missingChunks: missingChunks.slice(0, 10), // 최대 10개만 반환
            fileName: session.fileName,
            fileSize: session.fileSize,
            lastActivity: session.lastActivity,
        };
    }

    /**
     * 업로드 취소
     */
    cancelUpload(sessionId: string): void {
        const session = this.uploadSessions.get(sessionId);
        if (!session) {
            throw new Error("Upload session not found");
        }

        this.cleanupSession(sessionId);
        this.logger.log(`[CANCEL] Session cancelled: ${sessionId}`);
    }

    /**
     * 파일 해시 계산
     */
    private calculateFileHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash("sha256");
            const stream = fs.createReadStream(filePath);

            stream.on("data", data => hash.update(data));
            stream.on("end", () => resolve(hash.digest("hex")));
            stream.on("error", reject);
        });
    }
    /**
     * 파일 다운로드를 위한 파일 조회
     */
    async getFileForDownload(id: string): Promise<{ filePath: string; originalName: string; mimeType: string } | null> {
        const file = await this.fileRepository.findById(id);
        if (!file?.isActive) {
            return null;
        }

        if (!fs.existsSync(file.filePath)) {
            this.logger.error(`File not found on disk: ${file.filePath}`);
            return null;
        }

        return {
            filePath: file.filePath,
            originalName: file.originalName,
            mimeType: file.mimeType,
        };
    }

    /**
     * 파일 목록 조회
     */
    async getFiles(page: number = 1, limit: number = 10) {
        return await this.fileRepository.findWithPagination(page, limit);
    }

    /**
     * 파일 삭제
     */
    async deleteFile(id: string): Promise<boolean> {
        const file = await this.fileRepository.findById(id);
        if (!file) {
            return false;
        }

        // 물리적 파일 삭제
        if (fs.existsSync(file.filePath)) {
            fs.unlinkSync(file.filePath);
        }

        // 데이터베이스에서 삭제
        return await this.fileRepository.softDelete(id);
    }

    /**
     * 만료된 세션 정리 (정기적으로 실행)
     */
    private cleanupExpiredSessions(): void {
        const now = Date.now();
        const sessionTimeout = 30 * 60 * 1000; // 30분

        for (const [sessionId, session] of this.uploadSessions.entries()) {
            if (now - session.lastActivity > sessionTimeout) {
                this.logger.log(`[CLEANUP] Removing expired session: ${sessionId}`);
                this.cleanupSession(sessionId);
            }
        }
    }

    /**
     * 서비스 시작 시 초기화
     */
    onModuleInit() {
        // 업로드 디렉토리 생성
        [this.UPLOAD_DIR, this.TEMP_DIR].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                this.logger.log(`Created directory: ${dir}`);
            }
        });

        // 정기적으로 만료된 세션 정리 (5분마다)
        setInterval(
            () => {
                this.cleanupExpiredSessions();
            },
            5 * 60 * 1000,
        );

        this.logger.log("FileService initialized");
    }
}
