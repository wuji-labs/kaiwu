import { describe, expect, it, vi } from 'vitest';
import { deleteAccount } from './apiAccountDelete';

vi.mock('@/sync/http/client', () => ({
    serverFetch: vi.fn(),
}));

import { serverFetch } from '@/sync/http/client';

describe('apiAccountDelete', () => {
    it('calls DELETE /v1/account with bearer token and returns success', async () => {
        vi.mocked(serverFetch).mockResolvedValueOnce(
            new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        const result = await deleteAccount({ token: 'test-token', secret: 'test-secret' });
        expect(result).toEqual({ success: true });
        expect(serverFetch).toHaveBeenCalledWith(
            '/v1/account',
            expect.objectContaining({
                method: 'DELETE',
                headers: {
                    Authorization: 'Bearer test-token',
                },
            }),
            { includeAuth: false },
        );
    });

    it('throws HappyError on 400 Bad Request error', async () => {
        vi.mocked(serverFetch).mockResolvedValueOnce(
            new Response(JSON.stringify({ error: 'Cannot delete account' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        await expect(deleteAccount({ token: 'test-token', secret: 'test-secret' })).rejects.toThrow(
            'Cannot delete account',
        );
    });
});
