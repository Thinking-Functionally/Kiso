/** Escape a Clojure name into a valid AS identifier fragment (injective). */
export function mangle(name: string): string {
  let out = '';
  for (const ch of name) {
    if (/[A-Za-z0-9]/.test(ch)) out += ch;
    else out += `_${ch.codePointAt(0)!.toString(16)}_`;
  }
  return out;
}

