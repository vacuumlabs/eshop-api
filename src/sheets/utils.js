export function formatAsHyperlink(url, name) {
  return `=HYPERLINK("${url}", "${sheetsEscapeString(name)}")`
}

export function formatDate(dateStr) {
  return Math.round(
    (Date.parse(`${dateStr}UTC`) - Date.parse('1899-12-30UTC')) /
      (1000 * 60 * 60 * 24),
  )
}

function sheetsEscapeString(str) {
  return str.replace('"', '""')
}
