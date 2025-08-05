import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface LogData {
    method: string;
    url: string;
    ip: string;
    userAgent: string;
    startTime: number;
    endTime?: number;
    statusCode?: number;
    contentLength?: number;
    duration?: number;
}

@Injectable()
export class AdvancedLoggingMiddleware implements NestMiddleware {
    private readonly logger = new Logger(AdvancedLoggingMiddleware.name);

    use(req: Request, res: Response, next: NextFunction): void {
        const logData: LogData = {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userAgent: req.get('user-agent') || '',
            startTime: Date.now(),
        };

        // Request 로깅
        this.logRequest(req, logData);

        // Response 가로채기
        this.interceptResponse(res, logData);

        next();
    }

    private logRequest(req: Request, logData: LogData): void {
        const { method, url, ip, userAgent } = logData;
        
        this.logger.log(`🚀 [REQ] ${method} ${url} - IP: ${ip}`);
        
        if (Logger.isLevelEnabled('debug')) {
            this.logger.debug(`
                📥 [REQUEST DETAILS]
                Method: ${method}
                URL: ${url}
                IP: ${ip}
                User-Agent: ${userAgent}
                Headers: ${JSON.stringify(req.headers, null, 2)}
            `);
        }

        // Body가 있는 요청의 경우 로깅
        if (['POST', 'PUT', 'PATCH'].includes(method) && req.body) {
            this.logger.debug(`📦 [REQUEST BODY] ${JSON.stringify(req.body, null, 2)}`);
        }
    }

    private interceptResponse(res: Response, logData: LogData): void {
        const originalSend = res.send;
        const originalJson = res.json;

        // res.send() 가로채기
        res.send = (body: any) => {
            this.logResponse(logData, res.statusCode, body);
            return originalSend.call(res, body);
        };

        // res.json() 가로채기
        res.json = (obj: any) => {
            this.logResponse(logData, res.statusCode, obj);
            return originalJson.call(res, obj);
        };

        // 스트림 응답 처리
        res.on('finish', () => {
            if (!logData.endTime) {
                this.logResponse(logData, res.statusCode, null, true);
            }
        });
    }

    private logResponse(logData: LogData, statusCode: number, body?: any, isStream = false): void {
        logData.endTime = Date.now();
        logData.statusCode = statusCode;
        logData.duration = logData.endTime - logData.startTime;

        const { method, url, duration } = logData;
        const statusEmoji = this.getStatusEmoji(statusCode);
        
        this.logger.log(`${statusEmoji} [RES] ${method} ${url} - ${statusCode} (${duration}ms)`);

        if (Logger.isLevelEnabled('debug')) {
            let bodyText = '';
            if (body && !isStream) {
                bodyText = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
            }
                
            this.logger.debug(`
                📤 [RESPONSE DETAILS]
                Status: ${statusCode}
                Duration: ${duration}ms
                Type: ${isStream ? 'Stream/File' : 'JSON/Text'}
                ${bodyText ? `Body: ${bodyText}` : ''}
            `);
        }

        // 에러 응답 특별 로깅
        if (statusCode >= 400) {
            this.logger.error(`❌ [ERROR] ${method} ${url} - ${statusCode} ${body ? JSON.stringify(body) : ''}`);
        }

        // 느린 응답 경고
        if (duration > 1000) {
            this.logger.warn(`🐌 [SLOW] ${method} ${url} took ${duration}ms`);
        }
    }

    private getStatusEmoji(statusCode: number): string {
        if (statusCode >= 200 && statusCode < 300) return '✅';
        if (statusCode >= 300 && statusCode < 400) return '🔄';
        if (statusCode >= 400 && statusCode < 500) return '⚠️';
        if (statusCode >= 500) return '❌';
        return '📡';
    }
}
