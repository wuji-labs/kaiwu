import type { AuthCredentials } from '@/auth/storage/tokenStorage';
import { backoff } from '@/utils/timing/time';
import { serverFetch } from '@/sync/http/client';
import { HappyError } from '@/utils/errors/errors';

export async function deleteAccount(
    credentials: AuthCredentials,
): Promise<{ success: boolean }> {
    return await backoff(async () => {
        const response = await serverFetch('/v1/account', {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${credentials.token}`,
            },
        }, { includeAuth: false });

        if (!response.ok) {
            if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
                let message = 'Failed to delete account';
                try {
                    const error = await response.json();
                    if (error?.error) message = error.error;
                } catch {
                    // ignore
                }
                throw new HappyError(message, false, { status: response.status });
            }
            throw new Error(`Failed to delete account: ${response.status}`);
        }

        const data = await response.json();
        return data as { success: boolean };
    });
}
