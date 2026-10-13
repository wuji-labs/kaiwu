import {
    type ChunkUploadProgress,
    type UploadChunkRequest,
    type UploadInitOptions,
    uploadInChunks,
} from './chunkTransferClient';

export type BulkTransferFailureResponse = Readonly<{
    success: false;
    error: string;
    errorCode?: string;
}>;

export type BulkTransferFileReader = Readonly<{
    sizeBytes: number;
    readBytes: (offset: number, length: number) => Promise<Uint8Array>;
    close: () => Promise<void>;
}>;

type BulkTransferUploadInitSuccess = Readonly<{
    success: true;
    uploadId: string;
    chunkSizeBytes: number;
    recipientPublicKeyBase64: string;
}>;

export async function uploadBulkPayloadFromFile<TFinalize extends { success: boolean; error?: string }>(params: Readonly<{
    fileReader: BulkTransferFileReader;
    init: (options: UploadInitOptions) => Promise<BulkTransferUploadInitSuccess | BulkTransferFailureResponse>;
    sendChunk: (request: UploadChunkRequest) => Promise<{ success: boolean; error?: string }>;
    finalize: (request: Readonly<{ uploadId: string }>) => Promise<TFinalize>;
    abort?: ((request: Readonly<{ uploadId: string }>) => Promise<unknown>) | null;
    onProgress?: ((progress: ChunkUploadProgress) => void) | null;
    signal?: AbortSignal | null;
    allowObjectStoreRelay?: boolean;
}>): Promise<TFinalize | BulkTransferFailureResponse> {
    try {
        return await uploadInChunks<
            BulkTransferUploadInitSuccess | BulkTransferFailureResponse,
            { success: boolean; error?: string },
            TFinalize
        >({
            totalBytes: params.fileReader.sizeBytes,
            readBytes: async (offset, length) => await params.fileReader.readBytes(offset, length),
            init: async (options) => await params.init(options),
            sendChunk: async (request) => await params.sendChunk(request),
            finalize: async (request) => await params.finalize(request),
            abort: params.abort ?? null,
            onProgress: params.onProgress ?? null,
            signal: params.signal ?? null,
            allowObjectStoreRelay: params.allowObjectStoreRelay === true,
        });
    } finally {
        await params.fileReader.close();
    }
}
