import { Response } from "express";

export const sendOK = (res: Response, message: string = "OK", data?: any) => {
    sendResponse(res, 200, message, data);
};

export const sendBadRequest = (res: Response, message: string = "Bad Request") => {
    sendResponse(res, 400, message);
};

export const sendUnauthorized = (res: Response, message: string = "Unauthorized") => {
    sendResponse(res, 401, message);
};

export const sendForbidden = (res: Response, message: string = "Forbidden") => {
    sendResponse(res, 403, message);
};

export const sendNotFound = (res: Response, message: string = "Not Found") => {
    sendResponse(res, 404, message);
};

export const sendTooManyRequests = (res: Response, message: string = "Too Many Requests") => {
    sendResponse(res, 429, message);
};

export const sendInternalServerError = (res: Response, message: string = "Internal Server Error") => {
    sendResponse(res, 500, message);
};

const sendResponse = (res: Response, statusCode: number, message: string, data?: any) => {
    if (res.headersSent) {
        return;
    }

    const success = statusCode < 400;
    res.status(statusCode).json({
        success,
        ...(success ? { message } : { error: message }),
        ...(data !== undefined && data !== null ? { data } : {}),
        timestamp: new Date().toISOString(),
    });
};
