export interface SSEMessage {
  event: string;
  data: string;
}

const DEFAULT_EVENT = "message";

/**
 * Incremental Server-Sent Events parser.
 *
 * A network chunk has no relationship to a message boundary: one read can
 * deliver half a field, three whole messages, or a lone newline. The parser
 * therefore keeps a buffer across calls and only emits complete messages,
 * which is what makes token streaming render without truncation artefacts.
 *
 * Follows the WHATWG event-stream rules that matter here: CRLF and CR are
 * normalised, a blank line dispatches, `data:` lines accumulate with newline
 * separators, and a leading space after the colon is stripped.
 */
export function createSSEParser(): (chunk: string) => SSEMessage[] {
  let buffer = "";

  return function parse(chunk: string): SSEMessage[] {
    buffer += chunk.replace(/\r\n?/g, "\n");

    const messages: SSEMessage[] = [];
    let boundary = buffer.indexOf("\n\n");

    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      let event = DEFAULT_EVENT;
      const dataLines: string[] = [];

      for (const line of block.split("\n")) {
        // Comment/heartbeat lines keep proxies from closing an idle stream.
        if (line === "" || line.startsWith(":")) continue;

        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const rawValue = colon === -1 ? "" : line.slice(colon + 1);
        const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

        if (field === "event") event = value;
        else if (field === "data") dataLines.push(value);
      }

      if (dataLines.length > 0) {
        messages.push({ event, data: dataLines.join("\n") });
      }
    }

    return messages;
  };
}
