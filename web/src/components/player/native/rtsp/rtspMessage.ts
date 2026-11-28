/**
 * RTSP message framing
 *
 * Serialize RTSP 1.0 requests and separate incoming RTSP messages from
 * interleaved binary packets. Each parser retains incomplete messages
 * across reads and uses the declared lengths to find message boundaries.
 *
 * The session layer interprets RTSP headers and assigns media packets
 * to their negotiated RTP and RTCP channels.
 */
const HEADER_LIMIT = 32 * 1024;
const BODY_LIMIT = 1024 * 1024;
const INTERLEAVED_HEADER_SIZE = 4;
const DOLLAR = 0x24;
const CR = 13;
const LF = 10;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const token = /^[A-Za-z0-9!#$%&'*+.^_\x60|~-]+$/;
const invalidHeaderValue = /[\x00-\x08\x0a-\x1f\x7f]/;

interface RtspHeaders {
  readonly headers: ReadonlyMap<string, string>;
  readonly body: Uint8Array;
}

export interface RtspResponse extends RtspHeaders {
  readonly type: 'response';
  readonly status: number;
  readonly reason: string;
}

export interface RtspRequest extends RtspHeaders {
  readonly type: 'request';
  readonly method: string;
  readonly uri: string;
}

export interface InterleavedPacket {
  readonly type: 'interleaved';
  readonly channel: number;
  readonly data: Uint8Array;
}

export type RtspMessage = RtspResponse | RtspRequest | InterleavedPacket;

export const serializeRtspRequest = (
  method: string,
  uri: string,
  headers: Readonly<Record<string, string>>,
  body: Uint8Array = new Uint8Array(0)
): Uint8Array => {
  if (
    !token.test(method) ||
    method.startsWith('$') ||
    !uri ||
    /[\s\x00-\x1f\x7f]/.test(uri)
  ) {
    throw new Error('Invalid RTSP request line');
  }

  const lines = [`${method} ${uri} RTSP/1.0`];
  for (const [name, value] of Object.entries(headers)) {
    if (!token.test(name) || invalidHeaderValue.test(value)) {
      throw new Error('Invalid RTSP header');
    }
    if (name.toLowerCase() === 'content-length') {
      throw new Error('Content-Length is calculated from the RTSP body');
    }
    lines.push(`${name}: ${value}`);
  }
  if (body.length) {
    lines.push(`Content-Length: ${body.length}`);
  }

  const head = encoder.encode(lines.join('\r\n') + '\r\n\r\n');
  const result = new Uint8Array(head.length + body.length);
  result.set(head);
  result.set(body, head.length);
  return result;
};

const readContentLength = (headers: ReadonlyMap<string, string>): number => {
  const value = headers.get('content-length')?.trim() ?? '0';
  const length = Number(value);
  if (!/^\d+$/.test(value) || length > BODY_LIMIT) {
    throw new Error('Invalid or oversized RTSP Content-Length');
  }
  return length;
};

const parseHead = (text: string): RtspResponse | RtspRequest => {
  const [startLine, ...lines] = text.split(/\r\n|\n|\r/);
  const headers = new Map<string, string>();
  let previousName: string | undefined;

  for (const line of lines) {
    if (invalidHeaderValue.test(line)) {
      throw new Error('Invalid RTSP header value');
    }
    if (/^[ \t]/.test(line)) {
      if (previousName === undefined) {
        throw new Error('RTSP header continuation without a preceding header');
      }
      headers.set(previousName, `${headers.get(previousName)} ${line.trim()}`);
      continue;
    }
    const colon = line.indexOf(':');
    const name = line.slice(0, colon).trim().toLowerCase();
    if (colon < 1 || !token.test(name)) {
      throw new Error('Invalid RTSP header');
    }
    const value = line.slice(colon + 1).trim();
    const previous = headers.get(name);
    if (name === 'content-length' && previous !== undefined) {
      throw new Error('Duplicate RTSP Content-Length');
    }
    headers.set(name, previous === undefined ? value : `${previous}, ${value}`);
    previousName = name;
  }

  const response = /^RTSP\/1\.0 ([1-5]\d{2})(?: ([^\r\n]*))?$/.exec(startLine);
  if (response && !invalidHeaderValue.test(response[2] ?? '')) {
    const status = Number(response[1]);
    /* RFC 2326 section 4.4: these responses end at the header delimiter. */
    const length =
      status < 200 || status === 204 || status === 304
        ? 0
        : readContentLength(headers);
    return {
      type: 'response',
      status,
      reason: response[2] ?? '',
      headers,
      body: new Uint8Array(length)
    };
  }
  const request = /^(\S+) (\S+) RTSP\/1\.0$/.exec(startLine);
  if (
    request &&
    token.test(request[1]) &&
    !/[\x00-\x1f\x7f]/.test(request[2])
  ) {
    return {
      type: 'request',
      method: request[1],
      uri: request[2],
      headers,
      body: new Uint8Array(readContentLength(headers))
    };
  }
  throw new Error('Invalid RTSP start line');
};

/* One parser per connection. Only the incomplete header and payload are retained.
 * A malformed message is fatal to the connection; discard the parser on error.
 */
export class RtspParser {
  private readonly header = new Uint8Array(HEADER_LIMIT);
  private headerLength = 0;
  private pending?: { message: RtspMessage; bytes: Uint8Array; written: number };

  parse(chunk: Uint8Array): RtspMessage[] {
    const messages: RtspMessage[] = [];
    let offset = 0;

    while (offset < chunk.length) {
      if (this.pending) {
        const pending = this.pending;
        const count = Math.min(
          chunk.length - offset,
          pending.bytes.length - pending.written
        );
        pending.bytes.set(
          chunk.subarray(offset, offset + count),
          pending.written
        );
        pending.written += count;
        offset += count;
        if (pending.written === pending.bytes.length) {
          messages.push(pending.message);
          this.pending = undefined;
        }
        continue;
      }

      const byte = chunk[offset++];
      if (this.headerLength === 0 && (byte === CR || byte === LF)) {
        continue;
      }
      this.header[this.headerLength++] = byte;
      const length = this.headerLength;
      let message: RtspMessage | undefined;
      if (this.header[0] === DOLLAR) {
        if (length === INTERLEAVED_HEADER_SIZE) {
          const size = this.header[2] * 256 + this.header[3];
          message = {
            type: 'interleaved',
            channel: this.header[1],
            data: new Uint8Array(size)
          };
        }
      } else {
        const delimiter = this.headerDelimiterLength();
        if (delimiter) {
          message = parseHead(
            decoder.decode(this.header.subarray(0, length - delimiter))
          );
        }
      }

      if (message) {
        this.headerLength = 0;
        const bytes =
          message.type === 'interleaved' ? message.data : message.body;
        if (bytes.length) {
          this.pending = { message, bytes, written: 0 };
        } else {
          messages.push(message);
        }
      } else if (length === HEADER_LIMIT) {
        throw new Error('RTSP header exceeds size limit');
      }
    }
    return messages;
  }

  /* Accept CRLF and the single-character line endings accepted by the Axis parser. */
  private headerDelimiterLength(): number {
    const n = this.headerLength;
    const h = this.header;
    if (
      n >= 4 &&
      h[n - 4] === CR &&
      h[n - 3] === LF &&
      h[n - 2] === CR &&
      h[n - 1] === LF
    ) {
      return 4;
    }
    if (
      n >= 2 &&
      ((h[n - 2] === LF && h[n - 1] === LF) ||
        (h[n - 2] === CR && h[n - 1] === CR))
    ) {
      return 2;
    }
    return 0;
  }
}
