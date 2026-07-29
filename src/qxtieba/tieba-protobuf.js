const APP_BASE_HOST = "tiebac.baidu.com";
const APP_VERSION = "12.64.1.1";
const THREAD_DETAIL_URL = `http://${APP_BASE_HOST}/c/f/pb/page?cmd=302001`;
const MULTIPART_BOUNDARY = "-*_r1999";
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

function concatBytes(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function encodeVarint(value) {
  let current = BigInt(value);
  if (current < 0n) current = BigInt.asUintN(64, current);
  const output = [];
  while (current > 0x7fn) {
    output.push(Number(current & 0x7fn) | 0x80);
    current >>= 7n;
  }
  output.push(Number(current));
  return Uint8Array.from(output);
}

function varintField(field, value) {
  return concatBytes(encodeVarint((field << 3) | 0), encodeVarint(value));
}

function bytesField(field, value) {
  return concatBytes(encodeVarint((field << 3) | 2), encodeVarint(value.length), value);
}

function stringField(field, value) {
  return bytesField(field, encoder.encode(String(value)));
}

function buildThreadRequest(tid, page = 1, limit = 20) {
  const common = concatBytes(
    varintField(1, 2),
    stringField(2, APP_VERSION),
  );
  const data = concatBytes(
    varintField(4, BigInt(String(tid))),
    varintField(13, Math.max(2, Number(limit) || 20)),
    varintField(18, Math.max(1, Number(page) || 1)),
    bytesField(25, common),
  );
  return bytesField(1, data);
}

function multipartBody(payload) {
  return concatBytes(
    encoder.encode(
      `--${MULTIPART_BOUNDARY}\r\n`
      + 'Content-Disposition: form-data; name="data"; filename="file"\r\n'
      + "\r\n",
    ),
    payload,
    encoder.encode(`\r\n--${MULTIPART_BOUNDARY}--\r\n`),
  );
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function readVarint(bytes, start) {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < bytes.length && shift <= 70n) {
    const byte = bytes[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7n;
  }
  throw new Error("Invalid Tieba protobuf varint");
}

function decodeMessage(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  const fields = new Map();
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.offset;
    const field = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    let value;
    if (wire === 0) {
      const decoded = readVarint(bytes, offset);
      value = decoded.value;
      offset = decoded.offset;
    } else if (wire === 1) {
      if (offset + 8 > bytes.length) throw new Error("Truncated Tieba protobuf field");
      value = bytes.subarray(offset, offset + 8);
      offset += 8;
    } else if (wire === 2) {
      const decoded = readVarint(bytes, offset);
      const length = Number(decoded.value);
      offset = decoded.offset;
      if (!Number.isSafeInteger(length) || offset + length > bytes.length) {
        throw new Error("Invalid Tieba protobuf field length");
      }
      value = bytes.subarray(offset, offset + length);
      offset += length;
    } else if (wire === 5) {
      if (offset + 4 > bytes.length) throw new Error("Truncated Tieba protobuf field");
      value = bytes.subarray(offset, offset + 4);
      offset += 4;
    } else {
      throw new Error(`Unsupported Tieba protobuf wire type ${wire}`);
    }
    const values = fields.get(field) || [];
    values.push(value);
    fields.set(field, values);
  }
  return fields;
}

function values(message, field) {
  return message?.get(field) || [];
}

function first(message, field) {
  return values(message, field)[0];
}

function nested(value) {
  return value instanceof Uint8Array ? decodeMessage(value) : new Map();
}

function nestedField(message, field) {
  return nested(first(message, field));
}

function numberField(message, field) {
  const value = first(message, field);
  return typeof value === "bigint" ? Number(value) : 0;
}

function stringValue(value) {
  return value instanceof Uint8Array ? decoder.decode(value).trim() : "";
}

function stringFieldValue(message, field) {
  return stringValue(first(message, field));
}

function contentText(contentValues) {
  return contentValues
    .map((value) => stringFieldValue(nested(value), 2))
    .filter(Boolean)
    .join("")
    .trim();
}

function contentImages(contentValues) {
  const result = [];
  for (const value of contentValues) {
    const content = nested(value);
    const url = [25, 9, 8, 4, 3]
      .map((field) => stringFieldValue(content, field))
      .find((candidate) => /^(?:https?:)?\/\//i.test(candidate));
    if (!url) continue;
    const normalized = url.startsWith("//") ? `https:${url}` : url.replace(/^http:\/\//i, "https://");
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}

function userModel(message) {
  const id = numberField(message, 2);
  return {
    id: id ? String(id) : stringFieldValue(message, 120),
    name: stringFieldValue(message, 4) || stringFieldValue(message, 3),
  };
}

function agreeCount(message) {
  return numberField(nestedField(message, 37), 1) || numberField(nestedField(message, 126), 1);
}

function isoTime(seconds) {
  const value = Number(seconds) || 0;
  return value > 0 ? new Date(value * 1000).toISOString() : "";
}

function authorFor(message, embeddedField, authorIdField, users) {
  const embedded = userModel(nestedField(message, embeddedField));
  const authorId = numberField(message, authorIdField);
  return embedded.name ? embedded : users.get(authorId) || embedded;
}

function parseNestedComments(post, users) {
  const wrapper = nestedField(post, 15);
  return values(wrapper, 2).map((value, index) => {
    const comment = nested(value);
    const author = authorFor(comment, 7, 4, users);
    return {
      id: String(numberField(comment, 1) || `comment-${index + 1}`),
      author: author.name,
      authorId: author.id,
      body: contentText(values(comment, 2)),
      createdAt: isoTime(numberField(comment, 3)),
      likeCount: numberField(nestedField(comment, 9), 1),
    };
  }).filter((comment) => comment.body);
}

function parsePost(post, users, index) {
  const author = authorFor(post, 23, 19, users);
  return {
    id: String(numberField(post, 1) || `floor-${index + 1}`),
    floor: numberField(post, 3) || index + 1,
    author: author.name,
    authorId: author.id,
    body: contentText(values(post, 5)),
    images: contentImages(values(post, 5)),
    createdAt: isoTime(numberField(post, 4)),
    likeCount: numberField(nestedField(post, 37), 1),
    comments: parseNestedComments(post, users),
  };
}

function parseThreadResponse(input, fallbackPost = {}) {
  const response = decodeMessage(input);
  const error = nestedField(response, 1);
  const errorCode = numberField(error, 1);
  if (errorCode) {
    throw new Error(`Tieba API ${errorCode}: ${stringFieldValue(error, 2) || "request failed"}`);
  }
  const data = nestedField(response, 2);
  const users = new Map(values(data, 13).map((value) => {
    const user = userModel(nested(value));
    return [Number(user.id) || 0, user];
  }));
  const thread = nestedField(data, 8);
  const posts = values(data, 6).map((value, index) => parsePost(nested(value), users, index));
  const firstPost = posts[0];
  const threadAuthor = authorFor(thread, 18, 56, users);
  const opId = threadAuthor.id || firstPost?.authorId || "";
  const opName = threadAuthor.name || firstPost?.author || fallbackPost.author || "";
  const replies = posts.slice(firstPost ? 1 : 0).map((post) => {
    const nestedLines = post.comments.map((comment) => {
      const likes = comment.likeCount > 0 ? `  ♥ ${comment.likeCount}` : "";
      return `↳ ${comment.author || "Reply"}：${comment.body}${likes}`;
    });
    const likes = post.likeCount > 0 ? `\n\n♥ ${post.likeCount}` : "";
    return {
      id: post.id,
      floor: post.floor,
      author: post.author || "Unknown author",
      createdAt: post.createdAt,
      originalPoster: Boolean((opId && post.authorId === opId) || (opName && post.author === opName)),
      body: `${post.body}${likes}${nestedLines.length ? `\n\n${nestedLines.join("\n")}` : ""}`.trim(),
    };
  }).filter((post) => post.body);
  const threadContent = contentText(values(thread, 142));
  const threadImages = contentImages(values(thread, 142));
  const page = nestedField(data, 3);
  return {
    title: stringFieldValue(thread, 3) || fallbackPost.title || "Untitled thread",
    body: firstPost?.body || threadContent || fallbackPost.summary || fallbackPost.title || "",
    images: [...new Set([...(firstPost?.images || []), ...threadImages])],
    author: opName || "Unknown author",
    publishedAt: isoTime(numberField(thread, 45)) || firstPost?.createdAt || fallbackPost.publishedAt || "",
    replyCount: numberField(thread, 4),
    viewCount: numberField(data, 37) || numberField(thread, 5),
    replies,
    hasMore: Boolean(numberField(page, 6)),
  };
}

async function fetchTiebaThreadDetail(context, post, page = 1) {
  const request = multipartBody(buildThreadRequest(post.id, page, 20));
  const response = await context.http.fetch(THREAD_DETAIL_URL, {
    method: "POST",
    timeoutMs: 30_000,
    headers: {
      "User-Agent": `aiotieba/${APP_VERSION}`,
      "x_bd_data_type": "protobuf",
      "Accept-Encoding": "gzip",
      Connection: "keep-alive",
      Host: APP_BASE_HOST,
      "Content-Type": `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
    },
    bodyBase64: bytesToBase64(request),
  });
  if (!response?.ok) throw new Error(`Tieba API HTTP ${response?.status || "error"}`);
  return parseThreadResponse(new Uint8Array(await response.arrayBuffer()), post);
}

export {
  buildThreadRequest,
  fetchTiebaThreadDetail,
  multipartBody,
  parseThreadResponse,
};
