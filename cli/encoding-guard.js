export function validateEncoding(buffer) {
  const text = buffer.toString('utf8')
  if (text.includes('\uFFFD')) {
    process.stderr.write("Error: Input encoding is not UTF-8. Hint: Try 'iconv -f ISO-8859-1 -t UTF-8' if your source is legacy German encoding.\n")
    process.exit(1)
  }
  return text
}
