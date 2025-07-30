// 초기화 요청 DTO
export interface InitData {
    fileName: string;
    fileSize: number;
    totalChunks: number;
    mimeType?: string;
}

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
