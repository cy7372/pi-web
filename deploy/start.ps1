# Windows launcher: pi-web production (root path), loopback only.
# Security: package.json start script hardcodes -H 127.0.0.1 — never change to 0.0.0.0
# (would expose 30141 publicly, bypassing nginx TOTP gate).
# nginx proxies pi.cyyu.me → 30141 with auth_request TOTP gate.
$env:NO_PROXY = "localhost,127.0.0.1"
Set-Location "D:\Programs\pi-web"
bun run start
