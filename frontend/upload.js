// 청크 기반 대용량 파일 업로드 클라이언트

// 전역 변수
let sessionId = null;
let statusInterval = null;
let isUploading = false;
let isPaused = false;
let uploadController = null; // AbortController for pausing uploads
let currentFile = null;
let totalChunks = 0;

const CHUNK_SIZE = 8 * 1024 * 1024; // 2MB 청크 크기
const API_BASE = "http://localhost:3000";

// 로그 함수
function log(message, type = "info") {
    const logElement = document.getElementById("log");
    const timestamp = new Date().toLocaleTimeString();

    let prefix;
    if (type === "error") {
        prefix = "❌";
    } else if (type === "success") {
        prefix = "✅";
    } else {
        prefix = "ℹ️";
    }

    logElement.innerHTML += `[${timestamp}] ${prefix} ${message}\n`;
    logElement.scrollTop = logElement.scrollHeight;
    console.log(`[${type.toUpperCase()}]`, message);
}

// 상태 업데이트
function updateStatus(message, type = "info") {
    const statusElement = document.getElementById("status");
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    log(message, type);
}

// 진행률 업데이트
function updateProgress(progress, uploaded, total) {
    document.getElementById("progressFill").style.width = progress + "%";
    document.getElementById("progressFill").textContent = progress + "%";
    document.getElementById("progressText").textContent = progress + "%";
    document.getElementById("chunksText").textContent = `${uploaded} / ${total}`;
}

// 파일 크기 포맷팅
function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// 버튼 상태 관리
function setButtonStates(uploading, paused = false) {
    const uploadBtn = document.getElementById("uploadBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    const cancelBtn = document.getElementById("cancelBtn");

    if (uploading) {
        uploadBtn.className = "btn-primary btn-disabled";
        uploadBtn.textContent = "⏳ 업로드 중...";
        pauseBtn.className = paused ? "btn-primary" : "btn-pause";
        pauseBtn.textContent = paused ? "▶️ 재개" : "⏸️ 일시정지";
        cancelBtn.className = "btn-secondary";
    } else {
        uploadBtn.className = "btn-primary";
        uploadBtn.textContent = "📤 업로드 시작";
        pauseBtn.className = "btn-pause btn-disabled";
        pauseBtn.textContent = "⏸️ 일시정지";
        cancelBtn.className = "btn-secondary btn-disabled";
    }
}

// 일시정지/재개 토글
function togglePause() {
    if (!isUploading) return;

    isPaused = !isPaused;
    setButtonStates(isUploading, isPaused);

    if (isPaused) {
        if (uploadController) {
            uploadController.abort();
        }
        updateStatus("업로드가 일시정지되었습니다.", "info");
        log("⏸️ 업로드 일시정지", "info");
        document.getElementById("statusText").textContent = "일시정지";
    } else {
        updateStatus("업로드를 재개합니다...", "info");
        log("▶️ 업로드 재개", "info");
        document.getElementById("statusText").textContent = "재개 중";
        resumeUpload();
    }
}

// 상태 모니터링 시작
function startStatusMonitoring() {
    if (statusInterval) clearInterval(statusInterval);

    statusInterval = setInterval(async () => {
        if (!sessionId) return;

        try {
            const response = await fetch(`${API_BASE}/api/files/upload/status/${sessionId}`);
            const data = await response.json();

            if (response.ok) {
                updateProgress(data.data.progress, data.data.uploadedChunks, data.data.totalChunks);
                if (!isPaused) {
                    document.getElementById("statusText").textContent = data.data.status;
                }

                if (data.data.progress === 100 && data.data.status === "all_chunks_uploaded") {
                    log("모든 청크 업로드 완료! 파일 병합을 시작합니다.", "success");
                }
            }
        } catch (error) {
            log(`상태 조회 실패: ${error.message}`, "error");
        }
    }, 1000); // 1초마다 상태 확인
}

// 상태 모니터링 중지
function stopStatusMonitoring() {
    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }
}

