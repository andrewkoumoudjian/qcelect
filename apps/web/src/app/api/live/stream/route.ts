import { getLive } from "../../../../server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const live = await getLive();
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      const unsubscribe = live.subscribe((state) =>
        send(`id: ${state.sourceSha256}\ndata: ${JSON.stringify(state)}\n\n`),
      );
      const current = live.current();
      if (current)
        send(
          `id: ${current.sourceSha256}\ndata: ${JSON.stringify(current)}\n\n`,
        );
      else send(": waiting for official results\n\n");
      const heartbeat = setInterval(() => send(": heartbeat\n\n"), 15_000);
      const abort = () => {
        cleanup();
        controller.close();
      };
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", abort);
      };
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) abort();
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
