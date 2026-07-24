import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

const { version } = JSON.parse(
	readFileSync(join(__dirname, "package.json"), "utf8"),
) as { version: string };
let piVersion = "unknown";
try {
	const piPkgPath = join(
		__dirname,
		"node_modules/@earendil-works/pi-coding-agent/package.json",
	);
	piVersion = (
		JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }
	).version;
} catch {
	/* package not found, use default */
}

const nextConfig: NextConfig = {
	// 子路径部署(如 pub.cyyu.me:8443/pi)。不设环境变量 = 根路径(开发默认,零影响)。
	// 配套 lib/base-path.ts 给原生 fetch/EventSource 加前缀(basePath 不影响业务里的 fetch)。
	basePath: process.env.PI_WEB_BASE_PATH || undefined,
	serverExternalPackages: [
		"undici",
		"@earendil-works/pi-coding-agent",
		"@earendil-works/pi-agent-core",
		"@earendil-works/pi-ai",
		"@earendil-works/pi-tui",
	],
	allowedDevOrigins: ["192.168.*.*"],
	async headers() {
		return [
			{
				source: "/",
				headers: [
					{
						key: "Cache-Control",
						value: "private, no-cache, max-age=0, must-revalidate",
					},
				],
			},
		];
	},
	env: {
		NEXT_PUBLIC_APP_VERSION: version,
		NEXT_PUBLIC_PI_VERSION: piVersion,
		// 客户端 patch 用:与 basePath 同值。空串 = 不 patch(根路径模式)。
		NEXT_PUBLIC_BASE_PATH: process.env.PI_WEB_BASE_PATH || "",
	},
};

export default nextConfig;
