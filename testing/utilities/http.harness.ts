import type { Elysia } from "elysia";
import { vi } from "vitest";

export interface Reply {
	readonly status: number;
	readonly headers: Headers;
	readonly body: any;
}

export async function call(app: Elysia<any, any, any, any, any, any, any>, path: string, init?: RequestInit): Promise<Reply> {
	const response = await app.handle(new Request(`http://localhost${path}`, init));
	const text = await response.text();
	await settle();
	return { status: response.status, headers: response.headers, body: text ? safeJson(text) : null };
}

export function postJson(body: unknown): RequestInit {
	return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function captureLogs(channel: "log" | "error" = "log") {
	const spy = vi.spyOn(console, channel).mockImplementation(() => {});
	return {
		lines: () => spy.mock.calls.map(([line]) => JSON.parse(String(line))),
		restore: () => spy.mockRestore(),
	};
}

// onAfterResponse hooks run after the response is returned, so let them finish before assertions read their effects.
function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
