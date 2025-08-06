import { IncomingHttpHeaders } from "http";

export interface LogData {
    method: string;
    url: string;
    ip: string;
    userAgent: string;
    startTime: number;
    headers?: IncomingHttpHeaders;
    endTime?: number;
    statusCode?: number;
    contentLength?: number;
    duration?: number;
}
