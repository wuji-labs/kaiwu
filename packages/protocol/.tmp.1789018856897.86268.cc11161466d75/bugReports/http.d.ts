export declare function withAbortTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T>;
export declare function readSafeBugReportErrorText(response: Response): Promise<string>;
export declare function postJson<TResponse>(input: {
    url: string;
    body: unknown;
    timeoutMs: number;
}): Promise<TResponse>;
export declare function getJson<TResponse>(input: {
    url: string;
    timeoutMs: number;
}): Promise<TResponse>;
//# sourceMappingURL=http.d.ts.map