# happierdev/dev-box

Run Kaiwu CLI + daemon inside a container, and pair it to your account without opening a browser.

The image contains the published `kaiwu` CLI binary and runs as the non-root `kaiwu` user. It does not include a Kaiwu source checkout or `hstack`.

Quick start (preview):

```bash
docker run --rm -it happierdev/dev-box:preview
```

Recommended: persist `~/.happier` so credentials and machine state survive restarts:

```bash
docker run --rm -it \
  -v happier-home:/home/happier/.happier \
  happierdev/dev-box:preview
```

Optional: install provider CLIs on first boot via `kaiwu install provider`:

```bash
docker run --rm -it \
  -e KAIWU_PROVIDER_CLIS=claude,codex \
  happierdev/dev-box:preview
```

Docs:

- Dev Containers: https://kaiwu.wujilabs.cn/docs/development/devcontainers