// 업로드 시작
async function startUpload() {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

    if (!file) {
        updateStatus("파일을 선택해주세요.", "error");
        return;
    }

    if (isUploading) {
        updateStatus("이미 업로드가 진행 중입니다.", "error");
        return;
    }

    currentFile = file;
    totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    isUploading = true;
    isPaused = false;
    setButtonStates(true, false);

    // 파일 정보 표시
    document.getElementById("fileSizeText").textContent = formatFileSize(file.size);
    document.getElementById("statusText").textContent = "초기화 중";

    log(`업로드 시작: ${file.name} (${formatFileSize(file.size)}, ${totalChunks}개 청크)`);

    try {
        // 1. 업로드 초기화
        updateStatus("업로드 세션을 초기화하는 중...");

        const initResponse = await fetch(`${API_BASE}/api/files/upload/init`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileName: file.name,
                fileSize: file.size,
                totalChunks: totalChunks,
                mimeType: file.type,
            }),
        });

        console.log(initResponse);

        const initData = await initResponse.json();
        if (!initResponse.ok) {
            throw new Error(initData.error || "초기화 실패");
        }

        sessionId = initData.data.sessionId;
        log(`세션 생성 완료: ${sessionId}`);

        // 2. 상태 모니터링 시작
        startStatusMonitoring();

        // 3. 청크 업로드 시작
        await performChunkUpload();
    } catch (error) {
        if (error.message !== "Upload paused") {
            updateStatus(`업로드 실패: ${error.message}`, "error");
            log(`업로드 실패: ${error.message}`, "error");
        }
    } finally {
        if (!isPaused) {
            isUploading = false;
            setButtonStates(false, false);
            stopStatusMonitoring();
            sessionId = null;
        }
    }
}

// 업로드 재개 함수
async function resumeUpload() {
    if (!sessionId || !currentFile) {
        updateStatus("재개할 업로드 세션이 없습니다.", "error");
        return;
    }

    isPaused = false;
    setButtonStates(true, false);

    try {
        await performChunkUpload();
    } catch (error) {
        if (error.message !== "Upload paused") {
            updateStatus(`업로드 재개 실패: ${error.message}`, "error");
            log(`업로드 재개 실패: ${error.message}`, "error");
        }
    } finally {
        if (!isPaused) {
            isUploading = false;
            setButtonStates(false, false);
            stopStatusMonitoring();
            sessionId = null;
        }
    }
}

// 상태 확인 및 업로드된 청크 계산
async function getUploadedChunks() {
    const uploadedChunks = new Set();

    try {
        const statusResponse = await fetch(`${API_BASE}/api/files/upload/status?sessionId=${sessionId}`);
        if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            console.log("statusData response:", statusData);

            log(`상태 조회: ${statusData.data.uploadedChunks}/${statusData.data.totalChunks} 청크 업로드됨`);
            log(`누락된 청크 개수: ${statusData.data.missingChunks ? statusData.data.missingChunks.length : 0}`);

            // 서버에서 업로드된 청크 수를 직접 사용
            if (statusData.data.missingChunks && Array.isArray(statusData.data.missingChunks)) {
                // 누락된 청크 목록으로부터 업로드된 청크 계산
                const missingChunks = new Set(statusData.data.missingChunks);
                for (let i = 0; i < totalChunks; i++) {
                    if (!missingChunks.has(i)) {
                        uploadedChunks.add(i);
                    }
                }
            }

            if (uploadedChunks.size > 0) {
                log(`재개: ${uploadedChunks.size}/${totalChunks} 청크가 이미 업로드됨`);
            }
        } else {
            log(`상태 확인 실패: HTTP ${statusResponse.status}`, "error");
        }
    } catch (error) {
        log(`상태 확인 실패, 처음부터 업로드: ${error.message}`, "error");
    }

    return uploadedChunks;
}

// 최종 상태 확인
async function verifyUploadComplete() {
    log("모든 청크 업로드 완료, 최종 상태를 확인합니다...");

    try {
        const finalStatusResponse = await fetch(`${API_BASE}/api/files/upload/status?sessionId=${sessionId}`);
        if (finalStatusResponse.ok) {
            const finalStatusData = await finalStatusResponse.json();
            log(`최종 상태: ${finalStatusData.data.uploadedChunks}/${finalStatusData.data.totalChunks} 청크 업로드됨`);

            if (finalStatusData.data.missingChunks && finalStatusData.data.missingChunks.length > 0) {
                const missingList = finalStatusData.data.missingChunks.slice(0, 5).join(", ");
                const moreText = finalStatusData.data.missingChunks.length > 5 ? "..." : "";
                log(
                    `경고: ${finalStatusData.data.missingChunks.length}개의 청크가 누락됨: [${missingList}${moreText}]`,
                    "error",
                );
                throw new Error(`Missing ${finalStatusData.data.missingChunks.length} chunks`);
            }
        }
    } catch (error) {
        log(`최종 상태 확인 실패: ${error.message}`, "error");
        throw error;
    }
}

