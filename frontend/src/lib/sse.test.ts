import { describe, expect, it } from "vitest";
import { createSSEParser } from "./sse";

describe("createSSEParser", () => {
  it("emits a complete message and reports its event name", () => {
    const parse = createSSEParser();

    expect(parse('event: token\ndata: "hello"\n\n')).toEqual([
      { event: "token", data: '"hello"' },
    ]);
  });

  it("holds back a message until its terminating blank line arrives", () => {
    const parse = createSSEParser();

    expect(parse("event: token\ndata: ")).toEqual([]);
    expect(parse('"partial"')).toEqual([]);
    expect(parse("\n\n")).toEqual([{ event: "token", data: '"partial"' }]);
  });

  it("splits several messages delivered in one network chunk", () => {
    const parse = createSSEParser();

    const messages = parse(
      'event: token\ndata: "a"\n\nevent: token\ndata: "b"\n\nevent: done\ndata: {}\n\n',
    );

    expect(messages).toEqual([
      { event: "token", data: '"a"' },
      { event: "token", data: '"b"' },
      { event: "done", data: "{}" },
    ]);
  });

  it("reassembles a token split across two reads", () => {
    const parse = createSSEParser();

    expect(parse('event: token\ndata: "hel')).toEqual([]);
    expect(parse('lo"\n\n')).toEqual([{ event: "token", data: '"hello"' }]);
  });

  it("joins repeated data fields with newlines, per the spec", () => {
    const parse = createSSEParser();

    expect(parse("event: meta\ndata: line one\ndata: line two\n\n")).toEqual([
      { event: "meta", data: "line one\nline two" },
    ]);
  });

  it("normalises CRLF line endings", () => {
    const parse = createSSEParser();

    expect(parse('event: token\r\ndata: "x"\r\n\r\n')).toEqual([
      { event: "token", data: '"x"' },
    ]);
  });

  it("ignores comment heartbeats that keep proxies from closing the stream", () => {
    const parse = createSSEParser();

    expect(parse(': keep-alive\n\nevent: token\ndata: "x"\n\n')).toEqual([
      { event: "token", data: '"x"' },
    ]);
  });

  it("defaults to the 'message' event when none is named", () => {
    const parse = createSSEParser();

    expect(parse("data: bare\n\n")).toEqual([{ event: "message", data: "bare" }]);
  });

  it("preserves a leading space only when it is not the field separator space", () => {
    const parse = createSSEParser();

    expect(parse("data:  two-spaces\n\n")).toEqual([
      { event: "message", data: " two-spaces" },
    ]);
  });
});
