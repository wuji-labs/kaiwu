const GITHUB_FINE_GRAINED_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function buildGithubPersonalAccessTokenUrl(): string {
    const url = new URL(GITHUB_FINE_GRAINED_TOKEN_URL);
    url.searchParams.set('name', 'Kaiwu');
    url.searchParams.set(
        'description',
        'Use this token for Kaiwu pull request and repository publishing workflows.',
    );
    url.searchParams.set('expires_in', '90');
    url.searchParams.set('contents', 'write');
    url.searchParams.set('pull_requests', 'write');
    url.searchParams.set('administration', 'write');
    return url.toString();
}
