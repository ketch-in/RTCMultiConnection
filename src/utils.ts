export function getRandomString() {
  if (
    window.crypto &&
    window.crypto.getRandomValues &&
    navigator.userAgent.indexOf("Safari") === -1
  ) {
    return window.crypto
      .getRandomValues(new Uint32Array(3))
      .reduce((token, value) => token + value.toString(36), "");
  }
  return (Math.random() * new Date().getTime()).toString(36).replace(/\./g, "");
}

export function isString(obj): boolean {
  return typeof obj === "string";
}

export function getTracks(stream: MediaStream, kind: string) {
  if (!stream || !stream.getTracks) {
    return [];
  }

  return stream.getTracks().filter(function (t) {
    return t.kind === (kind || "audio");
  });
}