// 파일 병합 완료
async function completeUpload() {
    updateStatus("파일 병합 중...");
    log("모든 청크 업로드 완료, 파일 병합을 시작합니다...");

    const completeResponse = await fetch(`${API_BASE}/api/files/upload/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
    });

    const completeData = await completeResponse.json();
    if (!completeResponse.ok) {
        throw new Error(completeData.error || `HTTP ${completeResponse.status}: 완료 처리 실패`);
    }

    updateStatus(`업로드 완료! 파일 ID: ${completeData.data.id}`, "success");
    log(`✅ 업로드 성공: ${completeData.data.downloadUrl}`, "success");
}

// 실제 청크 업로드 수행 함수
async function performChunkUpload() {
    updateStatus("파일을 청크 단위로 업로드하는 중...");

    // 현재 상태 확인하여 업로드된 청크 파악
    const uploadedChunks = await getUploadedChunks();

    // AbortController로 일시정지 지원
    uploadController = new AbortController();

    // 순차적으로 청크 업로드 (동시성 문제 해결)
    for (let i = 0; i < totalChunks; i++) {
        // 이미 업로드된 청크는 건너뛰기
        if (uploadedChunks.has(i)) {
            log(`청크 ${i + 1}/${totalChunks} 건너뛰기 (이미 업로드됨)`);
            continue;
        }

        if (isPaused) {
            log("업로드가 일시정지되었습니다.", "info");
            throw new Error("Upload paused");
        }

        if (!isUploading) {
            log("업로드가 취소되었습니다.", "info");
            break;
        }

        // 청크 업로드 시도
        log(`청크 ${i + 1}/${totalChunks} 업로드 시작...`);
        const success = await uploadSingleChunk(i);
        if (!success) {
            throw new Error(`청크 ${i} 업로드에 실패했습니다.`);
        }
    }

    if (isPaused) {
        return; // 일시정지된 경우 여기서 중단
    }

    if (!isUploading) {
        updateStatus("업로드가 취소되었습니다.", "error");
        return;
    }

    // 최종 상태 확인
    await verifyUploadComplete();

    // 짧은 대기 시간 추가하여 상태 모니터링이 마지막 상태를 확인할 수 있도록 함
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. 업로드 완료 처리
    await completeUpload();
}

// 단일 청크 업로드 함수
async function uploadSingleChunk(chunkIndex) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, currentFile.size);
    const chunk = currentFile.slice(start, end);

    const formData = new FormData();
    formData.append("sessionId", sessionId);
    formData.append("chunkIndex", chunkIndex);
    formData.append("chunk", chunk);

    const maxRetries = 3;

    for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
        if (isPaused) {
            throw new Error("Upload paused");
        }

        try {
            const response = await fetch(`${API_BASE}/api/files/upload/chunk`, {
                method: "POST",
                body: formData,
                signal: uploadController.signal,
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `HTTP ${response.status}: 청크 업로드 실패`);
            }

            log(`청크 ${chunkIndex + 1}/${totalChunks} 업로드 완료 (${result.data.progress}%)`);

            // 즉시 진행률 업데이트
            updateProgress(result.data.progress, result.data.uploadedChunks, result.data.totalChunks);

            // 모든 청크가 완료되었는지 확인
            if (result.data.isComplete) {
                log("🎉 모든 청크 업로드 완료!", "success");
                updateStatus("모든 청크 업로드 완료! 파일 병합 준비 중...", "success");
            }

            return true; // 성공
        } catch (error) {
            if (error.name === "AbortError" || isPaused) {
                throw new Error("Upload paused");
            }

            if (retryCount < maxRetries) {
                log(
                    `청크 ${chunkIndex} 업로드 실패 (재시도 ${retryCount + 1}/${maxRetries}): ${error.message}`,
                    "error",
                );
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
            } else {
                log(`청크 ${chunkIndex} 업로드 최종 실패: ${error.message}`, "error");
                return false; // 실패
            }
        }
    }

    return false; // 모든 재시도 실패
}

// 업로드 취소
async function cancelUpload() {
    if (!isUploading || !sessionId) {
        updateStatus("취소할 업로드가 없습니다.", "error");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/files/upload/cancel`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
        });

        if (response.ok) {
            updateStatus("업로드가 취소되었습니다.", "success");
            log("업로드 취소됨", "success");
        }
    } catch (error) {
        log(`취소 요청 실패: ${error.message}`, "error");
    } finally {
        isUploading = false;
        isPaused = false;
        setButtonStates(false, false);
        stopStatusMonitoring();
        sessionId = null;
        updateProgress(0, 0, 0);
        document.getElementById("statusText").textContent = "취소됨";
        if (uploadController) {
            uploadController.abort();
        }
    }
}

// 페이지 로드 시 초기화
document.addEventListener("DOMContentLoaded", () => {
    log("청크 기반 업로드 클라이언트가 준비되었습니다.");
    log(`청크 크기: ${formatFileSize(CHUNK_SIZE)}`);
    log(`API 서버: ${API_BASE}`);
});

// 페이지 종료 시 정리
window.addEventListener("beforeunload", e => {
    if (isUploading && !isPaused) {
        e.preventDefault();
        e.returnValue = "업로드가 진행 중입니다. 페이지를 떠나시겠습니까?";
    }
});
