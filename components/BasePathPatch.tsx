"use client";

/**
 * 仅用于触发 lib/base-path 的加载(patch 在 import 时执行)。渲染 null。
 * 放在 layout body 最前,确保 patch 早于业务组件的首次 fetch。
 */
import "@/lib/base-path";

export default function BasePathPatch() {
	return null;
}
