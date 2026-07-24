/**
 * 客户端 patch:给原生 fetch / EventSource 的 /api/ 请求加 basePath 前缀。
 *
 * 为什么需要:Next.js basePath 只给 <Link>/<Image> 等内置组件自动加前缀,
 * 不影响业务代码里的原生 fetch("/api/...") 和 new EventSource("/api/...")。
 * pi-web 有 ~58 处散落的硬编码 /api 绝对路径,逐个改会和上游 agegr/pi-web 永久冲突,
 * 所以在这里统一 monkey-patch,业务代码零改动,同步上游零负担。
 *
 * 时机:模块顶层执行(import 时),早于任何业务 useEffect 里的 fetch。
 * 幂等:重复 import 不重复 patch(__basePathPatched 标志位)。
 * 根路径模式(NEXT_PUBLIC_BASE_PATH 为空 / 非 browser):不 patch,行为完全不变。
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

declare global {
	interface Window {
		__basePathPatched?: boolean;
	}
}

if (BASE_PATH && typeof window !== "undefined" && !window.__basePathPatched) {
	window.__basePathPatched = true;

	// --- fetch:只改 string 形态的 "/api/..." 输入 ---
	const originalFetch = window.fetch.bind(window);
	window.fetch = ((
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> => {
		if (typeof input === "string" && input.startsWith("/api/")) {
			return originalFetch(BASE_PATH + input, init);
		}
		return originalFetch(input, init);
	}) as typeof window.fetch;

	// --- EventSource:包装构造函数,改 "/api/..." 的 url ---
	const OriginalEventSource = window.EventSource;
	class PatchedEventSource extends OriginalEventSource {
		constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
			const href = typeof url === "string" ? url : url.href;
			const patched = href.startsWith("/api/") ? BASE_PATH + href : href;
			super(patched, eventSourceInitDict);
		}
	}
	window.EventSource = PatchedEventSource as unknown as typeof EventSource;
}

export {};
