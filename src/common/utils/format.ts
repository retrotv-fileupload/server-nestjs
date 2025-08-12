export const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const formatPercent = (value1: number, value2: number): string => {
    if (value2 === 0) {
        return "0%";
    }

    return `${((value1 / value2) * 100).toFixed(2)}%`;
};
